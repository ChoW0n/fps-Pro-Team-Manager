/**
 * 전술 FPS의 실시간 판정을 담당합니다. 결과를 미리 계산하는 라운드 공식과
 * 분리되어 있으며, 모든 이동·소리·탄환은 10Hz 틱 순서로 처리됩니다.
 */
import type { Operator, OperatorSide } from '../Operator';
import type { Player } from '../Player';
import type { TacticalMapDefinition, TacticalPoint, TacticalRect } from '../tacticalMaps';
import { BREACHLINE_MAP } from '../tacticalMaps';
import { muzzlePosition } from '../operatorVisuals';
import { ScoutOperation, type ScoutPlan, type ScoutState } from './ScoutOperation';
import { BombObjective, type BombState, type BombInteraction } from './BombObjective';

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
/** 편성 순서를 포함한 참가자 ID로 양 팀의 같은 이름을 구분합니다. */
export function realtimeUnitId(unit: RealtimeUnitInput, index: number): string {
  return `${unit.teamName}:${unit.player.nickname}:${unit.operator.callSign}:${index}`;
}

export interface TacticalRealtimeSimulationInput {
  attackers: RealtimeUnitInput[];
  defenders: RealtimeUnitInput[];
  map?: TacticalMapDefinition;
  seed?: number;
  maxSeconds?: number;
  targetSite?: 'A' | 'B';
  scoutPlan?: ScoutPlan;
}
export type TacticalDirectorCommandMode = 'push' | 'hold' | 'retreat' | 'route';
export interface TacticalDirectorCommand {
  side: OperatorSide;
  mode: TacticalDirectorCommandMode;
  routeIndex?: number;
  label: string;
}
export interface RealtimeVector extends TacticalPoint { }
export type RealtimeAction = 'approach' | 'search' | 'hold' | 'take-cover' | 'reposition' | 'aim' | 'fire' | 'reload' | 'plant' | 'disable' | 'dead';
export interface RealtimeUnitState {
  id: string; teamName: string; side: OperatorSide; callSign: string;
  position: RealtimeVector; velocity: RealtimeVector; facing: number; hp: number;
  ammo: number; magazineSize: number; reserveAmmo: number; reloadRemaining: number;
  weaponName: string; weaponProfileNote: string;
  cooldown: number; goal: string; action: RealtimeAction;
  routeIndex: number; routeStep: number; formationIndex: number;
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
  time: number; units: Array<RealtimeUnitState>; objective?: BombState; operation?: ScoutState;
}
export interface RealtimeEvent {
  time: number; type: 'move' | 'sound' | 'shot' | 'impact' | 'death' | 'action' | 'objective' | 'intel' | 'reload';
  actor?: string; target?: string; message: string; position?: RealtimeVector;
  targetPosition?: RealtimeVector; travelSeconds?: number; goal?: string; hit?: boolean; blocked?: boolean; side?: OperatorSide;
}
export interface RealtimeTick {
  time: number;
  snapshot: RealtimeSnapshot;
  events: RealtimeEvent[];
}
export interface RealtimeEngagement {
  attackerCallSign: string; defenderCallSign: string; attackerId: string; defenderId: string; firstShotAt: number;
  shots: number; hits: number; winner?: OperatorSide;
}
export interface TacticalRealtimeResult {
  winner: OperatorSide | '무승부'; survivors: RealtimeUnitState[];
  executionTime: number; events: RealtimeEvent[]; eventLog: RealtimeEvent[];
  engagements: RealtimeEngagement[]; snapshots: RealtimeSnapshot[];
  validation: RealtimeProcessValidation;
  objective: BombState;
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
interface PortalReservation { ownerId: string; approach: number; expires: number }
interface NavigationPlan {
  goalKey: string;
  points: RealtimeVector[];
  index: number;
  goal: RealtimeVector;
  detourUntil?: number;
}

export const UNIT_RADIUS = 12;
const WALL_HALF_WIDTH = 9;
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
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
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

/** 점과 선분 사이의 거리를 계산해 전투원 반경을 포함한 충돌을 판정합니다. */
function pointToSegmentDistance(point: TacticalPoint, from: TacticalPoint, to: TacticalPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, from);
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: from.x + dx * t, y: from.y + dy * t });
}

export class TacticalRealtimeSimulation {
  private readonly map: TacticalMapDefinition;
  private readonly navigationLinks = new WeakMap<RealtimeVector[], boolean[][]>();
  /** 세션의 기준 지형을 보관합니다. */
  public constructor(map: TacticalMapDefinition = BREACHLINE_MAP) { this.map = map; }

  /** 공격·수비를 서로 다른 진입 전략으로 10Hz 진행하는 틱 제너레이터입니다. */
  public *runTicks(
    input: TacticalRealtimeSimulationInput,
  ): Generator<RealtimeTick, TacticalRealtimeResult, TacticalDirectorCommand | undefined> {
    if (!input.attackers.length || !input.defenders.length) throw new Error('공격과 수비에 각각 오퍼레이터가 필요합니다.');
    const map = input.map ?? this.map;
    const random = new SeededRandom(input.seed ?? 1);
    const actionSeconds = Math.max(0.1, Math.min(180, input.maxSeconds ?? 180));
    // 제한 직전 설치와 작동 시간까지 같은 틱을 진행합니다.
    const maxTicks = Math.ceil((actionSeconds + 7 + 45 + 1) * 10);
    const scoutPlan = input.scoutPlan;
    if (scoutPlan && (!Number.isInteger(scoutPlan.entryRoute) || scoutPlan.entryRoute < 0 || scoutPlan.entryRoute >= map.attackerRoutes.length
      || scoutPlan.indices.some(index=>!Number.isInteger(index)||index<0||index>=input.attackers.length))) throw new Error('선발조 명단 또는 진입 방향이 잘못됐습니다.');
    const entryRoute = map.attackerRoutes[scoutPlan?.entryRoute ?? 0];
    const rallyPositions = input.attackers.map((unit,index) => {
      if (!scoutPlan) return this.startPosition(unit,index,input.attackers.length,map);
      const from=entryRoute.points[0],to=entryRoute.points[1]??map.breachEntryPoint;
      const length=distance(from,to)||1,offset=(index-(input.attackers.length-1)/2)*34;
      const point={x:from.x-(to.y-from.y)/length*offset,y:from.y+(to.x-from.x)/length*offset};
      if(!this.canStand(point,map)) throw new Error('진입 방향의 합류 위치가 지형과 겹칩니다.');
      return point;
    });
    const units: RealtimeUnitState[] = [...input.attackers, ...input.defenders].map((u, i) => {
      const weapon = weaponProfileFor(u.operator);
      return {
        id: realtimeUnitId(u, i), teamName: u.teamName,
        side: u.side, callSign: u.operator.callSign,
        position: u.side==='공격' ? rallyPositions[i] : this.startPosition(u, i, input.attackers.length, map), velocity: { x: 0, y: 0 },
        facing: this.startFacing(u, i, input.attackers.length, map), hp: 100,
        ammo: weapon.profile.magazineSize,
        magazineSize: weapon.profile.magazineSize,
        reserveAmmo: weapon.profile.reserveAmmo,
        reloadRemaining: 0,
        weaponName: weapon.name,
        weaponProfileNote: weapon.profile.note,
        cooldown: 0,
        goal: u.side === '공격' ? '담당 진입로 대기' : '담당 구역 각 유지',
        action: u.side === '공격' && u.operator.role === 'SEARCH' ? 'search' : 'hold',
        routeIndex: u.side === '공격' ? scoutPlan?.entryRoute ?? i : i - input.attackers.length,
        formationIndex: u.side === '공격' ? i : i - input.attackers.length,
        routeStep: 0,
        knowledge: { confidence: 0 }, alive: true,
      };
    });
    const rally = new Map(units.filter(unit=>unit.side==='공격').map(unit=>[unit.id,{...unit.position}]));
    const operation = new ScoutOperation((scoutPlan?.indices??[]).map(index=>units[index].id), scoutPlan?.seconds??25, rally);
    const objective = new BombObjective(map.sites.map(site => ({
      id: site.id, label: site.label, zone: site.bounds, plantPoint: site.plantAnchors[0],
    })), units[Math.min(1, input.attackers.length - 1)].id, { actionSeconds });
    const plannedSite = map.sites.find(site => site.id === input.targetSite) ?? map.sites[0];
    let taskActorId: string | undefined;
    let taskKey = '';
    const byId = new Map(units.map((u) => [u.id, u]));
    const source = [...input.attackers, ...input.defenders];
    const stat = new Map(source.map((u, index) => [realtimeUnitId(u, index), u]));
    const actionLockUntil = new Map<string, number>();
    const visualContactSince = new Map<string, { targetId: string; at: number }>();
    const searchUntil = new Map<string, number>();
    const searchOrigin = new Map<string, RealtimeVector>();
    const retreatGoals = new Map<string, RealtimeVector>();
    const directorOrders = new Map<OperatorSide, TacticalDirectorCommand>();
    const yieldUntil = new Map<string, number>();
    const blockedUntil = new Map<string, number>();
    const pathCache = new Map<string, NavigationPlan>();
    const portalReservations = new Map<string, PortalReservation>();
    const navigationNodes = this.buildNavigationNodes(map);
    const scoutDestinations = new Map<string,RealtimeVector>();
    for(const unit of units.filter(unit=>operation.snapshot().scoutIds.includes(unit.id))) {
      const center=entryRoute.points[Math.min(3,entryRoute.points.length-1)];
      const intended={x:center.x+rally.get(unit.id)!.x-entryRoute.points[0].x,y:center.y+rally.get(unit.id)!.y-entryRoute.points[0].y};
      const candidates=[intended,...navigationNodes].filter(point=>this.canStand(point,map)
        && [...scoutDestinations.values()].every(other=>distance(point,other)>=TEAMMATE_CLEARANCE));
      candidates.sort((a,b)=>distance(a,intended)-distance(b,intended));
      if(!candidates.length) throw new Error('선발조의 유효한 관측 위치를 찾을 수 없습니다.');
      scoutDestinations.set(unit.id,{...candidates[0]});
    }
    const teamReports = new Map<OperatorSide, TeamReport[]>([
      ['공격', []],
      ['수비', []],
    ]);
    const events: RealtimeEvent[] = []; const snapshots: RealtimeSnapshot[] = [];
    const bullets: Bullet[] = []; const sounds: SoundEvent[] = []; const engagements: RealtimeEngagement[] = [];
    const openingSearchSeconds = scoutPlan?.indices.length ? scoutPlan.seconds : 0;
    const log = (event: RealtimeEvent) => events.push(event);
    // 시야·소리의 순간 위치만 팀에 전달하고 적의 현재 위치는 보고하지 않습니다.
    const publishTeamReport = (unit: RealtimeUnitState, kind: TeamReport['kind'], position: RealtimeVector, now: number, observedAt = now): void => {
      const reports = teamReports.get(unit.side)!;
      const previous = reports.find((report) => report.reporterId === unit.id && report.kind === kind);
      if (previous && now - previous.at < 0.6 && distance(previous.position, position) < 30) return;
      const confidence = kind === 'visual' ? 0.75 : 0.45;
      const report = { reporterId: unit.id, side: unit.side, kind, position: { ...position }, at: observedAt, confidence };
      teamReports.set(unit.side, [...reports.filter((candidate) => candidate.reporterId !== unit.id || candidate.kind !== kind), report]
        .filter((candidate) => now - candidate.at <= 6));
      {
        log({
          time: now,
          type: 'intel',
          actor: unit.id,
          message: kind === 'visual' ? '시야 접촉 위치를 팀에 보고' : '소리 발생 위치를 팀에 보고',
          position: { ...position },
          goal: '관측 시점의 위치만 공유',
          side: unit.side,
        });
      }
    };
    // 동료 보고 중 가장 최근의 고정 위치만 받아 오래된 정보와 구분합니다.
    const latestTeamReport = (unit: RealtimeUnitState, now: number): TeamReport | undefined => teamReports
      .get(unit.side)!
      .filter((report) => report.reporterId !== unit.id && now - report.at <= 6)
      .sort((left, right) => {
        const score = (report: TeamReport): number => distance(unit.position, report.position) + (now - report.at) * 60
          - (report.reporterId === unit.knowledge.reportedBy && now - report.at < 2.5 ? 180 : 0);
        return score(left) - score(right);
      })[0];
    // 동료가 도착해 비어 있음을 확인하면 해당 위치의 오래된 팀 보고를 폐기합니다.
    const clearTeamReportsAt = (side: OperatorSide, position: RealtimeVector, now: number): void => {
      teamReports.set(side, teamReports.get(side)!.filter((report) =>
        distance(report.position, position) > 28 || now - report.at < 0.5));
    };
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
        const hit = Boolean(target?.alive && bullet.hit
          && distance(target.position, bullet.targetPosition) <= UNIT_RADIUS
          && this.hasLineOfSight(bullet.position, target.position, map));
        log({ time: now, type: 'impact', actor: bullet.from, target: bullet.target,
          message: hit ? `${target!.callSign}에게 탄착` : '발사 시점의 탄착 지점 도달',
          position: { ...bullet.targetPosition }, targetPosition: { ...bullet.targetPosition }, hit });
        if (hit && target) {
          const shooter = byId.get(bullet.from);
          if (shooter) this.engagement(engagements, shooter, target, now).hits += 1;
          target.hp = Math.max(0, target.hp - bullet.damage);
          if (target.hp === 0) {
            target.alive = false; target.action = 'dead'; target.velocity = { x: 0, y: 0 };
            target.reloadRemaining = 0;
            log({ time: now, type: 'death', actor: bullet.from, target: target.id,
              message: `${target.callSign} 사망`, position: { ...target.position } });
          }
        }
      }
      if(operation.step(now,units.filter(unit=>unit.side==='공격'),directorOrders.get('공격')?.mode==='retreat')) {
        const state=operation.snapshot();
        const labels={scouting:'선발조 수색',returning:'선발조 복귀',regrouping:'진압조 합류',entering:'합류 완료 · 재진입'};
        log({time:now,type:'objective',message:labels[state.phase],goal:`operation:${state.phase}`,side:'공격'});
        for(const unit of units.filter(unit=>unit.side==='공격')) {pathCache.delete(unit.id);retreatGoals.delete(unit.id);if(state.phase==='entering')unit.routeStep=1;}
      }
      const operationState=operation.snapshot();
      const objectiveState = objective.snapshot();
      const activeDevice = objectiveState.phase === 'active' || objectiveState.phase === 'disabling';
      const carrier = byId.get(objectiveState.carrierId ?? '');
      const droppedPosition = objectiveState.devicePosition ?? (carrier && !carrier.alive ? carrier.position : undefined);
      const taskSide: OperatorSide = activeDevice ? '수비' : '공격';
      const deviceTarget = activeDevice || !carrier?.alive ? droppedPosition : undefined;
      const nextTaskKey = deviceTarget ? `${taskSide}:${deviceTarget.x}:${deviceTarget.y}` : '';
      if (nextTaskKey !== taskKey || !byId.get(taskActorId ?? '')?.alive) {
        taskKey = nextTaskKey;
        // 공개된 장치 위치까지 실제로 도달 가능한 동료 중 한 명만 상호작용 임무를 맡습니다.
        taskActorId = deviceTarget ? living(taskSide).map(unit => {
          const path = this.findPath(unit.position, deviceTarget, map, navigationNodes);
          let prior = unit.position, cost = 0;
          for (const point of path) { cost += distance(prior, point); prior = point; }
          return { id: unit.id, cost: path.length || distance(unit.position, deviceTarget) < 30 ? cost : Infinity };
        }).filter(candidate => Number.isFinite(candidate.cost)).sort((a,b) => a.cost - b.cost || a.id.localeCompare(b.id))[0]?.id : undefined;
      }
      let interaction: BombInteraction | undefined;
      // 최근 2.5초의 소리만 유지해 감각 판정이 틱 수에 따라 느려지지 않게 합니다.
      for (let soundIndex = sounds.length - 1; soundIndex >= 0; soundIndex -= 1) {
        if (now - sounds[soundIndex].at >= 2.5) sounds.splice(soundIndex, 1);
      }
      for (const unit of units) {
        unit.velocity = { x: 0, y: 0 };
        if (!unit.alive) continue;
        const me = stat.get(unit.id)!; const enemies = living(unit.side === '공격' ? '수비' : '공격');
        const visible = enemies.filter((enemy) => this.canSee(unit, enemy.position, map));
        const seen = visible.sort((a, b) => distance(unit.position, a.position) - distance(unit.position, b.position))[0];
        const hearing = sounds.filter((sound) => byId.get(sound.owner)?.side !== unit.side && this.heard(unit, sound, map, now));
        const latestSound = hearing.sort((a, b) => b.at - a.at)[0];
        const recentSound = latestSound && now - latestSound.at < 0.8 ? latestSound : undefined;
        // 발사 대상은 실제로 시야에 들어온 적만 허용합니다.
        const target = seen;
        if (seen) {
          unit.knowledge = {
            lastKnownPosition: { ...seen.position },
            lastKnownAt: now,
            confidence: 1,
            source: 'self-visual',
            reportedBy: unit.id,
          };
          publishTeamReport(unit, 'visual', seen.position, now);
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
              source: 'self-sound',
              reportedBy: unit.id,
            };
            publishTeamReport(unit, 'sound', recentSound.source, now, recentSound.at);
          } else {
            const sharedReport = latestTeamReport(unit, now);
            if (sharedReport && (
              unit.knowledge.lastKnownAt === undefined
              || sharedReport.at > unit.knowledge.lastKnownAt
            )) {
              const reportAge = now - sharedReport.at;
              unit.knowledge = {
                lastKnownPosition: { ...sharedReport.position },
                lastKnownAt: sharedReport.at,
                confidence: clamp(sharedReport.confidence * (1 - reportAge / 6), 0.05, 0.75),
                source: sharedReport.kind === 'visual' ? 'team-visual' : 'team-sound',
                reportedBy: sharedReport.reporterId,
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
        }
        const lastKnownPosition = unit.knowledge.lastKnownPosition;
        if (!seen && lastKnownPosition) unit.facing = Math.atan2(lastKnownPosition.y - unit.position.y, lastKnownPosition.x - unit.position.x);
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
          clearTeamReportsAt(unit.side, lastKnownPosition, now);
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
        const anchorDuty = unit.side === '수비' && (unit.routeIndex === 2 || unit.routeIndex === 3) && !activeDevice;
        const defenderSet = Boolean(defenderSetup && distance(unit.position, defenderSetup.position) < 115)
          || (unit.side === '수비' && distance(unit.position, objectiveCenter) < 220);
        const openingSearch = operationState.phase !== 'entering';
        const isOpeningScout = openingSearch
          && unit.side === '공격'
          && operationState.phase === 'scouting' && operationState.scoutIds.includes(unit.id);
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
          && (!investigateSound || unit.routeIndex % 2 === 0),
        );
        const lowHealth = unit.hp <= 35;
        const outnumbered = enemies.length > living(unit.side).length;
        const losingPosition = Boolean(
          (lowHealth && (seen || hasUnresolvedLead))
          || (outnumbered && unit.hp <= 65 && (seen || hasUnresolvedLead))
          || (isClutch && unit.hp <= 55 && (seen || hasUnresolvedLead)),
        );
        const weapon = weaponProfileFor(me.operator);
        if (unit.reloadRemaining > 0) {
          // 장전은 시작하면 취소하지 않고, 사선 이탈을 시도하며 완료까지 한 번만 진행합니다.
          unit.reloadRemaining = Math.max(0, unit.reloadRemaining - 0.1);
          unit.action = 'reload';
          unit.goal = '장전 중 · 알려진 위협에서 사선 이탈';
          if (!retreatGoals.has(unit.id)) retreatGoals.set(unit.id, this.reloadDestination(unit, map));
          this.move(
            unit,
            retreatGoals.get(unit.id)!,
            me,
            map,
            now,
            units,
            navigationNodes,
            pathCache,
            yieldUntil,
            blockedUntil,
            log,
            portalReservations,
          );
          if (unit.reloadRemaining <= 0) {
            const loaded = Math.min(unit.magazineSize, unit.reserveAmmo);
            unit.ammo = loaded;
            unit.reserveAmmo -= loaded;
            retreatGoals.delete(unit.id);
            unit.action = 'hold';
            unit.goal = '장전 완료 · 다음 판단 대기';
            log({
              time: now,
              type: 'reload',
              actor: unit.id,
              message: `${unit.callSign} 장전 완료`,
              position: { ...unit.position },
              goal: `${unit.ammo}/${unit.magazineSize} · 예비 ${unit.reserveAmmo}`,
            });
          }
          continue;
        }
        if (unit.ammo <= 0 && unit.reserveAmmo > 0) {
          // 빈 탄창에서는 사격하지 않고 장전을 한 번 시작해 예비 탄약만 사용합니다.
          unit.reloadRemaining = weapon.profile.reloadSeconds;
          unit.action = 'reload';
          unit.goal = '장전 시작 · 안전 위치 선택';
          log({
            time: now,
            type: 'reload',
            actor: unit.id,
            message: `${unit.callSign} 장전 시작`,
            position: { ...unit.position },
            goal: `${unit.ammo}/${unit.magazineSize} · 예비 ${unit.reserveAmmo}`,
          });
          continue;
        }
        const order = directorOrders.get(unit.side);
        const operationGoal = unit.side==='공격' && openingSearch
          ? isOpeningScout ? scoutDestinations.get(unit.id) : rally.get(unit.id)
          : undefined;
        const operationMoving = Boolean(operationGoal && distance(unit.position,operationGoal)>24);
        const objectiveSite = map.sites.find(site => site.id === objectiveState.siteId) ?? plannedSite;
        const plantPoint = objectiveSite.plantAnchors[0];
        const objectiveTask = activeDevice ? unit.id === taskActorId
          : unit.id === objectiveState.carrierId || unit.id === taskActorId;
        const taskPoint = activeDevice || unit.id === taskActorId ? deviceTarget : plantPoint;
        const withinReach = taskPoint && distance(unit.position, taskPoint) <= (activeDevice ? 28 : 22)
          && this.hasLineOfSight(unit.position, taskPoint, map);
        if (!openingSearch && objectiveTask && withinReach && !seen && order?.mode !== 'hold' && order?.mode !== 'retreat') {
          const type: BombInteraction['type'] = activeDevice ? 'disable' : unit.id === objectiveState.carrierId ? 'plant' : 'pickup';
          interaction = { actorId: unit.id, type, siteId: objectiveSite.id };
          unit.action = type === 'disable' ? 'disable' : type === 'plant' ? 'plant' : 'hold';
          unit.goal = type === 'disable' ? '해체 장치 무력화' : type === 'plant' ? `${objectiveSite.id} 사이트 장치 설치` : '유실 장치 회수';
          unit.cooldown = Math.max(0, unit.cooldown - 0.1);
          continue;
        }
        // 낮은 공격성도 일정 시간 이상 시야를 유지하면 결정을 끝내야 합니다.
        const aimTimedOut = Boolean(seen && visualContactDuration >= 1.2);
        if (target) unit.facing = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
        const muzzle = muzzlePosition(unit.callSign, unit.position, unit.facing);
        const muzzleClear = this.hasLineOfSight(unit.position, muzzle, map)
          && (!target || this.hasLineOfSight(muzzle, target.position, map));
        const canFire = unit.cooldown <= 0 && unit.ammo > 0 && muzzleClear;
        const shouldFire = Boolean(seen && canFire && !losingPosition
          && (aggression > 0.25 || isClutch || aimTimedOut));
        const outOfAmmo = unit.ammo <= 0;
        const directorOrder = directorOrders.get(unit.side);
        const forcedPush = directorOrder?.mode === 'push';
        const forcedHold = directorOrder?.mode === 'hold';
        const forcedRetreat = directorOrder?.mode === 'retreat';
        const shouldReposition = Boolean(forcedRetreat || ((losingPosition || outOfAmmo) && !shouldFire));
        const needsObjectiveMove = Boolean(objectiveTask && taskPoint && !withinReach) || activeDevice;
        const movementHold = Math.max(yieldUntil.get(unit.id) ?? 0, blockedUntil.get(unit.id) ?? 0);
        const shouldSearch = Boolean(
          !seen
          && !forcedHold
          && !holdAngleAfterSound
          && !anchorDuty
          && (isOpeningScout || investigateSound || isSearching
            || hasUnresolvedLead && lastKnownPosition && distance(unit.position, lastKnownPosition) < 500),
        );
        let desired: RealtimeAction = shouldReposition
          ? 'reposition'
          : shouldFire
            ? 'fire'
            : movementHold > now
              ? 'hold'
            : forcedHold
              ? 'hold'
              : forcedPush
                ? 'approach'
            : seen
              ? 'aim'
              : operationGoal ? operationMoving ? (isOpeningScout ? 'search' : 'approach') : 'hold'
              : needsObjectiveMove && !openingSearch
                ? 'approach'
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
              : desired === 'hold' ? '담당 구역 각 유지'
                : desired === 'approach' ? (objectiveTask ? `${objectiveSite.id} 사이트 목표 임무 접근` : '담당 진입로·지원 위치 전진') : unit.goal;
          unit.action = desired; log({
            time: now, type: 'action', actor: unit.id, message: `${unit.callSign}: ${desired}`,
            position: { ...unit.position }, goal: unit.goal,
          });
          // 최소 0.3초 동안은 새 판단을 잠가 행동 떨림을 막습니다.
          actionLockUntil.set(unit.id, now + 0.3);
        }
        if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - 0.1);
        if (shouldFire && target) {
          // 총몸은 실제 조준 대상을 향해 회전하고, 이동 방향과 별도로 표시됩니다.
          unit.facing = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
          const engagement = this.engagement(engagements, unit, target, now);
          unit.action = 'fire';
          engagement.shots += 1; unit.ammo -= 1; unit.cooldown = 0.45;
          const hitChance = clamp(0.16 + aim * 0.58 + me.player.teamSynergy / 500 + me.operator.stats.aim / 500
            + (this.inCover(unit.position, map) ? 0.08 : 0) - distance(unit.position, target.position) / 5000, 0.08, 0.94);
          const hit = random.next() < hitChance;
          const flight = distance(muzzle, target.position) / 900;
          const targetPosition = { ...target.position };
          bullets.push({
            from: unit.id, target: target.id, position: { ...muzzle }, targetPosition,
            direction: { x: targetPosition.x - muzzle.x, y: targetPosition.y - muzzle.y },
            eta: now + flight, damage: hit ? 34 : 0, hit,
          });
          sounds.push({ at: now, source: { ...unit.position }, kind: 'gunshot', loudness: me.operator.callSign === 'COLLIER' ? 0.38 : 1, owner: unit.id });
          log({
            time: now, type: 'shot', actor: unit.id, target: target.id,
            message: `${unit.callSign} 발사`, position: { ...muzzle },
            targetPosition, travelSeconds: flight, hit, blocked: !muzzleClear, side: unit.side,
          });
        } else if (!seen && unit.action !== 'hold' && unit.action !== 'aim' || seen && shouldReposition) {
          // 공격자는 돌입점으로 전진하고, 수비자는 소리·마지막 위치·열세 판단에 따라 움직입니다.
          const routeGoal = this.attackerDestination(unit, map);
          const route=map.attackerRoutes[unit.routeIndex % map.attackerRoutes.length];
          const firstInterior=route.points.findIndex(point=>point.x>map.building.x&&point.x<map.building.x+map.building.width
            &&point.y>map.building.y&&point.y<map.building.y+map.building.height);
          const routeDone=unit.routeStep>Math.max(0,firstInterior);
          const guardPoints = objectiveSite.defendAnchors;
          const guardPoint = guardPoints[unit.formationIndex % guardPoints.length];
          const attackerGoal = routeDone ? (unit.id === objectiveState.carrierId ? plantPoint : guardPoint) : routeGoal;
          const missionDestination = objectiveTask && taskPoint && (activeDevice || unit.id === taskActorId || routeDone)
            ? taskPoint : activeDevice ? guardPoint : undefined;
          const searchPoint = map.searchPoints[unit.routeIndex % map.searchPoints.length];
          if (shouldReposition && !retreatGoals.has(unit.id)) retreatGoals.set(unit.id, this.retreatDestination(unit, map));
          if (!shouldReposition) retreatGoals.delete(unit.id);
          const destination = shouldReposition
            ? forcedRetreat ? rally.get(unit.id) ?? retreatGoals.get(unit.id)! : retreatGoals.get(unit.id)!
            : operationGoal ?? missionDestination ?? seen?.position
              ?? (isSearching && searchOrigin.get(unit.id)
                ? this.searchDestination(searchOrigin.get(unit.id)!, unit, now, map)
                : (hasUnresolvedLead && lastKnownPosition && shouldSearch
                  ? (unit.action === 'search'
                    ? this.searchDestination(lastKnownPosition, unit, now, map)
                    : lastKnownPosition)
                  : isOpeningScout && searchPoint
                    ? searchPoint
                    : unit.side === '공격'
                      ? this.supportDestination(unit, attackerGoal, units, map)
                      : defenderSetup?.position ?? objectiveCenter));
          if(operationGoal) unit.goal = isOpeningScout ? '선발조 수색 · 지정 방향 확인' : operationState.phase==='scouting' ? '진압조 대기 · 선발조 보고 수신' : '실제 복귀 · 진압조와 합류';
          this.move(
            unit,
            destination,
            me,
            map,
            now,
            units,
            navigationNodes,
            pathCache,
            yieldUntil,
            blockedUntil,
            log,
            portalReservations,
          );
        }
        if (unit.cooldown <= 0 && unit.action === 'approach') sounds.push({ at: now, source: { ...unit.position }, kind: 'footstep', loudness: 0.25, owner: unit.id });
      }
      for (const e of sounds) if (e.at === now) log({ time: now, type: 'sound', actor: e.owner, message: e.kind === 'gunshot' ? '총성' : '발소리', position: e.source });
      const objectiveEvents = objective.step(now, units.map(unit => ({
        id: unit.id, side: unit.side, alive: unit.alive, position: unit.position,
        canInteract: unit.alive && unit.reloadRemaining <= 0 && unit.velocity.x === 0 && unit.velocity.y === 0
          && ['plant', 'disable', 'hold'].includes(unit.action),
      })), interaction);
      for (const event of objectiveEvents) log({ ...event, type: 'objective', goal: event.kind });
      const bombState = objective.snapshot();
      const snapshot = { time: now, objective: bombState, operation: operationState, units: units.map((u) => ({ ...u, position: { ...u.position }, velocity: { ...u.velocity }, knowledge: { ...u.knowledge } })) };
      snapshots.push(snapshot);
      const command = yield { time: now, snapshot, events: events.slice(eventCursor) };
      eventCursor = events.length;
      if (bombState.phase === 'resolved') break;
      if (command) applyDirectorCommand(command, (tick + 1) / 10);
    }
    for (const e of engagements) {
      const defender = byId.get(e.defenderId), attacker = byId.get(e.attackerId);
      if (!defender?.alive) e.winner = '공격'; else if (!attacker?.alive) e.winner = '수비';
    }
    const bombState = objective.snapshot();
    if (!bombState.winner) throw new Error('목표 판정 없이 라운드가 종료되었습니다.');
    const winner = bombState.winner;
    const executionTime = snapshots.at(-1)?.time ?? 0;
    return {
      winner,
      objective: bombState,
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
  /** 최초 방향은 지도 출입구·진입 경로만 사용하며 적 위치를 조회하지 않습니다. */
  private startFacing(unit: RealtimeUnitInput, index: number, attackers: number, map: TacticalMapDefinition): number {
    const position = this.startPosition(unit, index, attackers, map);
    const target = unit.side === '공격'
      ? map.attackerRoutes[index % map.attackerRoutes.length].points[1] ?? map.breachEntryPoint
      : [...map.portals].sort((a,b) => distance(position, a.center) - distance(position, b.center))[0]?.center ?? map.breachEntryPoint;
    return Math.atan2(target.y - position.y, target.x - position.x);
  }

  /** 공격 유닛마다 담당 진입로의 다음 경유점만 바라보게 합니다. */
  private attackerDestination(unit: RealtimeUnitState, map: TacticalMapDefinition): TacticalPoint {
    const route = map.attackerRoutes[unit.routeIndex % map.attackerRoutes.length];
    // 수색·교전으로 이미 지나친 진입 경유점까지 역행하지 않습니다.
    while(unit.routeStep<route.points.length-1) {
      const current=route.points[unit.routeStep],next=route.points[unit.routeStep+1];
      const passed=(unit.position.x-current.x)*(next.x-current.x)+(unit.position.y-current.y)*(next.y-current.y)>1;
      if(!passed||pointToSegmentDistance(unit.position,current,next)>100) break;
      unit.routeStep+=1;
    }
    const point = route.points[Math.min(unit.routeStep, route.points.length - 1)];
    if (distance(unit.position, point) < 38 && unit.routeStep < route.points.length) unit.routeStep += 1;
    if (unit.routeStep < route.points.length) return route.points[unit.routeStep];
    // 진입로 끝에 멈추지 않고 각 선수의 거점 접근 위치까지 임무를 이어갑니다.
    return route.points[route.points.length - 1];
  }
  /** 지도에 있는 문·경로·엄폐 가장자리만 사용하도록 내비게이션 후보점을 만듭니다. */
  private buildNavigationNodes(map: TacticalMapDefinition): RealtimeVector[] {
    const candidates: RealtimeVector[] = [];
    const add = (point: TacticalPoint): void => {
      if (!candidates.some((candidate) => distance(candidate, point) < 2)) candidates.push({ ...point });
    };
    map.attackerRoutes.forEach((route) => route.points.forEach(add));
    map.defenderSetups.forEach((setup) => { add(setup.position); add(setup.fallback); });
    map.searchPoints.forEach(add);
    map.portals.forEach(portal => {
      add(portal.center);
      const offset = UNIT_RADIUS + WALL_HALF_WIDTH + 8;
      for (const side of [-1, 1]) add({
        x: portal.center.x + (portal.axis === 'vertical' ? offset * side : 0),
        y: portal.center.y + (portal.axis === 'horizontal' ? offset * side : 0),
      });
    });
    map.entrances.forEach(entrance => { add(entrance.outside); add(entrance.center); add(entrance.inside); });
    map.sites.forEach(site => { site.plantAnchors.forEach(add); site.defendAnchors.forEach(add); });
    map.walls.filter(wall => wall.kind !== 'door-gap').forEach(wall => {
      for (const end of [wall.from, wall.to]) for (const dx of [-1,1]) for (const dy of [-1,1])
        add({ x: end.x + dx * 24, y: end.y + dy * 24 });
    });
    add(map.attackerSpawn); add(map.defenderSpawn); add(map.returnPoint);
    add({ x: map.objectiveZone.x + map.objectiveZone.width / 2, y: map.objectiveZone.y + map.objectiveZone.height / 2 });
    add({
      x: (map.doorGap.from.x + map.doorGap.to.x) / 2,
      y: (map.doorGap.from.y + map.doorGap.to.y) / 2,
    });
    map.covers.forEach((cover) => this.coverStagingPoints(cover, map).forEach(add));
    return candidates.filter((candidate) => this.canStand(candidate, map));
  }

  /** 전투원 몸 반경을 고려해 한 점에 설 수 있는지 판정합니다. */
  private canStand(point: TacticalPoint, map: TacticalMapDefinition): boolean {
    if (point.x < UNIT_RADIUS || point.x > map.width - UNIT_RADIUS
      || point.y < UNIT_RADIUS || point.y > map.height - UNIT_RADIUS) return false;
    if (map.walls.some((wall) =>
      wall.kind !== 'door-gap' && pointToSegmentDistance(point, wall.from, wall.to) < UNIT_RADIUS + WALL_HALF_WIDTH)) return false;
    return !map.covers.some((cover) =>
      point.x >= cover.rect.x - UNIT_RADIUS
      && point.x <= cover.rect.x + cover.rect.width + UNIT_RADIUS
      && point.y >= cover.rect.y - UNIT_RADIUS
      && point.y <= cover.rect.y + cover.rect.height + UNIT_RADIUS);
  }

  /** 개인의 방향·거리·벽을 모두 만족한 대상만 현재 시야로 인식합니다. */
  private canSee(unit: RealtimeUnitState, point: TacticalPoint, map: TacticalMapDefinition): boolean {
    const range = distance(unit.position, point);
    if (range > 1200 || !this.hasLineOfSight(unit.position, point, map)) return false;
    const angle = Math.atan2(point.y - unit.position.y, point.x - unit.position.x) - unit.facing;
    return range < 60 || Math.cos(angle) >= Math.cos(Math.PI * 0.4);
  }

  /** 두 지점 사이를 작은 간격으로 검사해 벽·엄폐물 통과를 막습니다. */
  private canTraverse(from: TacticalPoint, to: TacticalPoint, map: TacticalMapDefinition): boolean {
    if (!this.canStand(from, map) || !this.canStand(to, map)) return false;
    if (map.walls.some(wall => wall.kind !== 'door-gap' && (
      intersects(from, to, wall.from, wall.to)
      || Math.min(pointToSegmentDistance(from, wall.from, wall.to), pointToSegmentDistance(to, wall.from, wall.to),
        pointToSegmentDistance(wall.from, from, to), pointToSegmentDistance(wall.to, from, to)) < UNIT_RADIUS + WALL_HALF_WIDTH
    ))) return false;
    return !map.covers.some(cover => {
      const r = cover.rect, left = r.x - UNIT_RADIUS, right = r.x + r.width + UNIT_RADIUS;
      const top = r.y - UNIT_RADIUS, bottom = r.y + r.height + UNIT_RADIUS;
      const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
      return corners.some((corner, index) => intersects(from, to, corner, corners[(index + 1) % 4]));
    });
  }

  /** 통행 가능한 그래프에서 가장 짧은 경로를 찾아 직선 통과를 대체합니다. */
  private findPath(start: TacticalPoint, goal: TacticalPoint, map: TacticalMapDefinition, nodes: RealtimeVector[]): RealtimeVector[] {
    const end = this.canStand(goal, map)
      ? goal
      : [...nodes].sort((left, right) => distance(left, goal) - distance(right, goal))[0];
    if (!end || !this.canStand(start, map) || !this.canStand(end, map)) return [];
    if (this.canTraverse(start, end, map)) return [{ ...end }];
    const points = [
      { ...start },
      { ...end },
      ...nodes,
    ];
    // 고정 지형 노드 사이의 통행 판정은 세션당 한 번만 계산합니다.
    let links = this.navigationLinks.get(nodes);
    if (!links) {
      links = nodes.map(() => nodes.map(() => false));
      // 가까운 가시 노드를 양방향으로 연결합니다. 모든 먼 노드 쌍의 지형 검사를 초기 틱에 몰지 않습니다.
      nodes.forEach((from, index) => {
        const neighbors = nodes.map((to, next) => ({ to, next, length: distance(from, to) }))
          .filter(candidate => candidate.next !== index).sort((a,b) => a.length - b.length).slice(0, 48);
        let connected = 0;
        for (const neighbor of neighbors) {
          if (this.canTraverse(from, neighbor.to, map)) {
            links![index][neighbor.next] = true;
            links![neighbor.next][index] = true;
            if (++connected >= 16) break;
          }
        }
      });
      this.navigationLinks.set(nodes, links);
    }
    const costs = points.map(() => Number.POSITIVE_INFINITY);
    const previous = points.map(() => -1);
    const visited = points.map(() => false);
    costs[0] = 0;
    for (let iteration = 0; iteration < points.length; iteration += 1) {
      let current = -1;
      for (let index = 0; index < points.length; index += 1) {
        if (!visited[index] && (current < 0 || costs[index] < costs[current])) current = index;
      }
      if (current < 0 || !Number.isFinite(costs[current])) break;
      visited[current] = true;
      if (current === 1) break;
      for (let next = 1; next < points.length; next += 1) {
        if (visited[next] || !(current >= 2 && next >= 2
          ? links[current - 2][next - 2] : this.canTraverse(points[current], points[next], map))) continue;
        const cost = costs[current] + distance(points[current], points[next]);
        if (cost < costs[next]) {
          costs[next] = cost;
          previous[next] = current;
        }
      }
    }
    if (previous[1] < 0) return [];
    const path: RealtimeVector[] = [];
    for (let current = 1; current >= 0; current = previous[current]) {
      path.unshift(points[current]);
      if (current === 0) break;
    }
    return path.slice(1);
  }

  /** 엄폐물 안이 아니라 가장자리에서 위협을 끊을 수 있는 대기점을 생성합니다. */
  private coverStagingPoints(cover: TacticalMapDefinition['covers'][number], map: TacticalMapDefinition): RealtimeVector[] {
    const margin = UNIT_RADIUS + 12;
    return [
      // 모서리 바깥 경유점이 있어야 긴 책장과 서버 랙을 끝까지 돌아갈 수 있습니다.
      { x: cover.rect.x - margin, y: cover.rect.y - margin },
      { x: cover.rect.x + cover.rect.width + margin, y: cover.rect.y - margin },
      { x: cover.rect.x - margin, y: cover.rect.y + cover.rect.height + margin },
      { x: cover.rect.x + cover.rect.width + margin, y: cover.rect.y + cover.rect.height + margin },
      { x: cover.rect.x - margin, y: cover.rect.y + cover.rect.height / 2 },
      { x: cover.rect.x + cover.rect.width + margin, y: cover.rect.y + cover.rect.height / 2 },
      { x: cover.rect.x + cover.rect.width / 2, y: cover.rect.y - margin },
      { x: cover.rect.x + cover.rect.width / 2, y: cover.rect.y + cover.rect.height + margin },
    ].filter((point) => point.x >= UNIT_RADIUS && point.x <= map.width - UNIT_RADIUS
      && point.y >= UNIT_RADIUS && point.y <= map.height - UNIT_RADIUS);
  }

  /** 같은 공격 경로의 선두와 지원자가 서로 다른 사선에 서도록 목표를 벌립니다. */
  private supportDestination(unit: RealtimeUnitState, goal: TacticalPoint, units: RealtimeUnitState[], map: TacticalMapDefinition): TacticalPoint {
    if (unit.side !== '공격') return goal;
    const occupied = units.some(other => other.alive && other.id !== unit.id && other.side === unit.side
      && distance(other.position, goal) < TEAMMATE_CLEARANCE);
    if (!occupied) return goal;
    const angle = unit.formationIndex * 2.399963;
    const candidate = { x: goal.x + Math.cos(angle) * 65, y: goal.y + Math.sin(angle) * 65 };
    return this.canStand(candidate, map) ? candidate : goal;
  }

  /** 장전 중에는 마지막 위협에서 멀어지는 엄폐 가장자리를 우선 목표로 삼습니다. */
  private reloadDestination(unit: RealtimeUnitState, map: TacticalMapDefinition): TacticalPoint {
    return this.retreatDestination(unit, map);
  }

  /** 이동이 막힌 이유를 이벤트로 남기고, 다음 재탐색 틱까지 안전하게 대기시킵니다. */
  private holdMovement(
    unit: RealtimeUnitState,
    goal: string,
    until: Map<string, number>,
    now: number,
    duration: number,
    log: (event: RealtimeEvent) => void,
  ): void {
    until.set(unit.id, now + duration);
    unit.velocity = { x: 0, y: 0 };
    if (unit.action === 'hold' && unit.goal === goal) return;
    unit.action = 'hold';
    unit.goal = goal;
    log({
      time: now,
      type: 'action',
      actor: unit.id,
      message: `${unit.callSign}: hold`,
      position: { ...unit.position },
      goal,
    });
  }

  /** 경로·몸 충돌·동료 간격을 한 틱씩 검사하며 실제 위치만 갱신합니다. */
  private move(
    unit: RealtimeUnitState,
    goal: TacticalPoint,
    me: RealtimeUnitInput,
    map: TacticalMapDefinition,
    now: number,
    units: RealtimeUnitState[],
    nodes: RealtimeVector[],
    pathCache: Map<string, NavigationPlan>,
    yieldUntil: Map<string, number>,
    blockedUntil: Map<string, number>,
    log: (event: RealtimeEvent) => void,
    reservations: Map<string, PortalReservation> = new Map(),
  ): void {
    if (!unit.alive) return;
    const goalKey = `${Math.round(goal.x)}:${Math.round(goal.y)}`;
    let plan = pathCache.get(unit.id);
    const cachedPoint = plan?.points[plan.index];
    if (!plan || distance(plan.goal, goal) > 70 || (!cachedPoint && distance(unit.position, goal) > 24) || (cachedPoint && !this.canTraverse(unit.position, cachedPoint, map))) {
      const points = this.findPath(unit.position, goal, map, nodes);
      plan = { goalKey, goal: { ...goal }, points, index: 0 };
      pathCache.set(unit.id, plan);
    }
    while (plan.index < plan.points.length && distance(unit.position, plan.points[plan.index]) <= 2) plan.index += 1;
    const waypoint = plan.points[plan.index];
    if (!waypoint) {
      unit.velocity = { x: 0, y: 0 };
      if (distance(unit.position, goal) <= 24 && unit.action !== 'reload') {
        unit.action = 'hold';
        unit.goal = '임무 지점 도착 · 각 유지';
      } else if (distance(unit.position, goal) > 24) {
        if (unit.action === 'reload') {
          blockedUntil.set(unit.id, now + 0.4);
        } else {
          this.holdMovement(unit, '이동 경로 없음 · 통행 경로 재탐색 중', blockedUntil, now, 0.8, log);
        }
        pathCache.delete(unit.id);
      }
      return;
    }
    // 좁은 문은 한 방향씩 통과합니다. 예약은 문 바깥으로 빠져나가거나 사망하면 해제합니다.
    for (const portal of map.portals) {
      const axis = portal.axis === 'vertical' ? 'x' : 'y';
      const offset = unit.position[axis] - portal.center[axis];
      const crossing = offset * (waypoint[axis] - portal.center[axis]) <= 0
        && pointToSegmentDistance(portal.center, unit.position, waypoint) <= portal.width / 2;
      const key = `${unit.side}:${portal.id}`;
      const reservation = reservations.get(key);
      const owner = units.find(other => other.id === reservation?.ownerId);
      if (reservation && (!owner?.alive || reservation.expires < now
        || (owner.position[axis] - portal.center[axis]) * reservation.approach < -65)) reservations.delete(key);
      if (!crossing || distance(unit.position, portal.center) > 125) continue;
      let current = reservations.get(key);
      // 같은 방향의 맨 앞 선수에게 통행권을 넘겨 뒤쪽 예약자가 앞사람을 막는 순환 대기를 끊습니다.
      if(current&&current.ownerId!==unit.id&&owner&&Math.sign(offset)===current.approach
        &&distance(unit.position,portal.center)+2<distance(owner.position,portal.center)) {
        current={ownerId:unit.id,approach:Math.sign(offset)||1,expires:now+6};
        reservations.set(key,current);
      }
      if (current && current.ownerId !== unit.id) {
        this.holdMovement(unit, '문 통과 순서 대기 · 동료 통행 확보', yieldUntil, now, 0.2, log);
        return;
      }
      if (!current) reservations.set(key, { ownerId: unit.id, approach: Math.sign(offset) || 1, expires: now + 6 });
    }
    const dx = waypoint.x - unit.position.x;
    const dy = waypoint.y - unit.position.y;
    const length = Math.hypot(dx, dy) || 1;
    unit.facing = Math.atan2(dy, dx);
    const defensive = unit.side === '수비';
    const speed = (defensive ? 32 : 42) + me.operator.stats.entry / 5 + me.player.teamSynergy / 20;
    const step = Math.min(speed / 10, length);
    const next = {
      x: unit.position.x + dx / length * step,
      y: unit.position.y + dy / length * step,
    };
    if (!this.canTraverse(unit.position, next, map)) {
      if (unit.action === 'reload') {
        unit.velocity = { x: 0, y: 0 };
        blockedUntil.set(unit.id, now + 0.4);
      } else {
        this.holdMovement(unit, '이동 경로 차단 · 통행 경로 재탐색 중', blockedUntil, now, 0.8, log);
      }
      pathCache.delete(unit.id);
      return;
    }
    const blocker = units
      .filter((candidate) => candidate.alive && candidate.side === unit.side && candidate.id !== unit.id)
      .filter((candidate) => distance(candidate.position, next) < TEAMMATE_CLEARANCE)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (blocker) {
      // 같은 방향으로 움직이는 선두는 잠깐 기다립니다. 매 틱 좌우 회피를 바꾸지 않습니다.
      const following = blocker.velocity.x * dx + blocker.velocity.y * dy > 0
        && pointToSegmentDistance(blocker.position, unit.position, waypoint) < TEAMMATE_CLEARANCE;
      const clearance = TEAMMATE_CLEARANCE + 8;
      const ahead = (blocker.position.x - unit.position.x) * dx / length
        + (blocker.position.y - unit.position.y) * dy / length;
      const candidates = [1, -1].map(side => [
        { x: unit.position.x - dy / length * clearance * side,
          y: unit.position.y + dx / length * clearance * side },
        { x: unit.position.x + dx / length * (Math.max(0, ahead) + clearance) - dy / length * clearance * side,
          y: unit.position.y + dy / length * (Math.max(0, ahead) + clearance) + dx / length * clearance * side },
      ]);
      // 우회 지점을 먼저 확정한 뒤 실제 보행으로 도착합니다. 벽·동료를 통과시키지 않습니다.
      const detour = !following && (plan.detourUntil ?? 0) <= now && candidates.find(points => {
        const chain = [unit.position, ...points];
        return chain.slice(1).every((point, index) => this.canTraverse(chain[index], point, map)
          && units.every(other => !other.alive || other.id === unit.id || other.side !== unit.side
            || pointToSegmentDistance(other.position, chain[index], point) >= TEAMMATE_CLEARANCE));
      });
      if (detour) {
        plan.points.splice(plan.index, 0, ...detour);
        plan.detourUntil = now + 1.5;
      } else if (unit.action !== 'reload') {
        this.holdMovement(unit, `통과 순서 대기 · ${blocker.callSign} 선행`, yieldUntil, now, 0.2, log);
      }
      return;
    }
    unit.velocity = { x: next.x - unit.position.x, y: next.y - unit.position.y };
    unit.position = next;
  }
  /** 마지막 위치를 확인한 유닛이 주변을 훑도록, 기억한 지점 주변의 탐색 지점을 만듭니다. */
  private searchDestination(center: TacticalPoint, unit: RealtimeUnitState, _now: number, map: TacticalMapDefinition): RealtimeVector {
    const angle = unit.formationIndex * 2.399963;
    const candidate = { x: center.x + Math.cos(angle) * 36, y: center.y + Math.sin(angle) * 36 };
    return this.canStand(candidate, map) ? candidate : { ...center };
  }
  /** 열세 유닛은 적의 마지막 알려진 위치에서 멀어지는 엄폐·스폰 방향으로 재배치합니다. */
  private retreatDestination(unit: RealtimeUnitState, map: TacticalMapDefinition): RealtimeVector {
    const spawn = unit.side === '공격' ? map.attackerSpawn : map.defenderSpawn;
    const threat = unit.knowledge.lastKnownPosition ?? {
      x: map.objectiveZone.x + map.objectiveZone.width / 2,
      y: map.objectiveZone.y + map.objectiveZone.height / 2,
    };
    const candidates = map.covers.flatMap(cover => this.coverStagingPoints(cover, map))
      .filter(point => this.canStand(point, map) && distance(point, unit.position) < 450
        && this.canTraverse(unit.position, point, map));
    candidates.push({ ...unit.position });
    return candidates.map(point => ({ point,
      score: (this.hasLineOfSight(threat, point, map) ? 0 : 180)
        + Math.min(100, distance(point, threat) - distance(unit.position, threat))
        - distance(unit.position, point) * 0.6,
    })).sort((a, b) => b.score - a.score)[0]?.point ?? spawn;
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
    const impactEvents = events.filter((event) => event.type === 'impact' && event.hit);
    const scoutIds = new Set((input.scoutPlan?.indices??[]).map(index=>realtimeUnitId(input.attackers[index],index)));
    const scoutActions = events.filter((event) =>
      event.type === 'action' && event.actor && scoutIds.has(event.actor)
      && event.time < openingSearchSeconds && event.message.includes(': search'),
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
    const attacker = shooter.side === '공격' ? shooter : target;
    const defender = shooter.side === '수비' ? shooter : target;
    let e = list.find((item) => item.attackerId === attacker.id && item.defenderId === defender.id);
    if (!e) { e = { attackerId: attacker.id, defenderId: defender.id, attackerCallSign: attacker.callSign, defenderCallSign: defender.callSign, firstShotAt: now, shots: 0, hits: 0 }; list.push(e); }
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
    // done이 아닌 제너레이터 결과만 관전 틱으로 좁혀 화면에 전달합니다.
    const tick = next.value as RealtimeTick;
    this.latestTick = tick;
    return tick;
  }

  public getResult(): TacticalRealtimeResult | null {
    return this.finalResult;
  }
}

/** 클래스 없이 사용할 수 있는 순수 동기 실행 진입점입니다. */
export function runTacticalRealtimeSimulation(input: TacticalRealtimeSimulationInput): TacticalRealtimeResult {
  return new TacticalRealtimeSimulation(input.map).run(input);
}