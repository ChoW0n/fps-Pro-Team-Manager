/**
 * 미리 계산한 리플레이가 아니라, 실제 10Hz 전술 AI 세션을 한 틱씩 중계합니다.
 * 화면의 탄환·탄착·사망·카메라는 세션이 방금 남긴 기록만 사용합니다.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Operator, OperatorSide } from '../domain/Operator';
import type { Role as OperatorRole } from '../domain/Player';
import { TacticalRealtimeSimulation, type RealtimeEvent, type RealtimeSnapshot, type RealtimeTick, type TacticalDirectorCommand, type TacticalRealtimeSimulationInput, type TacticalRealtimeResult } from '../domain/realtime/TacticalRealtimeSimulation';
import { BREACHLINE_MAP, type TacticalMapDefinition, type TacticalPoint } from '../domain/tacticalMaps';

const ROLE_LABELS: Record<OperatorRole, string> = {
  SEARCH: '수색',
  ENTRY: '진입',
  FIREPOWER: '화력',
  DEFENSIVE_SETUP: '수비설계',
  BLOCKING: '차단',
};
const ROLE_SHAPES: Record<OperatorRole, string> = {
  SEARCH: 'triangle',
  ENTRY: 'chevron',
  FIREPOWER: 'square',
  DEFENSIVE_SETUP: 'diamond',
  BLOCKING: 'hex',
};
const TEAM_COLORS: Record<OperatorSide, string> = { 공격: '#2FD4C4', 수비: '#F0873C' };
const PHASE_LABELS = ['배치', '수색', '진입', '교전', '종료'] as const;
type LivePhase = typeof PHASE_LABELS[number];

interface CameraState { x: number; y: number; zoom: number }
interface LiveEffectEvent extends RealtimeEvent { receivedAt: number }

export interface TacticalRoundLiveProps {
  input: TacticalRealtimeSimulationInput;
  map?: TacticalMapDefinition;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function distance(a: TacticalPoint, b: TacticalPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: TacticalPoint, b?: TacticalPoint): TacticalPoint {
  return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function operatorForCallSign(input: TacticalRealtimeSimulationInput, callSign: string): Operator | undefined {
  return [...input.attackers, ...input.defenders].find((unit) => unit.operator.callSign === callSign)?.operator;
}

function unitSide(input: TacticalRealtimeSimulationInput, callSign: string): OperatorSide | undefined {
  return [...input.attackers, ...input.defenders].find((unit) => unit.operator.callSign === callSign)?.side;
}

function eventLabel(event: RealtimeEvent, input: TacticalRealtimeSimulationInput): { title: string; detail: string; tone: string } {
  const actor = event.actor && event.actor !== 'director'
    ? event.actor.split(':')[2] ?? event.actor
    : '감독';
  const target = event.target ? event.target.split(':')[2] ?? event.target : '';
  if (event.type === 'shot') return { title: `${actor} → ${target} 발사`, detail: event.hit ? '실제 명중 판정 대기' : '실제 탄선 기록 · 빗나감', tone: unitSide(input, actor) === '수비' ? 'defend' : 'attack' };
  if (event.type === 'impact') return { title: `${target} 탄착`, detail: event.hit ? '실제 피해 이벤트' : '탄착 없음', tone: 'danger' };
  if (event.type === 'death') return { title: `${target} 전투 이탈`, detail: '실제 사망 이벤트 · 현재 위치 고정', tone: 'danger' };
  if (event.type === 'sound') return { title: event.message === '총성' ? '총성 감지' : '발소리 감지', detail: `${actor} 위치의 실제 소리`, tone: 'info' };
  if (event.type === 'objective') return { title: '감독 지시 적용', detail: event.message.replace('감독 지시: ', ''), tone: 'objective' };
  const action = event.message.split(': ').at(-1) ?? 'hold';
  const actionNames: Record<string, string> = {
    approach: '진입 경로 이동',
    search: '마지막 정보 수색',
    hold: '각 유지',
    reposition: '후퇴·재배치',
    aim: '시야 확보 후 조준',
    fire: '발사 판단',
    dead: '전투 이탈',
    'take-cover': '엄폐 진입',
  };
  return { title: `${actor} · ${actionNames[action] ?? action}`, detail: event.goal ?? 'AI 판단이 다음 틱에 반영됨', tone: unitSide(input, actor) === '수비' ? 'defend' : 'attack' };
}

function eventPriority(event: RealtimeEvent, events: RealtimeEvent[], now: number): number {
  const age = Math.max(0, now - event.time);
  if (age > 3.5) return -1;
  const base = event.type === 'death' ? 1200
    : event.type === 'impact' ? 900
      : event.type === 'shot' ? 760
        : event.type === 'objective' ? 560
          : event.type === 'sound' ? 340 : 180;
  const firstContact = event.type === 'shot' && events.filter((candidate) => candidate.type === 'shot' && candidate.time <= event.time).length === 1;
  const clutch = event.type === 'shot' && event.actor && events.filter((candidate) => candidate.type === 'shot' && candidate.time >= event.time - 1.5 && candidate.time <= event.time + 1.5).length >= 3;
  return base + (firstContact ? 240 : 0) + (clutch ? 260 : 0) - age * 90;
}

function phaseFor(snapshot: RealtimeSnapshot | null, events: RealtimeEvent[], complete: boolean): LivePhase {
  if (complete) return '종료';
  if (!snapshot || snapshot.time < 1.5) return '배치';
  if (snapshot.time < 12) return '수색';
  if (!events.some((event) => event.type === 'shot')) return '진입';
  return '교전';
}

function shapePoints(shape: string, x: number, y: number, size: number): string {
  if (shape === 'triangle') return `${x},${y - size} ${x + size},${y + size} ${x - size},${y + size}`;
  if (shape === 'chevron') return `${x - size},${y - size} ${x + size * 0.2},${y - size} ${x + size},${y} ${x + size * 0.2},${y + size} ${x - size},${y + size} ${x - size * 0.15},${y}`;
  if (shape === 'diamond') return `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`;
  if (shape === 'hex') return `${x - size * .7},${y - size} ${x + size * .7},${y - size} ${x + size},${y} ${x + size * .7},${y + size} ${x - size * .7},${y + size} ${x - size},${y}`;
  return `${x - size},${y - size} ${x + size},${y - size} ${x + size},${y + size} ${x - size},${y + size}`;
}

function MapLayer({ map }: { map: TacticalMapDefinition }): ReactElement {
  return (
    <g className="live-map-layer">
      <rect x="0" y="0" width={map.width} height={map.height} className="live-map-floor" />
      {Array.from({ length: Math.floor(map.width / 50) + 1 }, (_, index) => (
        <line key={`gx-${index}`} x1={index * 50} y1="0" x2={index * 50} y2={map.height} className="live-map-grid" />
      ))}
      {Array.from({ length: Math.floor(map.height / 50) + 1 }, (_, index) => (
        <line key={`gy-${index}`} x1="0" y1={index * 50} x2={map.width} y2={index * 50} className="live-map-grid" />
      ))}
      <rect {...map.building} className="live-building" />
      <rect {...map.entryHall} className="live-entry-hall" />
      <rect {...map.objectiveZone} className="live-objective-zone" />
      <text x={map.objectiveZone.x + 18} y={map.objectiveZone.y + 28} className="live-zone-label">SITE / OBJECTIVE</text>
      {map.walls.map((wall, index) => (
        <line key={`wall-${index}`} x1={wall.from.x} y1={wall.from.y} x2={wall.to.x} y2={wall.to.y} className={`live-wall live-wall-${wall.kind}`} />
      ))}
      {map.covers.map((cover) => (
        <g key={cover.id}>
          <rect {...cover.rect} className="live-cover" />
          <text x={cover.rect.x + 5} y={cover.rect.y + 14} className="live-cover-label">{cover.label}</text>
        </g>
      ))}
      {map.attackerRoutes.map((route) => (
        <g key={route.id} className="live-route">
          <polyline points={route.points.map((point) => `${point.x},${point.y}`).join(' ')} />
          <text x={route.points[1].x} y={route.points[1].y - 10} className="live-route-label">{route.label}</text>
        </g>
      ))}
      <text x={map.attackerSpawn.x} y={map.attackerSpawn.y - 18} className="live-map-code live-map-code-attack">ATK / ENTRY</text>
      <text x={map.defenderSpawn.x} y={map.defenderSpawn.y - 18} className="live-map-code live-map-code-defend">DEF / SITE</text>
    </g>
  );
}

function UnitToken({
  unit,
  operator,
  cameraZoom,
}: {
  unit: RealtimeSnapshot['units'][number];
  operator: Operator;
  cameraZoom: number;
}): ReactElement {
  const size = 16 / cameraZoom;
  const color = TEAM_COLORS[unit.side];
  const damaged = unit.alive && unit.hp < 100;
  const dead = !unit.alive;
  const shape = ROLE_SHAPES[operator.role];
  return (
    <g className={`live-unit live-unit-${unit.side === '공격' ? 'attack' : 'defend'} ${damaged ? 'is-damaged' : ''} ${dead ? 'is-dead' : ''}`}>
      <title>{operator.callSign} · {ROLE_LABELS[operator.role]} · {unit.action}</title>
      <polygon points={shapePoints(shape, unit.position.x, unit.position.y, size)} fill={unit.side === '공격' && unit.alive ? color : 'transparent'} stroke={color} strokeWidth={2 / cameraZoom} />
      {damaged && <line x1={unit.position.x - size} y1={unit.position.y - size} x2={unit.position.x + size} y2={unit.position.y + size} className="live-damage-mark" strokeWidth={2 / cameraZoom} />}
      {dead && <g className="live-death-mark"><line x1={unit.position.x - size} y1={unit.position.y - size} x2={unit.position.x + size} y2={unit.position.y + size} /><line x1={unit.position.x + size} y1={unit.position.y - size} x2={unit.position.x - size} y2={unit.position.y + size} /></g>}
      <text x={unit.position.x + size + 6 / cameraZoom} y={unit.position.y + 3 / cameraZoom} className="live-unit-label">{operator.callSign}</text>
      {damaged && <text x={unit.position.x} y={unit.position.y - size - 5 / cameraZoom} textAnchor="middle" className="live-hp-label">{Math.ceil(unit.hp)}</text>}
    </g>
  );
}

function LiveMap({
  map,
  snapshot,
  input,
  events,
  now,
  camera,
  focus,
}: {
  map: TacticalMapDefinition;
  snapshot: RealtimeSnapshot | null;
  input: TacticalRealtimeSimulationInput;
  events: RealtimeEvent[];
  now: number;
  camera: CameraState;
  focus: RealtimeEvent | undefined;
}): ReactElement {
  const viewWidth = map.width / camera.zoom;
  const viewHeight = map.height / camera.zoom;
  const viewX = clamp(camera.x - viewWidth / 2, 0, map.width - viewWidth);
  const viewY = clamp(camera.y - viewHeight / 2, 0, map.height - viewHeight);
  const units = snapshot?.units ?? [];
  const operatorMap = new Map([...input.attackers, ...input.defenders].map((item) => [item.operator.callSign, item.operator]));
  const recentShots = events.filter((event) => event.type === 'shot' && event.position && event.targetPosition && now - event.time >= 0 && now - event.time < .42);
  const recentImpacts = events.filter((event) => event.type === 'impact' && event.position && now - event.time >= 0 && now - event.time < .55);
  return (
    <svg className="live-map-svg" viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`} role="img" aria-label="실시간 전술 작전 도면">
      <MapLayer map={map} />
      <g className="live-shot-layer">
        {recentShots.map((shot, index) => {
          const progress = clamp((now - shot.time) / Math.max(.18, distance(shot.position!, shot.targetPosition!) / 900), 0, 1);
          const x = shot.position!.x + (shot.targetPosition!.x - shot.position!.x) * progress;
          const y = shot.position!.y + (shot.targetPosition!.y - shot.position!.y) * progress;
          return <line key={`shot-${shot.time}-${index}`} x1={shot.position!.x} y1={shot.position!.y} x2={x} y2={y} className="live-shot" stroke={unitSide(input, shot.actor ?? '') === '수비' ? TEAM_COLORS.수비 : TEAM_COLORS.공격} />;
        })}
        {recentImpacts.map((impact, index) => (
          <circle key={`impact-${impact.time}-${index}`} cx={impact.position!.x} cy={impact.position!.y} r={6 + (now - impact.time) * 18} className="live-impact" />
        ))}
      </g>
      <g className="live-focus-marker">
        {focus?.position && <circle cx={midpoint(focus.position, focus.targetPosition).x} cy={midpoint(focus.position, focus.targetPosition).y} r={28 / camera.zoom} />}
      </g>
      {units.map((unit) => {
        const operator = operatorMap.get(unit.callSign);
        return operator ? <UnitToken key={unit.id} unit={unit} operator={operator} cameraZoom={camera.zoom} /> : null;
      })}
    </svg>
  );
}

export function TacticalRoundLive({ input, map = BREACHLINE_MAP }: TacticalRoundLiveProps): ReactElement {
  const sessionRef = useRef<ReturnType<TacticalRealtimeSimulation['createSession']> | null>(null);
  const [tick, setTick] = useState<RealtimeTick | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [result, setResult] = useState<TacticalRealtimeResult | null>(null);
  const [lastOrder, setLastOrder] = useState('자율 판단 중');
  const [camera, setCamera] = useState<CameraState>({ x: map.width / 2, y: map.height / 2, zoom: 1 });
  const [now, setNow] = useState(0);

  useEffect(() => {
    const session = new TacticalRealtimeSimulation(map).createSession(input);
    sessionRef.current = session;
    setTick(null);
    setEvents([]);
    setResult(null);
    setLastOrder('자율 판단 중');
    setCamera({ x: map.width / 2, y: map.height / 2, zoom: 1 });
    const acceptTick = (next: RealtimeTick | undefined): void => {
      if (!next) {
        setResult(session.getResult());
        return;
      }
      setTick(next);
      setNow(next.time);
      setEvents((current) => [...current, ...next.events].slice(-180));
    };
    acceptTick(session.step());
    const timer = window.setInterval(() => {
      if (session.isComplete) {
        setResult(session.getResult());
        return;
      }
      acceptTick(session.step());
    }, 100);
    return () => {
      window.clearInterval(timer);
      sessionRef.current = null;
    };
  }, [input, map]);

  useEffect(() => {
    if (!result) return;
    void import('../domain/consoleOutput')
      .then(({ printRealtimeProcessValidationToConsole }) => printRealtimeProcessValidationToConsole(result))
      .catch((error) => console.error('실시간 라운드 검증 콘솔을 불러오지 못했습니다.', error));
  }, [result]);

  const snapshot = tick?.snapshot ?? null;
  const phase = phaseFor(snapshot, events, Boolean(result));
  const focus = useMemo(() => events
    .filter((event) => event.position)
    .map((event) => ({ event, score: eventPriority(event, events, now) }))
    .sort((a, b) => b.score - a.score)[0]?.event, [events, now]);
  const focusPoint = focus?.position ? midpoint(focus.position, focus.targetPosition) : { x: map.width / 2, y: map.height / 2 };
  const cameraTarget: CameraState = focus && eventPriority(focus, events, now) > 250
    ? { x: focusPoint.x, y: focusPoint.y, zoom: phase === '교전' ? 1.75 : 1.35 }
    : { x: map.width / 2, y: map.height / 2, zoom: 1 };
  useEffect(() => {
    let frame = 0;
    const animate = (): void => {
      setCamera((current) => ({
        x: current.x + (cameraTarget.x - current.x) * .11,
        y: current.y + (cameraTarget.y - current.y) * .11,
        zoom: current.zoom + (cameraTarget.zoom - current.zoom) * .11,
      }));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [cameraTarget.x, cameraTarget.y, cameraTarget.zoom]);

  const liveOperators = useMemo(() => new Map(
    [...input.attackers, ...input.defenders].map((item) => [item.operator.callSign, item.operator]),
  ), [input]);
  const aliveAttackers = snapshot?.units.filter((unit) => unit.side === '공격' && unit.alive).length ?? 5;
  const aliveDefenders = snapshot?.units.filter((unit) => unit.side === '수비' && unit.alive).length ?? 5;
  const objective = snapshot?.units.filter((unit) => unit.side === '공격' && unit.position.x >= map.objectiveZone.x && unit.position.x <= map.objectiveZone.x + map.objectiveZone.width && unit.position.y >= map.objectiveZone.y && unit.position.y <= map.objectiveZone.y + map.objectiveZone.height).length ?? 0;
  const defenderNearObjective = snapshot?.units.filter((unit) => unit.side === '수비' && distance(unit.position, { x: map.objectiveZone.x + map.objectiveZone.width / 2, y: map.objectiveZone.y + map.objectiveZone.height / 2 }) < 180).length ?? 0;
  const recentEvents = events.slice(-9).reverse();
  const secondsLeft = result ? 0 : Math.max(0, (input.maxSeconds ?? 180) - now);
  const issueOrder = (command: TacticalDirectorCommand): void => {
    const next = sessionRef.current?.step(command);
    if (next) {
      setTick(next);
      setNow(next.time);
      setEvents((current) => [...current, ...next.events].slice(-180));
    }
    setLastOrder(command.label);
  };
  const attackCommand = (mode: TacticalDirectorCommand['mode'], label: string, routeIndex?: number): void => {
    issueOrder({ side: '공격', mode, routeIndex, label });
  };

  return (
    <section className="live-round" aria-label="실시간 전술 FPS 라운드 중계">
      <header className="live-round-header">
        <div>
          <div className="live-kicker">LIVE OPS / ROUND 01 / BREACHLINE</div>
          <h1>실시간 작전 중계</h1>
          <p>감독 지시는 다음 AI 틱부터 이동·시야·교전 판단에 반영됩니다.</p>
        </div>
        <div className="live-status"><span /> LIVE / 10 HZ</div>
      </header>

      <section className="live-priority-bar" aria-label="라운드 핵심 상태">
        <div className="live-phase-readout"><span>PHASE</span><strong>{phase}</strong></div>
        <div className="live-round-score"><span>ROUND SCORE</span><strong>공격 {result?.winner === '공격' ? 1 : 0} — {result?.winner === '수비' ? 1 : 0} 수비</strong></div>
        <div className="live-survivors">
          <div className="live-team-readout live-team-attack"><b>{aliveAttackers}</b><span>공격 생존</span></div>
          <i>:</i>
          <div className="live-team-readout live-team-defend"><b>{aliveDefenders}</b><span>수비 생존</span></div>
        </div>
      </section>

      <div className="live-round-grid">
        <main className="live-map-panel">
          <div className="live-panel-heading">
            <div><span>CAMERA / {focus ? 'EVENT FOCUS' : 'FULL MAP'}</span><h2>{map.name}</h2></div>
            <div className="live-camera-note">{focus ? eventLabel(focus, input).title : '활성 사건 없음 · 전체 작전 도면'}</div>
          </div>
          <div className="live-map-frame">
            <LiveMap map={map} snapshot={snapshot} input={input} events={events} now={now} camera={camera} focus={focus} />
            <div className="live-map-overlay"><span>{phase} / {formatClock(secondsLeft)}</span><strong>{focus ? eventLabel(focus, input).title : '각 팀이 담당 구역을 유지 중'}</strong></div>
            <div className="live-map-legend">
              <span><i className="legend-symbol legend-filled" />공격</span>
              <span><i className="legend-symbol legend-outline" />수비</span>
              <span><i className="legend-symbol legend-diamond" />수비설계</span>
              <span><i className="legend-symbol legend-shot" />실제 탄선</span>
            </div>
          </div>
          <div className="live-objective-strip">
            <span>OBJECTIVE</span>
            <strong>{objective > 0 ? `공격 진입 ${objective}명` : '공격 진입 전'}</strong>
            <i>·</i>
            <span>수비 근접 {defenderNearObjective}명</span>
            <em>{camera.zoom > 1.1 ? '카메라 추적 중' : '전체 도면'}</em>
          </div>
        </main>

        <aside className="live-side-panel">
          <section className="live-director-panel">
            <div className="live-section-label"><span>DIRECTOR INPUT</span><b>공격팀 지시</b></div>
            <p className="live-order-status">{lastOrder}</p>
            <div className="live-command-grid">
              <button type="button" onClick={() => attackCommand('push', '밀어붙여라')}>밀어붙여라</button>
              <button type="button" onClick={() => attackCommand('hold', '신중하게 각을 잡고 대기')}>각을 잡아라</button>
              <button type="button" onClick={() => attackCommand('retreat', '물러나라')}>물러나라</button>
              <button type="button" onClick={() => attackCommand('route', '북쪽 진입로로 전환', 0)}>북쪽 진입</button>
              <button type="button" onClick={() => attackCommand('route', '중앙 진입로로 전환', 2)}>중앙 진입</button>
              <button type="button" onClick={() => attackCommand('route', '남쪽 진입로로 전환', 4)}>남쪽 진입</button>
            </div>
          </section>
          <section className="live-log-panel">
            <div className="live-section-label"><span>EVENT STREAM</span><b>{events.length.toString().padStart(3, '0')}</b></div>
            <div className="live-event-list">
              {recentEvents.map((event, index) => {
                const display = eventLabel(event, input);
                return (
                  <article key={`${event.time}-${event.type}-${index}`} className={`live-event live-event-${display.tone} ${index === 0 ? 'is-latest' : ''}`}>
                    <time>{formatClock(event.time)}</time><div><strong>{display.title}</strong><small>{display.detail}</small></div>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      <section className="live-detail-grid">
        <div className="live-unit-panel">
          <div className="live-section-label"><span>OPERATOR STATUS / DETAIL</span><b>실제 스냅샷</b></div>
          <div className="live-unit-grid">
            {(snapshot?.units ?? input.attackers.concat(input.defenders).map((unit, index) => ({
              id: unit.player.nickname + index,
              teamName: unit.teamName,
              side: unit.side,
              callSign: unit.operator.callSign,
              position: unit.side === '공격' ? map.attackerSpawn : map.defenderSpawn,
              velocity: { x: 0, y: 0 },
              facing: 0,
              hp: 100,
              ammo: 30,
              cooldown: 0,
              goal: '틱 시작 대기',
              action: 'hold' as const,
              routeIndex: index,
              routeStep: 0,
              knowledge: { confidence: 0 },
              alive: true,
            }))).map((unit) => {
              const operator = liveOperators.get(unit.callSign);
              if (!operator) return null;
              return (
                <div key={unit.id} className={`live-unit-card live-unit-card-${unit.side === '공격' ? 'attack' : 'defend'} ${!unit.alive ? 'is-dead' : ''}`}>
                  <span className={`live-mini-shape live-mini-${ROLE_SHAPES[operator.role]} ${unit.side === '공격' ? 'is-filled' : ''}`} />
                  <div><strong>{unit.callSign}</strong><small>{ROLE_LABELS[operator.role]} · {unit.action}</small></div>
                  {unit.hp < 100 && <b className="live-unit-hp">{Math.ceil(unit.hp)}</b>}
                  {!unit.alive && <b className="live-unit-dead">OUT</b>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="live-legend-panel">
          <div className="live-section-label"><span>ROLE MARKERS</span><b>형태로 구분</b></div>
          <div className="live-role-legend">
            {(Object.keys(ROLE_LABELS) as OperatorRole[]).map((role) => <span key={role}><i className={`live-mini-shape live-mini-${ROLE_SHAPES[role]}`} />{ROLE_LABELS[role]}</span>)}
          </div>
          <p>공격은 채운 도형, 수비는 테두리 도형입니다. 체력 저하는 사선, 전투 이탈은 X 표식으로 표시합니다.</p>
        </div>
      </section>

      {result && (
        <section className="live-result-panel">
          <span>ROUND COMPLETE / PROCESS CHECKED</span>
          <strong>{result.winner === '공격' ? '공격 승리' : result.winner === '수비' ? '수비 승리' : '무승부'}</strong>
          <small>실제 발사 {result.validation.shots} · 탄착 {result.validation.impacts} · 벽 관통 {result.validation.wallBangCount} · 수색 {result.validation.searchPhase.duration.toFixed(1)}초</small>
        </section>
      )}
    </section>
  );
}