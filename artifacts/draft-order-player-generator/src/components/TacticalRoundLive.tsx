/** 기존 경기 경로에서 같은 10Hz 세션의 실제 사건과 인물 리소스를 중계합니다. */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { OperatorSide } from '../domain/Operator';
import { OPERATOR_ROLE_LABELS } from '../domain/Operator';
import { TacticalRealtimeSimulation, realtimeUnitId, type RealtimeEvent, type RealtimeTick, type TacticalDirectorCommand, type TacticalRealtimeSimulationInput, type TacticalRealtimeResult } from '../domain/realtime/TacticalRealtimeSimulation';
import { BOMB_RESULT_LABELS } from '../domain/realtime/BombObjective';
import { BREACHLINE_MAP, type TacticalMapDefinition } from '../domain/tacticalMaps';
import { operatorVisual } from '../domain/operatorVisuals';
import { TacticalBattlefield, portraitUrl, SIDE_COLOR } from './TacticalBattlefield';
import './tacticalBroadcast.css';

export interface TacticalRoundLiveProps { input: TacticalRealtimeSimulationInput; map?: TacticalMapDefinition }
const ACTIONS = { approach: '진입 중', search: '정보 확인', hold: '각 유지', 'take-cover': '엄폐', reposition: '재배치', aim: '조준', fire: '사격', reload: '장전', dead: '전투 이탈', plant: '장치 설치', disable: '장치 무력화' };

/** 남은 라운드 시간을 방송용 분·초로 표시합니다. */
function clock(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** 틱 소비·선수 선택·카메라 상태를 분리해 화면 조작이 난수 순서를 바꾸지 않게 합니다. */
export function TacticalRoundLive({ input, map = BREACHLINE_MAP }: TacticalRoundLiveProps): ReactElement {
  const [tick, setTick] = useState<RealtimeTick | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [result, setResult] = useState<TacticalRealtimeResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'full' | 'follow' | 'broadcast'>('broadcast');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoCameraId, setAutoCameraId] = useState<string | null>(null);
  const cameraSince = useRef(0);
  const [contact, setContact] = useState(false);
  const [lastOrder, setLastOrder] = useState('자율 작전 진행');
  const controls = useRef({ paused: false, speed: 1 });
  const orders = useRef<TacticalDirectorCommand[]>([]);
  const sessionRef = useRef<ReturnType<TacticalRealtimeSimulation['createSession']> | null>(null);
  controls.current = { paused, speed };
  const participants = useMemo(() => new Map([...input.attackers, ...input.defenders].map((unit, index) => [realtimeUnitId(unit, index), unit])), [input]);
  const operators = useMemo(() => new Map([...participants].map(([id, unit]) => [id, unit.operator])), [participants]);

  useEffect(() => {
    const session = new TacticalRealtimeSimulation(map).createSession(input);
    sessionRef.current = session;
    orders.current = [];
    setEvents([]); setResult(null); setContact(false); setLastOrder('자율 작전 진행');
    setSelectedId(realtimeUnitId(input.attackers[0], 0)); setAutoCameraId(realtimeUnitId(input.attackers[0], 0)); cameraSince.current = 0; setPaused(false);
    /** 세션이 만든 틱만 반영하며 사건 버퍼와 카메라는 엔진에 되먹이지 않습니다. */
    const consume = (): void => {
      const next = session.step(orders.current.shift());
      if (next) {
        setTick(next);
        if (next.events.some(event => event.type === 'shot')) setContact(true);
        setEvents(previous => [...previous, ...next.events].slice(-240));
      } else setResult(session.getResult());
    };
    consume();
    const timer = window.setInterval(() => {
      if (session.isComplete) { window.clearInterval(timer); return; }
      if (!controls.current.paused) for (let index = 0; index < controls.current.speed && !session.isComplete; index += 1) consume();
    }, 100);
    return () => { window.clearInterval(timer); sessionRef.current = null; };
  }, [input, map]);

  const units = tick?.snapshot.units ?? [];
  const time = tick?.time ?? 0;
  const selected = units.find(unit => unit.id === selectedId);
  const source = selectedId ? participants.get(selectedId) : undefined;
  const portrait = selected ? portraitUrl(selected.callSign) : undefined;
  const lastShot = [...events].reverse().find(event => event.type === 'shot' && time - event.time < 4);
  useEffect(() => {
    const current = units.find(unit => unit.id === autoCameraId);
    if (current?.alive && time - cameraSince.current < 4) return;
    const candidate = lastShot?.actor ?? units.find(unit => unit.alive && unit.side === '공격')?.id;
    if (candidate && candidate !== autoCameraId) { setAutoCameraId(candidate); cameraSince.current = time; }
  }, [time, units, lastShot, autoCameraId]);
  const cameraUnit = cameraMode === 'follow' ? selected
    : units.find(unit => unit.id === autoCameraId) ?? units.filter(unit => unit.side === '공격' && unit.alive).sort((left, right) => right.position.x - left.position.x)[0];
  const zoom = cameraMode === 'full' ? 1 : cameraMode === 'follow' ? 5.8 : 4.5;
  const width = map.width / zoom, height = map.height / zoom;
  const x = Math.max(0, Math.min(map.width - width, (cameraUnit?.position.x ?? map.width / 2) - width / 2));
  const y = Math.max(0, Math.min(map.height - height, (cameraUnit?.position.y ?? map.height / 2) - height / 2));
  const objective = tick?.snapshot.objective;
  const activeDevice = objective?.phase === 'active' || objective?.phase === 'disabling';
  const objectiveLabel = objective?.phase === 'planting' ? '해체 장치 설치 중' : objective?.phase === 'disabling' ? '수비팀 장치 무력화 중' : activeDevice ? '장치 가동 · 공격팀 엄호' : objective?.phase === 'dropped' ? '해체 장치 유실 · 회수 필요' : '공격팀 설치 / 수비팀 폭탄 방어';
  const operation=tick?.snapshot.operation;
  const operationLabels={scouting:'선발조 수색',returning:'선발조 복귀',regrouping:'진압조 합류',entering:'진입'};
  const phase = result ? '라운드 종료' : activeDevice ? '설치 후 교전' : objective?.phase === 'planting' ? '설치' : operation&&operation.phase!=='entering' ? operationLabels[operation.phase] : contact ? '교전' : '진입';
  const secondsLeft = Math.max(0, (activeDevice ? objective!.activeUntil! : input.maxSeconds ?? 180) - time);
  const logs = events.filter(event => ['shot', 'death', 'reload', 'objective', 'intel'].includes(event.type)).slice(-5).reverse();

  /** 명령은 다음 예정 틱에 적용하며 클릭 자체가 경기 시간을 전진시키지 않습니다. */
  function issueOrder(mode: TacticalDirectorCommand['mode'], label: string, routeIndex?: number): void {
    if (sessionRef.current?.isComplete) return;
    orders.current.push({ side: '공격', mode, label, routeIndex });
    setLastOrder(`${label} · 다음 틱 전달`);
  }
  /** 선택은 참가자 ID에만 연결하고 확대 시 해당 선수의 실제 위치를 추적합니다. */
  function selectUnit(id: string): void { setSelectedId(id); setCameraMode('follow'); }
  /** 이름 표시에도 참가자 ID를 사용해 양 팀의 동일 콜사인을 구분합니다. */
  function name(id?: string): string { return id === 'director' ? '감독' : participants.get(id ?? '')?.operator.callSign ?? '현장'; }
  /** 사건에 기록된 종류만 읽어 짧은 방송 로그를 만듭니다. */
  function eventText(event: RealtimeEvent): string {
    if (event.type === 'shot') return `${name(event.actor)} → ${name(event.target)} 사격`;
    if (event.type === 'death') return `${name(event.target)} 전투 이탈`;
    if (event.type === 'intel') return `${name(event.actor)} · ${event.message}`;
    return event.message;
  }

  return <section className="broadcast" aria-label="실시간 전술 FPS 라운드 중계" data-version="bomb-ai-20260910-v2">
    <header className="broadcast-heading"><div><span className="broadcast-eyebrow">DRAFT ORDER / LIVE MATCH</span><h1>북부 연구동</h1></div><div className="broadcast-meta"><span>ROUND 01 · {phase}</span><b>{result ? 'FINAL' : paused ? 'PAUSED' : 'LIVE'}</b></div></header>
    <div className="broadcast-scoreboard">
      {(['공격', '수비'] as OperatorSide[]).map((side, index) => <div key={side} className={`broadcast-team team-${index}`}>
        <small style={{color:SIDE_COLOR[side]}}>{side === '공격' ? 'ATK / 공격' : 'DEF / 수비'}</small>
        <strong>{(side === '공격' ? input.attackers : input.defenders)[0]?.teamName}</strong>
        <span className="broadcast-alive" style={{color:SIDE_COLOR[side]}}>{units.filter(unit => unit.side === side && unit.alive).length}<small> ALIVE</small></span>
      </div>)}
      <div className="broadcast-clock"><b>{clock(secondsLeft)}</b><span>{result ? `${result.winner} ${result.winner === '무승부' ? '' : '승리'}` : activeDevice ? '폭탄 해체까지' : '설치 제한 시간'}</span></div>
    </div>
    <div className={`broadcast-objective ${activeDevice ? 'is-active' : ''}`} role="status" aria-live="polite">
      <strong>{objective?.siteId ?? input.targetSite ?? 'A'} <span>SITE</span></strong>
      <div><b>{result && objective?.reason ? BOMB_RESULT_LABELS[objective.reason] : objectiveLabel}</b>
        <small>{objective?.carrierId ? `운반자 ${participants.get(objective.carrierId)?.operator.callSign ?? '확인 중'}` : activeDevice ? '수비는 작동 중인 장치를 무력화해야 합니다' : 'A/B 중 한 곳에 설치하여 엄호하세요'}</small>
      </div>
      {(objective?.phase === 'planting' || objective?.phase === 'disabling') && <progress aria-label={objectiveLabel} max="1" value={objective.progress} />}
      <span className="broadcast-objective-rule">설치 7초 · 무력화 7초 · 작동 45초</span>
    </div>
    <div className="broadcast-layout">
      <div className="broadcast-stage">
        <div className="broadcast-toolbar"><div className="broadcast-camera" aria-label="카메라 선택">
          <button aria-pressed={cameraMode === 'broadcast'} onClick={() => setCameraMode('broadcast')}>자동 중계</button>
          <button aria-pressed={cameraMode === 'full'} onClick={() => setCameraMode('full')}>전체 전황</button>
          <button aria-pressed={cameraMode === 'follow'} onClick={() => setCameraMode('follow')}>선수 확대</button>
        </div><div className="broadcast-playback">
          <button disabled={Boolean(result)} onClick={() => setPaused(value => !value)}>{paused ? '재생' : '일시정지'}</button>
          <select aria-label="중계 속도" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </div></div>
        <div className="broadcast-map-frame">
          <TacticalBattlefield map={map} units={units} operators={operators} events={events} time={time} objective={objective} selectedId={selectedId} onSelect={selectUnit} viewBox={`${x} ${y} ${width} ${height}`} />
          <div className="broadcast-camera-caption"><b>{cameraMode === 'full' ? '전술 전체 보기' : `${cameraUnit?.callSign ?? '현장'} / ${zoom.toFixed(1)}×`}</b><span>{cameraUnit ? ACTIONS[cameraUnit.action] : phase}</span></div>
          {cameraMode !== 'full' && <div className="broadcast-minimap"><span>전체 전황</span><TacticalBattlefield map={map} units={units} operators={operators} events={[]} time={time} selectedId={cameraUnit?.id ?? null} onSelect={selectUnit} miniature /></div>}
        </div>
        <div className="broadcast-map-footer"><span>{operation ? `${operationLabels[operation.phase]} · 선발조 ${operation.scoutIds.length}명　` : ''}● 공격　◌ 수비　<span style={{color:'#FFC53D'}}>A / B</span> 폭탄 사이트</span><span>선수 또는 카드를 선택해 확대</span></div>
      </div>
      <aside className="broadcast-sidebar">
        <section className="broadcast-selected" aria-label="선택 선수 정보">
          <div className="broadcast-portrait">{portrait ? <img src={portrait} alt={`${selected?.callSign} 인물 원화`} /> : <div className="broadcast-unmade"><span>{selected?.callSign}</span><small>고유 초상 제작 예정</small></div>}<span>{source?.operator.unit.country} / {selected?.side}</span></div>
          <div className="broadcast-player-copy"><small>PLAYER / {source?.player.realName}</small><h2>{source?.player.nickname}</h2><strong>{selected?.callSign} <small>{source && OPERATOR_ROLE_LABELS[source.operator.role]}</small></strong>
            <p className="broadcast-weapon">{selected?.weaponName}</p>
            <div className="broadcast-vitals"><b>{selected ? Math.ceil(selected.hp) : 100}<small> HP</small></b><b>{selected?.ammo}<small> / {selected?.magazineSize}</small></b></div>
            <progress aria-label="선택 선수 체력" max="100" value={selected?.hp ?? 100} />
            <p>{selected && ACTIONS[selected.action]}{selected && selected.reloadRemaining > 0 ? ` · ${selected.reloadRemaining.toFixed(1)}초` : ` · 예비 ${selected?.reserveAmmo ?? 0}발`}</p><p className="broadcast-goal">{selected?.goal}</p>
          </div>
        </section>
      </aside>
    </div>
    <div className="broadcast-rosters">{(['공격', '수비'] as OperatorSide[]).map(side => <div key={side} className="broadcast-roster" aria-label={`${side} 출전자`}>
      {units.filter(unit => unit.side === side).map(unit => <button key={unit.id} className={`broadcast-player-card ${unit.alive ? '' : 'is-out'}`} aria-pressed={unit.id === selectedId} onClick={() => selectUnit(unit.id)} data-player-id={unit.id} style={{borderTopColor:SIDE_COLOR[side]}}>
        <span>{participants.get(unit.id)?.player.nickname}</span><strong>{unit.callSign}</strong><small>{unit.weaponName}</small><b>{unit.alive ? `${Math.ceil(unit.hp)} HP · ${unit.ammo}/${unit.magazineSize}` : 'OUT'}</b>
        {!operatorVisual(unit.callSign) && <em>임시 외형</em>}
      </button>)}
    </div>)}</div>
    <div className="broadcast-bottom">
      <section className="broadcast-orders" aria-label="감독 지시"><div className="broadcast-section-title"><b>감독 지시 / 공격팀</b><small>{lastOrder}</small></div>
        <fieldset disabled={Boolean(result)}><button onClick={() => issueOrder('push','밀어붙여라')}>밀어붙여라</button><button onClick={() => issueOrder('hold','각을 잡아라')}>각을 잡아라</button><button onClick={() => issueOrder('retreat','물러나라')}>물러나라</button><button onClick={() => issueOrder('route','북쪽 진입',0)}>북쪽 진입</button><button onClick={() => issueOrder('route','서문 진입',1)}>서문 진입</button><button onClick={() => issueOrder('route','남쪽 진입',2)}>남쪽 진입</button></fieldset>
      </section>
      <section className="broadcast-events" aria-label="현장 사건"><div className="broadcast-section-title"><b>현장 기록</b><small>경기 시각</small></div>{logs.map((event,index) => <p key={`${event.time}-${event.type}-${index}`} className={event.type === 'death' ? 'event-death' : ''}><time>{clock(event.time)}</time><span>{eventText(event)}</span></p>)}</section>
    </div>
    {result && <section className="broadcast-result" aria-label="라운드 결과"><b>{result.winner} {result.winner === '무승부' ? '' : '승리'}</b><span>{result.objective.reason && BOMB_RESULT_LABELS[result.objective.reason]} · {clock(result.executionTime)} · 공격 {units.filter(unit => unit.alive && unit.side === '공격').length}명 / 수비 {units.filter(unit => unit.alive && unit.side === '수비').length}명 생존</span></section>}
    <p className="broadcast-build-note">폭탄전 단일 라운드 · 공격은 해체 장치를 설치·엄호하고 수비는 폭탄을 지키거나 장치를 무력화합니다. MAGPIE·COLLIER·해동은 준비된 정지 원화, 나머지는 임시 외형입니다. 총기 원화·수치는 고증 검증 전입니다.</p>
  </section>;
}
