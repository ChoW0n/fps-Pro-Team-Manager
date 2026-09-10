/**
 * 전술 FPS의 실시간 판정을 담당합니다. 결과를 미리 계산하는 라운드 공식과
 * 분리되어 있으며, 모든 이동·소리·탄환은 10Hz 틱 순서로 처리됩니다.
 */
import type { Operator, OperatorSide } from '../Operator';
import type { Player } from '../Player';
import type { TacticalMapDefinition, TacticalPoint, TacticalRect } from '../tacticalMaps';
import { BREACHLINE_MAP } from '../tacticalMaps';

export interface RealtimeUnitInput {
  player: Player;
  operator: Operator;
  teamName: string;
  side: OperatorSide;
  /** 밴픽 결과가 실제 전투 판단과 무기 성능에 전달되는 값입니다. */
  loadout?: {
    pickName: string;
    strength: number;
    positionFit: number;
  };
}
export interface TacticalRealtimeSimulationInput {
  attackers: RealtimeUnitInput[];
  defenders: RealtimeUnitInput[];
  map?: TacticalMapDefinition;
  seed?: number;
  maxSeconds?: number;
}
export type TacticalDirectorCommandMode = 'push' | 'hold' | 'retreat' | 'route';
export interface TacticalDirectorCommand {
  side: OperatorSide;
  mode: TacticalDirectorCommandMode;
  routeIndex?: number;
  label: string;
}
export interface RealtimeVector extends TacticalPoint { }
export type RealtimeAction = 'approach' | 'search' | 'hold' | 'take-cover' | 'reposition' | 'aim' | 'fire' | 'reload' | 'dead';
export interface RealtimeUnitState {
  id: string; teamName: string; side: OperatorSide; callSign: string;
  position: RealtimeVector; velocity: RealtimeVector; facing: number; hp: number;
  ammo: number; magazineSize: number; reserveAmmo: number; reloadRemaining: number;
  weaponName: string; weaponProfileNote: string;
  cooldown: number; goal: string; action: RealtimeAction;
  routeIndex: number; routeStep: number;
  knowledge: {
    lastKnownPosition?: RealtimeVector;
    lastKnownAt?: number;
    confidence: number;
    source?: 'self-visual' | 'self-sound' | 'team-visual' | 'team-sound';
    reportedBy?: string;
  };
  alive: boolean;
}
export interface RealtimeSnapshot {
  time: number; units: Array<RealtimeUnitState>;
}
export interface RealtimeEvent {
  time: number; type: 'move' | 'sound' | 'shot' | 'impact' | 'death' | 'action' | 'objective' | 'intel' | 'reload';
  actor?: string; target?: string; message: string; position?: RealtimeVector;
  targetPosition?: RealtimeVector; goal?: string; hit?: boolean; blocked?: boolean; side?: OperatorSide;
}
export interface RealtimeTick {
  time: number;
  snapshot: RealtimeSnapshot;
  events: RealtimeEvent[];
}
export interface RealtimeEngagement {
  attackerCallSign: string; defenderCallSign: string; firstShotAt: number;
  shots: number; hits: number; winner?: OperatorSide;
}
export interface TacticalRealtimeResult {
  winner: OperatorSide | '무승부'; survivors: RealtimeUnitState[];
  executionTime: number; events: RealtimeEvent[]; eventLog: RealtimeEvent[];
  engagements: RealtimeEngagement[]; snapshots: RealtimeSnapshot[];
  validation: RealtimeProcessValidation;
}

export interface RealtimeProcessValidation {
  wallBangCount: number;
  shots: number;
  impacts: number;
  minimumTeamSeparation: number;
  averageNearestTeammateSeparation: number;
  searchPhase: {
    started: boolean;
    duration: number;
    scoutActions: number;
    defenderResponses: number;
  };
  actionTrace: Array<{ time: number; callSign: string; action: RealtimeAction; goal: string }>;
}

interface Bullet {
  from: string;
  target: string;
  position: RealtimeVector;
  targetPosition: RealtimeVector;
  direction: RealtimeVector;
  eta: number;
  damage: number;
  hit: boolean;
}
interface SoundEvent { at: number; source: RealtimeVector; kind: 'footstep' | 'gunshot'; loudness: number; owner: string; }
interface TeamReport {
  reporterId: string;
  side: OperatorSide;
  kind: 'visual' | 'sound';
  position: RealtimeVector;
  at: number;
  confidence: number;
}
interface RealtimeWeaponProfile {
  magazineSize: number;
  reserveAmmo: number;
  reloadSeconds: number;
  note: string;
}
interface NavigationPlan {
  goalKey: string;
  points: RealtimeVector[];
  index: number;
}

const UNIT_RADIUS = 18;
const TEAMMATE_CLEARANCE = UNIT_RADIUS * 2.2;

/** 주무기 이름을 행동용 탄창 설정에 연결하며, 수치는 게임용 임시값임을 명시합니다. */
const WEAPON_PROFILES: Record<string, RealtimeWeaponProfile> = {
  'L119A2 카빈': { magazineSize: 30, reserveAmmo: 90, reloadSeconds: 2.2, note: '게임용 임시 설정 · 실측값 아님' },
  MP5SD: { magazineSize: 30, reserveAmmo: 120, reloadSeconds: 2.0, note: '게임용 임시 설정 · 실측값 아님' },
  HK416: { magazineSize: 30, reserveAmmo: 90, reloadSeconds: 2.1, note: '게임용 임시 설정 · 실측값 아님' },
  '타보르 X95': { magazineSize: 30, reserveAmmo: 90, reloadSeconds: 2.1, note: '게임용 임시 설정 · 실측값 아님' },
  'SIG MPX': { magazineSize: 30, reserveAmmo: 120, reloadSeconds: 1.9, note: '게임용 임시 설정 · 실측값 아님' },
  'AS Val 소음소총': { magazineSize: 20, reserveAmmo: 60, reloadSeconds: 2.0, note: '게임용 임시 설정 · 실측값 아님' },
  HK417: { magazineSize: 20, reserveAmmo: 60, reloadSeconds: 2.4, note: '게임용 임시 설정 · 실측값 아님' },
  'PSG-1 정밀소총': { magazineSize: 10, reserveAmmo: 40, reloadSeconds: 2.8, note: '게임용 임시 설정 · 실측값 아님' },
  'FN P90': { magazineSize: 50, reserveAmmo: 150, reloadSeconds: 2.3, note: '게임용 임시 설정 · 실측값 아님' },
  'C14 팀버울프': { magazineSize: 5, reserveAmmo: 25, reloadSeconds: 2.7, note: '게임용 임시 설정 · 실측값 아님' },
  'K1A 기관단총': { magazineSize: 30, reserveAmmo: 90, reloadSeconds: 2.0, note: '게임용 임시 설정 · 실측값 아님' },
  '베레타 ARX160': { magazineSize: 30, reserveAmmo: 90, reloadSeconds: 2.2, note: '게임용 임시 설정 · 실측값 아님' },
};
const DEFAULT_WEAPON_PROFILE: RealtimeWeaponProfile = {
  magazineSize: 30,
  reserveAmmo: 90,
  reloadSeconds: 2.3,
  note: '게임용 임시 설정 · 실측값 아님',
};

/** 현재 오퍼레이터가 실제로 배정받은 첫 번째 주무기의 임시 게임 설정을 반환합니다. */
function weaponProfileFor(operator: Operator): { name: string; profile: RealtimeWeaponProfile } {
  const name = operator.firearms[0] ?? '기본 주무기';
  return { name, profile: WEAPON_PROFILES[name] ?? DEFAULT_WEAPON_PROFILE };
}

/** 고정 시드 난수 생성기입니다. 시즌 재현과 관전 재생에 사용합니다. */
class SeededRandom {
  private state: number;
  public constructor(seed = 1) { this.state = (seed >>> 0) || 1; }
  public next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

/** 두 점 사이의 선분 교차를 계산합니다. */
function intersects(a: TacticalPoint, b: TacticalPoint, c: TacticalPoint, d: TacticalPoint): boolean {
  const cross = (p: TacticalPoint, q: TacticalPoint, r: TacticalPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const ab1 = cross(a, b, c); const ab2 = cross(a, b, d);
  const cd1 = cross(c, d, a); const cd2 = cross(c, d, b);
  return ab1 * ab2 <= 0 && cd1 * cd2 <= 0;
}
function rectEdges(r: TacticalRect): Array<[TacticalPoint, TacticalPoint]> {
  const p = { x: r.x, y: r.y }; const q = { x: r.x + r.width, y: r.y };
  const s = { x: r.x + r.width, y: r.y + r.height }; const t = { x: r.x, y: r.y + r.height };
  return [[p, q], [q, s], [s, t], [t, p]];
}
function distance(a: TacticalPoint, b: TacticalPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

export class TacticalRealtimeSimulation {
  private readonly map: TacticalMapDefinition;
  public constructor(map: TacticalMapDefinition = BREACHLINE_MAP) { this.map = map; }

  /** 공격·수비를 서로 다른 진입 전략으로 10Hz 진행하는 틱 제너레이터입니다. */
  public *runTicks(
    input: TacticalRealtimeSimulationInput,
  ): Generator<RealtimeTick, TacticalRealtimeResult, TacticalDirectorCommand | undefined> {
    if (!input.attackers.length || !input.defenders.length) throw new Error('공격과 수비에 각각 오퍼레이터가 필요합니다.');
    const map = input.map ?? this.map;
    const random = new SeededRandom(input.seed ?? 1);
    const maxTicks = Math.min(1800, Math.max(1, Math.floor((input.maxSeconds ?? 180) * 10)));
    const units: RealtimeUnitState[] = [...input.attackers, ...input.defenders].map((u, i) => ({
      id: `${u.teamName}:${u.player.nickname}:${u.operator.callSign}:${i}`, teamName: u.teamName,
      side: u.side, callSign: u.operator.callSign,
      position: this.startPosition(u, i, input.attackers.length, map), velocity: { x: 0, y: 0 },
      facing: u.side === '공격' ? 0 : Math.PI, hp: 100, ammo: 30, cooldown: 0,
      goal: u.side === '공격' ? '담당 진입로 대기' : '담당 구역 각 유지',
      action: u.side === '공격' && u.operator.role === 'SEARCH' ? 'search' : 'hold',
      routeIndex: u.side === '공격' ? i : i - input.attackers.length,
      routeStep: 0,
      knowledge: { confidence: 0 }, alive: true,
    }));
    const byId = new Map(units.map((u) => [u.id, u]));
    const source = [...input.attackers, ...input.defenders];
    const stat = new Map(source.map((u) => [u.operator.callSign, u]));
    const actionLockUntil = new Map<string, number>();
    const visualContactSince = new Map<string, { targetId: string; at: number }>();
    const searchUntil = new Map<string, number>();
    const searchOrigin = new Map<string, RealtimeVector>();
    const directorOrders = new Map<OperatorSide, TacticalDirectorCommand>();
    const events: RealtimeEvent[] = []; const snapshots: RealtimeSnapshot[] = [];
    const bullets: Bullet[] = []; const sounds: SoundEvent[] = []; const engagements: RealtimeEngagement[] = [];
    const openingSearchSeconds = 12;
    const log = (event: RealtimeEvent) => events.push(event);
    const applyDirectorCommand = (command: TacticalDirectorCommand, now: number): void => {
      directorOrders.set(command.side, command);
      if (command.mode === 'route' && command.side === '공격' && command.routeIndex !== undefined) {
        units.filter((unit) => unit.side === '공격').forEach((unit, index) => {
          unit.routeIndex = (command.routeIndex! + index) % map.attackerRoutes.length;
          unit.routeStep = 0;
        });
      }
      log({
        time: now,
        type: 'objective',
        actor: 'director',
        message: `감독 지시: ${command.label}`,
        goal: command.label,
        side: command.side,
      });
    };
    units.forEach((unit) => log({
      time: 0, type: 'action', actor: unit.id,
      message: `${unit.callSign}: ${unit.action}`,
      position: { ...unit.position }, goal: unit.goal,
    }));
    const living = (side: OperatorSide) => units.filter((u) => u.alive && u.side === side);
    let eventCursor = 0;
    for (let tick = 0; tick < maxTicks; tick += 1) {
      const now = tick / 10;
      // 먼저 비행 중인 총알을 탄착시켜, 발사와 피해의 순서를 보장합니다.
      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const bullet = bullets[i]; if (bullet.eta > now) continue;
        const target = byId.get(bullet.target); bullets.splice(i, 1);
        if (!target?.alive) continue;
        if (bullet.hit) {
          target.hp -= bullet.damage; log({
            time: now, type: 'impact', actor: bullet.from, target: target.id,
            message: `${target.callSign}에게 탄착`, position: { ...target.position },
            targetPosition: { ...target.position }, hit: true,
          });
          if (target.hp <= 0) { target.alive = false; target.action = 'dead'; log({ time: now, type: 'death', actor: bullet.from, target: target.id, message: `${target.callSign} 사망`, position: target.position }); }
        }
      }
      if (!living('공격').length || !living('수비').length) {
        // 사망 이벤트가 발생한 마지막 틱도 화면에 남겨 실제 이탈 위치를 그립니다.
        const finalSnapshot = {
          time: now,
          units: units.map((u) => ({
            ...u,
            position: { ...u.position },
            velocity: { ...u.velocity },
            knowledge: { ...u.knowledge },
          })),
        };
        snapshots.push(finalSnapshot);
        yield { time: now, snapshot: finalSnapshot, events: events.slice(eventCursor) };
        break;
      }
      // 최근 2.5초의 소리만 유지해 감각 판정이 틱 수에 따라 느려지지 않게 합니다.
      for (let soundIndex = sounds.length - 1; soundIndex >= 0; soundIndex -= 1) {
        if (now - sounds[soundIndex].at >= 2.5) sounds.splice(soundIndex, 1);
      }
      for (const unit of units) {
        if (!unit.alive) continue;
        const me = stat.get(unit.callSign)!; const enemies = living(unit.side === '공격' ? '수비' : '공격');
        const visible = enemies.filter((enemy) => this.hasLineOfSight(unit.position, enemy.position, map));
        const seen = visible.sort((a, b) => distance(unit.position, a.position) - distance(unit.position, b.position))[0];
        const hearing = sounds.filter((sound) => sound.owner !== unit.id && this.heard(unit, sound, map, now));
        const latestSound = hearing.sort((a, b) => b.at - a.at)[0];
        const recentSound = latestSound && now - latestSound.at < 0.8 ? latestSound : undefined;
        // 발사 대상은 실제로 시야에 들어온 적만 허용합니다.
        const target = seen;
        if (seen) {
          unit.knowledge = { lastKnownPosition: { ...seen.position }, lastKnownAt: now, confidence: 1 };
          searchUntil.delete(unit.id);
          searchOrigin.delete(unit.id);
          const contact = visualContactSince.get(unit.id);
          if (!contact || contact.targetId !== seen.id) visualContactSince.set(unit.id, { targetId: seen.id, at: now });
        } else {
          visualContactSince.delete(unit.id);
          if (recentSound && (
            unit.knowledge.lastKnownAt === undefined
            || recentSound.at > unit.knowledge.lastKnownAt
          )) {
            // 소리를 들었을 때는 소리가 발생한 지점만 기억하며, 적의 현재 좌표는 조회하지 않습니다.
            unit.knowledge = {
              lastKnownPosition: { ...recentSound.source },
              lastKnownAt: recentSound.at,
              confidence: Math.max(unit.knowledge.confidence, 0.45),
            };
          } else if (unit.knowledge.lastKnownPosition && unit.knowledge.lastKnownAt !== undefined) {
            const leadAge = now - unit.knowledge.lastKnownAt;
            unit.knowledge.confidence = clamp(unit.knowledge.confidence - (leadAge > 2.5 ? 0.035 : 0.01), 0, 1);
            if (leadAge > 6 || unit.knowledge.confidence <= 0.05) {
              // 마지막 위치까지 확인했거나 너무 오래된 정보는 버리고 다시 주변을 탐색합니다.
              unit.knowledge = { confidence: 0 };
            }
          }
        }
        const lastKnownPosition = unit.knowledge.lastKnownPosition;
        const reachedLastKnown = Boolean(
          !seen
          && lastKnownPosition
          && distance(unit.position, lastKnownPosition) <= 28
          && !recentSound,
        );
        if (reachedLastKnown && lastKnownPosition) {
          // 도착 후 잠깐 주변을 훑은 다음, 적이 없으면 오래된 위치 기억을 버립니다.
          searchUntil.set(unit.id, now + 1.2);
          searchOrigin.set(unit.id, { ...lastKnownPosition });
        }
        if (!seen && lastKnownPosition && distance(unit.position, lastKnownPosition) <= 28 && !recentSound) {
          // 마지막 위치에 도착했지만 적을 찾지 못하면 실제 위치를 추적하지 않고 기억을 폐기합니다.
          unit.knowledge = { confidence: 0 };
        }
        const isSearching = !seen && (searchUntil.get(unit.id) ?? 0) > now;
        const hasUnresolvedLead = Boolean(
          !seen
          && lastKnownPosition
          && unit.knowledge.lastKnownAt !== undefined
          && distance(unit.position, lastKnownPosition) > 28
          && unit.knowledge.confidence > 0.05,
        );
        const contact = visualContactSince.get(unit.id);
        const visualContactDuration = contact ? now - contact.at : 0;
        const isClutch = enemies.length >= 2 && living(unit.side).length === 1;
        const aggression = clamp((me.player.aggression + me.operator.stats.aggression) / 200, 0, 1);
        const aim = clamp((me.player.aim + me.player.composure + me.player.mastery + me.operator.stats.aim
          + (me.loadout?.strength ?? 50) * 0.18 + (me.loadout?.positionFit ?? 50) * 0.12) / 440, 0, 1);
        const objectiveCenter = {
          x: map.objectiveZone.x + map.objectiveZone.width / 2,
          y: map.objectiveZone.y + map.objectiveZone.height / 2,
        };
        const defenderSetup = unit.side === '수비'
          ? map.defenderSetups[unit.routeIndex % map.defenderSetups.length]
          : undefined;
        const defenderSet = Boolean(defenderSetup && distance(unit.position, defenderSetup.position) < 115)
          || (unit.side === '수비' && distance(unit.position, objectiveCenter) < 220);
        const openingSearch = now < openingSearchSeconds;
        const isOpeningScout = openingSearch
          && unit.side === '공격'
          && (me.player.role === 'SEARCH' || me.operator.role === 'SEARCH');
        const soundUrgency = recentSound
          ? recentSound.loudness * clamp(1 - distance(unit.position, recentSound.source) / 260, 0, 1)
          : 0;
        const investigateSound = Boolean(recentSound && (
          soundUrgency > 0.2
          || aggression > 0.45
          || !defenderSet
        ));
        const holdAngleAfterSound = Boolean(
          unit.side === '수비'
          && defenderSet
          && recentSound
          && !investigateSound,
        );
        const lowHealth = unit.hp <= 35;
        const outnumbered = enemies.length > living(unit.side).length;
        const losingPosition = Boolean(
          (lowHealth && (seen || hasUnresolvedLead))
          || (outnumbered && unit.hp <= 65 && (seen || hasUnresolvedLead))
          || (isClutch && unit.hp <= 55 && (seen || hasUnresolvedLead)),
        );
        // 낮은 공격성도 일정 시간 이상 시야를 유지하면 결정을 끝내야 합니다.
        const aimTimedOut = Boolean(seen && visualContactDuration >= 1.2);
        const canFire = unit.cooldown <= 0 && unit.ammo > 0;
        const shouldFire = Boolean(seen && canFire && !losingPosition
          && (aggression > 0.25 || isClutch || aimTimedOut));
        const outOfAmmo = unit.ammo <= 0;
        const directorOrder = directorOrders.get(unit.side);
        const forcedPush = directorOrder?.mode === 'push';
        const forcedHold = directorOrder?.mode === 'hold';
        const forcedRetreat = directorOrder?.mode === 'retreat';
        const shouldReposition = Boolean(forcedRetreat || ((losingPosition || outOfAmmo) && !shouldFire));
        const shouldSearch = Boolean(
          !seen
          && !forcedHold
          && !holdAngleAfterSound
          && (isOpeningScout || investigateSound || hasUnresolvedLead || isSearching),
        );
        let desired: RealtimeAction = shouldReposition
          ? 'reposition'
          : shouldFire
            ? 'fire'
            : forcedHold
              ? 'hold'
              : forcedPush
                ? 'approach'
            : seen
              ? 'aim'
              : shouldSearch
                ? 'search'
                  : openingSearch && unit.side === '공격' && !forcedPush ? 'hold'
                : unit.side === '수비' && defenderSet ? 'hold' : 'approach';
        // 액션 잠금/히스테리시스: 짧은 시야 변화에 매 틱 행동을 바꾸지 않습니다.
        if (unit.action === 'fire' && unit.cooldown > 0) desired = 'aim';
        if (desired !== unit.action && (actionLockUntil.get(unit.id) ?? 0) <= now) {
          unit.goal = desired === 'reposition'
            ? '열세 판단 후 후퇴·재배치'
            : desired === 'search'
              ? '마지막 소리 위치 수색'
              : desired === 'hold' ? '담당 구역 각 유지' : unit.goal;
          unit.action = desired; log({
            time: now, type: 'action', actor: unit.id, message: `${unit.callSign}: ${desired}`,
            position: { ...unit.position }, goal: unit.goal,
          });
          // 최소 0.3초 동안은 새 판단을 잠가 행동 떨림을 막습니다.
          actionLockUntil.set(unit.id, now + 0.3);
        }
        if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - 0.1);
        if (shouldFire && target) {
          const engagement = this.engagement(engagements, unit, target, now);
          engagement.shots += 1; unit.ammo -= 1; unit.cooldown = 0.45;
          const weaponControl = me.operator.firearms[0]?.includes('정밀') || me.operator.firearms[0]?.includes('PSG')
            ? 0.08
            : me.operator.firearms[0]?.includes('산탄') ? -0.06 : 0;
          const hitChance = clamp(0.16 + aim * 0.58 + me.player.teamSynergy / 500 + me.operator.stats.aim / 500
            + weaponControl
            + (this.inCover(unit.position, map) ? 0.08 : 0) - distance(unit.position, target.position) / 5000, 0.08, 0.94);
          const hit = random.next() < hitChance;
          if (hit) engagement.hits += 1;
          const flight = distance(unit.position, target.position) / 900;
          const targetPosition = { ...target.position };
          bullets.push({
            from: unit.id, target: target.id, position: { ...unit.position }, targetPosition,
            direction: { x: targetPosition.x - unit.position.x, y: targetPosition.y - unit.position.y },
            eta: now + flight, damage: hit ? 34 : 0, hit,
          });
          sounds.push({ at: now, source: { ...unit.position }, kind: 'gunshot', loudness: me.operator.callSign === 'COLLIER' ? 0.38 : 1, owner: unit.id });
          log({
            time: now, type: 'shot', actor: unit.id, target: target.id,
            message: `${unit.callSign} 발사`, position: { ...unit.position },
            targetPosition, hit, blocked: !this.hasLineOfSight(unit.position, targetPosition, map),
          });
        } else if (unit.action !== 'hold') {
          // 공격자는 돌입점으로 전진하고, 수비자는 소리·마지막 위치·열세 판단에 따라 움직입니다.
          const attackerGoal = this.attackerDestination(unit, map);
          const searchPoint = map.searchPoints[unit.routeIndex % map.searchPoints.length];
          const destination = shouldReposition
            ? this.retreatDestination(unit, map)
            : seen?.position
              ?? (isSearching && searchOrigin.get(unit.id)
                ? this.searchDestination(searchOrigin.get(unit.id)!, unit, now, map)
                : (hasUnresolvedLead && lastKnownPosition
                  ? (unit.action === 'search'
                    ? this.searchDestination(lastKnownPosition, unit, now, map)
                    : lastKnownPosition)
                  : isOpeningScout && searchPoint
                    ? searchPoint
                    : unit.side === '공격'
                      ? attackerGoal
                      : defenderSetup?.fallback ?? defenderSetup?.position ?? objectiveCenter));
          this.move(unit, destination, me, map, now);
        }
        if (unit.cooldown <= 0 && unit.action === 'approach') sounds.push({ at: now, source: { ...unit.position }, kind: 'footstep', loudness: 0.25, owner: unit.id });
      }
      for (const e of sounds) if (e.at === now) log({ time: now, type: 'sound', actor: e.owner, message: e.kind === 'gunshot' ? '총성' : '발소리', position: e.source });
      const snapshot = { time: now, units: units.map((u) => ({ ...u, position: { ...u.position }, velocity: { ...u.velocity }, knowledge: { ...u.knowledge } })) };
      snapshots.push(snapshot);
      const command = yield { time: now, snapshot, events: events.slice(eventCursor) };
      eventCursor = events.length;
      if (command) applyDirectorCommand(command, now);
    }
    const a = living('공격').length; const d = living('수비').length;
    for (const e of engagements) { const target = units.find((u) => u.callSign === e.defenderCallSign); const shooter = units.find((u) => u.callSign === e.attackerCallSign); if (!target?.alive) e.winner = '공격'; else if (!shooter?.alive) e.winner = '수비'; }
    const objectiveCenter = {
      x: map.objectiveZone.x + map.objectiveZone.width / 2,
      y: map.objectiveZone.y + map.objectiveZone.height / 2,
    };
    const attackersInObjective = living('공격').filter((unit) =>
      unit.position.x >= map.objectiveZone.x
      && unit.position.x <= map.objectiveZone.x + map.objectiveZone.width
      && unit.position.y >= map.objectiveZone.y
      && unit.position.y <= map.objectiveZone.y + map.objectiveZone.height).length;
    const defendersNearObjective = living('수비').filter((unit) =>
      distance(unit.position, objectiveCenter) < 180).length;
    const winner: OperatorSide | '무승부' = !a && !d
      ? '무승부'
      : !d ? '공격'
        : !a ? '수비'
          : attackersInObjective > defendersNearObjective ? '공격' : '수비';
    const executionTime = snapshots.length / 10;
    return {
      winner,
      survivors: units.filter((u) => u.alive),
      executionTime,
      events,
      eventLog: events,
      engagements,
      snapshots,
      validation: this.validateProcess(events, snapshots, units, input, executionTime, openingSearchSeconds),
    };
  }

  /** 역할과 공격/수비 배치가 이동 경로에 영향을 줍니다. */
  private startPosition(u: RealtimeUnitInput, index: number, attackers: number, map: TacticalMapDefinition): RealtimeVector {
    const sideIndex = u.side === '공격' ? index : index - attackers;
    if (u.side === '공격') {
      return { ...(map.attackerRoutes[sideIndex % map.attackerRoutes.length]?.points[0] ?? map.attackerSpawn) };
    }
    return { ...(map.defenderSetups[sideIndex % map.defenderSetups.length]?.position ?? map.defenderSpawn) };
  }
  /** 공격 유닛마다 담당 진입로의 다음 경유점만 바라보게 합니다. */
  private attackerDestination(unit: RealtimeUnitState, map: TacticalMapDefinition): TacticalPoint {
    const route = map.attackerRoutes[unit.routeIndex % map.attackerRoutes.length];
    const point = route.points[Math.min(unit.routeStep, route.points.length - 1)];
    if (distance(unit.position, point) < 38 && unit.routeStep < route.points.length - 1) unit.routeStep += 1;
    return route.points[Math.min(unit.routeStep, route.points.length - 1)];
  }
  private move(unit: RealtimeUnitState, goal: TacticalPoint, me: RealtimeUnitInput, map: TacticalMapDefinition, now: number): void {
    const defensive = unit.side === '수비'; const speed = (defensive ? 32 : 42) + me.operator.stats.entry / 5 + me.player.teamSynergy / 20;
    const dx = goal.x - unit.position.x; const dy = goal.y - unit.position.y; const len = Math.hypot(dx, dy) || 1;
    const next = { x: unit.position.x + dx / len * speed / 10, y: unit.position.y + dy / len * speed / 10 };
    if (this.inCover(unit.position, map) && !defensive && unit.action === 'approach') unit.action = 'take-cover';
    unit.velocity = { x: next.x - unit.position.x, y: next.y - unit.position.y }; unit.position = { x: clamp(next.x, 0, map.width), y: clamp(next.y, 0, map.height) };
  }
  /** 마지막 위치를 확인한 유닛이 주변을 훑도록, 기억한 지점 주변의 탐색 지점을 만듭니다. */
  private searchDestination(center: TacticalPoint, unit: RealtimeUnitState, now: number, map: TacticalMapDefinition): RealtimeVector {
    const signature = Array.from(unit.id).reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const phase = (Math.floor(now * 2) + signature) % 4;
    const offsets = [{ x: 42, y: 0 }, { x: 0, y: 42 }, { x: -42, y: 0 }, { x: 0, y: -42 }];
    const offset = offsets[phase];
    return {
      x: clamp(center.x + offset.x, 0, map.width),
      y: clamp(center.y + offset.y, 0, map.height),
    };
  }
  /** 열세 유닛은 적의 마지막 알려진 위치에서 멀어지는 엄폐·스폰 방향으로 재배치합니다. */
  private retreatDestination(unit: RealtimeUnitState, map: TacticalMapDefinition): RealtimeVector {
    const spawn = unit.side === '공격' ? map.attackerSpawn : map.defenderSpawn;
    const threat = unit.knowledge.lastKnownPosition ?? {
      x: map.objectiveZone.x + map.objectiveZone.width / 2,
      y: map.objectiveZone.y + map.objectiveZone.height / 2,
    };
    const candidates: Array<{ point: TacticalPoint; cover: number }> = [
      { point: spawn, cover: 0 },
      ...map.covers.map((cover) => ({
        point: {
          x: cover.rect.x + cover.rect.width / 2,
          y: cover.rect.y + cover.rect.height / 2,
        },
        cover: 1,
      })),
    ];
    return candidates
      .map(({ point, cover }) => ({
        point,
        score: distance(point, threat) * 1.2 - distance(unit.position, point) * 0.35 + cover * 45,
      }))
      .sort((a, b) => b.score - a.score)[0].point;
  }
  /** 실제 이벤트와 스냅샷만 사용해 관전 과정의 구조적 오류를 집계합니다. */
  private validateProcess(
    events: RealtimeEvent[],
    snapshots: RealtimeSnapshot[],
    units: RealtimeUnitState[],
    input: TacticalRealtimeSimulationInput,
    executionTime: number,
    openingSearchSeconds: number,
  ): RealtimeProcessValidation {
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const shotEvents = events.filter((event) => event.type === 'shot');
    const impactEvents = events.filter((event) => event.type === 'impact');
    const scoutIds = new Set(units
      .filter((unit) => {
        const source = [...input.attackers, ...input.defenders]
          .find((candidate) => candidate.operator.callSign === unit.callSign);
        return source?.side === '공격'
          && (source.player.role === 'SEARCH' || source.operator.role === 'SEARCH');
      })
      .map((unit) => unit.id));
    const scoutActions = events.filter((event) =>
      event.type === 'action' && event.actor && scoutIds.has(event.actor)
      && event.message.includes(': search'),
    );
    const defenderResponses = shotEvents.filter((event) =>
      event.target && scoutIds.has(event.target),
    );
    let minimumTeamSeparation = Number.POSITIVE_INFINITY;
    let nearestSum = 0;
    let nearestCount = 0;
    snapshots.forEach((snapshot) => {
      (['공격', '수비'] as const).forEach((side) => {
        const team = snapshot.units.filter((unit) => unit.side === side && unit.alive);
        team.forEach((unit) => {
          const nearest = team
            .filter((candidate) => candidate.id !== unit.id)
            .map((candidate) => distance(unit.position, candidate.position))
            .sort((a, b) => a - b)[0];
          if (nearest !== undefined) {
            minimumTeamSeparation = Math.min(minimumTeamSeparation, nearest);
            nearestSum += nearest;
            nearestCount += 1;
          }
        });
      });
    });
    const actionTrace = events
      .filter((event) => event.type === 'action' && event.actor)
      .map((event) => {
        const unit = unitById.get(event.actor!);
        return {
          time: event.time,
          callSign: unit?.callSign ?? event.actor!,
          action: (event.message.split(': ').at(-1) ?? 'hold') as RealtimeAction,
          goal: event.goal ?? unit?.goal ?? '',
        };
      });
    return {
      wallBangCount: shotEvents.filter((event) => event.blocked).length,
      shots: shotEvents.length,
      impacts: impactEvents.length,
      minimumTeamSeparation: Number.isFinite(minimumTeamSeparation) ? minimumTeamSeparation : 0,
      averageNearestTeammateSeparation: nearestCount > 0 ? nearestSum / nearestCount : 0,
      searchPhase: {
        started: scoutActions.length > 0,
        duration: scoutActions.length > 0 ? Math.min(executionTime, openingSearchSeconds) : 0,
        scoutActions: scoutActions.length,
        defenderResponses: defenderResponses.length,
      },
      actionTrace,
    };
  }
  private hasLineOfSight(a: TacticalPoint, b: TacticalPoint, map: TacticalMapDefinition): boolean {
    return !map.walls.some((wall) => wall.kind !== 'door-gap' && intersects(a, b, wall.from, wall.to))
      && !map.covers.some((cover) => rectEdges(cover.rect).some(([p, q]) => intersects(a, b, p, q)));
  }
  private inCover(p: TacticalPoint, map: TacticalMapDefinition): boolean { return map.covers.some((c) => p.x >= c.rect.x && p.x <= c.rect.x + c.rect.width && p.y >= c.rect.y && p.y <= c.rect.y + c.rect.height); }
  private heard(unit: RealtimeUnitState, sound: SoundEvent, map: TacticalMapDefinition, now: number): boolean {
    const wallLoss = this.hasLineOfSight(unit.position, sound.source, map) ? 1 : 0.35;
    return now - sound.at < 2.5 && distance(unit.position, sound.source) < 260 * sound.loudness * wallLoss;
  }
  private engagement(list: RealtimeEngagement[], shooter: RealtimeUnitState, target: RealtimeUnitState, now: number): RealtimeEngagement {
    let e = list.find((item) => item.attackerCallSign === shooter.callSign && item.defenderCallSign === target.callSign);
    if (!e) { e = { attackerCallSign: shooter.callSign, defenderCallSign: target.callSign, firstShotAt: now, shots: 0, hits: 0 }; list.push(e); }
    return e;
  }
  /** 시즌 시뮬레이션은 같은 틱 엔진을 끝까지 소비해 즉시 결과를 반환합니다. */
  public run(input: TacticalRealtimeSimulationInput): TacticalRealtimeResult {
    const runner = this.runTicks(input);
    let next = runner.next();
    while (!next.done) next = runner.next();
    return next.value;
  }
  /** 관전 화면이 한 틱씩 소비할 수 있는 세션을 생성합니다. */
  public createSession(input: TacticalRealtimeSimulationInput): TacticalRealtimeSession {
    return new TacticalRealtimeSession(this.runTicks(input));
  }
}

/** 화면이 보이는 동안만 다음 틱을 진행하고, 감독 지시를 엔진에 주입합니다. */
export class TacticalRealtimeSession {
  private readonly runner: Generator<RealtimeTick, TacticalRealtimeResult, TacticalDirectorCommand | undefined>;
  private finalResult: TacticalRealtimeResult | null = null;
  public isComplete = false;
  public latestTick: RealtimeTick | null = null;

  public get isDone(): boolean {
    return this.isComplete;
  }

  public get currentSnapshot(): RealtimeSnapshot | null {
    return this.latestTick?.snapshot ?? null;
  }

  public get newEvents(): RealtimeEvent[] {
    return this.latestTick?.events ?? [];
  }

  public constructor(runner: Generator<RealtimeTick, TacticalRealtimeResult, TacticalDirectorCommand | undefined>) {
    this.runner = runner;
  }

  public step(command?: TacticalDirectorCommand): RealtimeTick | undefined {
    if (this.isComplete) return undefined;
    const next = this.runner.next(command);
    if (next.done) {
      this.finalResult = next.value;
      this.isComplete = true;
      return undefined;
    }
    this.latestTick = next.value;
    return next.value;
  }

  public getResult(): TacticalRealtimeResult | null {
    return this.finalResult;
  }
}

/** 클래스 없이 사용할 수 있는 순수 동기 실행 진입점입니다. */
export function runTacticalRealtimeSimulation(input: TacticalRealtimeSimulationInput): TacticalRealtimeResult {
  return new TacticalRealtimeSimulation(input.map).run(input);
}