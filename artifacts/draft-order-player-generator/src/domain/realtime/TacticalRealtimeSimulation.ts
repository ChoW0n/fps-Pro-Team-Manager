/**
 * 전술 FPS의 실시간 판정을 담당합니다. 결과를 미리 계산하는 라운드 공식과
 * 분리되어 있으며, 모든 이동·소리·탄환은 10Hz 틱 순서로 처리됩니다.
 */
import type { Operator, OperatorSide } from '../Operator';
import type { Player } from '../Player';
import type { TacticalMapDefinition, TacticalPoint, TacticalRect } from '../tacticalMaps';
import { BREACHLINE_MAP } from '../tacticalMaps';
import { breachWalls } from './breachGeometry';
import { weaponHandling, shotCone, shotInterval, WORLD_UNITS_PER_METRE } from './weaponHandling';
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
  attackStyle?: 'balanced'|'smoke'|'breach';
  defenseStyle?: 'crossfire'|'roam'|'anchor';
  anticipatedEntry?: number;
}
export type TacticalDirectorCommandMode = 'push' | 'hold' | 'retreat' | 'route';
export interface TacticalDirectorCommand {
  side: OperatorSide;
  mode: TacticalDirectorCommandMode;
  routeIndex?: number;
  label: string;
}
export interface RealtimeVector extends TacticalPoint { }
export type RealtimeAction = 'approach' | 'search' | 'hold' | 'take-cover' | 'reposition' | 'aim' | 'fire' | 'reload' | 'plant' | 'disable' | 'utility' | 'dead';
export interface RealtimeUnitState {
  id: string; teamName: string; side: OperatorSide; callSign: string;
  position: RealtimeVector; velocity: RealtimeVector; facing: number; hp: number;
  ammo: number; magazineSize: number; reserveAmmo: number; reloadRemaining: number;
  weaponName: string; weaponProfileNote: string;
  shieldRaised?: boolean; utilityUsed?: boolean;
  recoil?: number; spread?: number; burst?: number; lastMovedAt?: number; decision?: string;
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
export interface RealtimeGadget { id:string; kind:'smoke'|'grenade'|'camera'; side:OperatorSide; owner:string; position:TacticalPoint; from?:TacticalPoint; thrownAt?:number; landedAt?:number; activeAt:number; until:number; radius:number; }
export interface RealtimeBreach {wallId:string;position:TacticalPoint;width:number}
export interface RealtimeSnapshot {
  time: number; units: Array<RealtimeUnitState>; objective?: BombState; operation?: ScoutState; visibleTo?: Record<OperatorSide,string[]>; gadgets?:RealtimeGadget[]; breaches?:RealtimeBreach[];
}
export interface RealtimeEvent {
  time: number; type: 'move' | 'sound' | 'shot' | 'impact' | 'death' | 'action' | 'objective' | 'intel' | 'reload' | 'utility';
  actor?: string; target?: string; message: string; position?: RealtimeVector;
  targetPosition?: RealtimeVector; travelSeconds?: number; seenBy?: OperatorSide[]; goal?: string; hit?: boolean; blocked?: boolean; side?: OperatorSide;
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
    const map = {...(input.map ?? this.map), walls:[...(input.map ?? this.map).walls]};
    const gadgets:RealtimeGadget[]=[], breaches:RealtimeBreach[]=[];
    const pendingBreach=new Map<string,{wallId:string;position:TacticalPoint;ready:number}>();
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
        recoil:0, spread:0, burst:0, lastMovedAt:0, cooldown: 0,
        goal: u.side === '공격' ? '담당 진입로 대기' : '담당 구역 각 유지',
        action: u.side === '공격' && u.operator.role === 'SEARCH' ? 'search' : 'hold',
        routeIndex: u.side === '공격' ? scoutPlan?.entryRoute ?? i : i - input.attackers.length,
        formationIndex: u.side === '공격' ? i : i - input.attackers.length,
        routeStep: 0,
        knowledge: { confidence: 0 }, alive: true,
      };
    });
    // 예상 진입은 이전 라운드 관측에서만 전달됩니다. A/B 필수 앵커는 남깁니다.
    if(input.anticipatedEntry!==undefined||input.defenseStyle) {
      const entry=map.attackerRoutes[input.anticipatedEntry??0]?.points[2]??map.breachEntryPoint;
      const occupied=units.filter(unit=>unit.side==='수비'&&(unit.formationIndex===2||unit.formationIndex===3)).map(unit=>unit.position);
      for(const unit of units.filter(unit=>unit.side==='수비'&&unit.formationIndex!==2&&unit.formationIndex!==3)) {
        const options=map.defenderSetups.map((setup,index)=>({setup,index})).filter(({setup})=>occupied.every(point=>distance(point,setup.position)>50));
        options.sort((a,b)=>distance(a.setup.position,entry)-distance(b.setup.position,entry));
        const choice=options[input.defenseStyle==='anchor'?Math.min(2,options.length-1):0];
        if(choice){unit.routeIndex=choice.index;unit.position={...choice.setup.position};occupied.push(unit.position);unit.facing=Math.atan2(entry.y-unit.position.y,entry.x-unit.position.x);}
      }
    }
    const rally = new Map(units.filter(unit=>unit.side==='공격').map(unit=>{
      // 진압조도 선발조 뒤의 출입구 대기선까지 전진합니다. 스폰에 영구 대기하지 않습니다.
      const center=entryRoute.points[1]??entryRoute.points[0], start=entryRoute.points[0];
      const point={x:center.x+(unit.position.x-start.x),y:center.y+(unit.position.y-start.y)};
      return [unit.id,scoutPlan&&this.canStand(point,map)?point:{...unit.position}];
    }));
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
    const grenadeEscapes = new Map<string, { gadgetId: string; goal: RealtimeVector }>();
    const retreatStarted=new Map<string,number>(),retreatRestUntil=new Map<string,number>();
    const directorOrders = new Map<OperatorSide, TacticalDirectorCommand>();
    const yieldUntil = new Map<string, number>();
    const blockedUntil = new Map<string, number>();
    const pathCache = new Map<string, NavigationPlan>();
    const portalReservations = new Map<string, PortalReservation>();
    let navigationNodes = this.buildNavigationNodes(map);
    const scoutDestinations = new Map<string,RealtimeVector>();
    for(const unit of units.filter(unit=>operation.snapshot().scoutIds.includes(unit.id))) {
      const center=entryRoute.points[Math.min(3,entryRoute.points.length-1)];
      const intended={x:center.x+unit.position.x-entryRoute.points[0].x,y:center.y+unit.position.y-entryRoute.points[0].y};
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
    const log = (event: RealtimeEvent): void => {
      const actor=units.find(unit=>unit.id===event.actor),target=units.find(unit=>unit.id===event.target);
      event.seenBy=(['공격','수비'] as OperatorSide[]).filter(side=>actor?.side===side||event.type==='death'&&target?.side===side||event.type==='objective'&&['planted','resolved','disabled','detonated'].includes(event.goal??'')
        || event.position&&units.some(unit=>unit.alive&&unit.side===side&&this.canSee(unit,event.position!,map)&&!gadgets.some(smoke=>smoke.kind==='smoke'&&event.time>=smoke.activeAt&&event.time<smoke.until&&pointToSegmentDistance(smoke.position,unit.position,event.position!)<smoke.radius)));
      events.push(event);
    };
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
          const bearing=Math.atan2(bullet.position.y-target.position.y,bullet.position.x-target.position.x);
          const shield=target.shieldRaised&&Math.cos(bearing-target.facing)>.5;
          target.hp = Math.max(0, target.hp - bullet.damage*(shield?.18:1));
          if (target.hp === 0) {
            target.alive = false; target.action = 'dead'; target.velocity = { x: 0, y: 0 };
            target.reloadRemaining = 0;
            log({ time: now, type: 'death', actor: bullet.from, target: target.id,
              message: `${target.callSign} 사망`, position: { ...target.position } });
          }
        }
      }
      // 유한 수명의 실제 가젯: 연막은 시야만, 수류탄은 벽으로 차폐되는 피해를 만듭니다.
      for(let index=gadgets.length-1;index>=0;index--) {
        const gadget=gadgets[index];
        if(gadget.until<=now){gadgets.splice(index,1);continue;}
        if(gadget.kind==='grenade'&&gadget.activeAt<=now) {
          log({time:now,type:'utility',actor:gadget.owner,position:{...gadget.position},message:'수류탄 폭발',goal:'grenade-exploded',side:gadget.side});
          for(const target of units.filter(unit=>unit.alive&&distance(unit.position,gadget.position)<gadget.radius&&this.hasLineOfSight(gadget.position,unit.position,map))) {
            target.hp=Math.max(0,target.hp-65*(1-distance(target.position,gadget.position)/gadget.radius));
            if(target.hp===0){target.alive=false;target.action='dead';target.reloadRemaining=0;target.velocity={x:0,y:0};log({time:now,type:'death',actor:gadget.owner,target:target.id,position:{...target.position},message:'폭발에 전투 이탈'});}
          }
          gadgets.splice(index,1);
        } else if(gadget.kind==='camera'&&now>=gadget.activeAt&&tick%10===0) {
          const observed=units.find(unit=>unit.alive&&unit.side!==gadget.side&&distance(unit.position,gadget.position)<gadget.radius&&this.hasLineOfSight(gadget.position,unit.position,map)
            && !gadgets.some(smoke=>smoke.kind==='smoke'&&now>=smoke.activeAt&&pointToSegmentDistance(smoke.position,gadget.position,unit.position)<smoke.radius));
          const owner=byId.get(gadget.owner);
          if(observed&&owner)publishTeamReport(owner,'visual',observed.position,now);
        }
      }
      for(const [id,charge] of pendingBreach) {
        const owner=byId.get(id);if(!owner?.alive){pendingBreach.delete(id);continue;}
        if(now<charge.ready)continue;
        const wall=map.walls.find(wall=>wall.id===charge.wallId);
        if(wall) {
          map.walls=breachWalls(map.walls,wall.id,charge.position,100);
          breaches.push({wallId:wall.id,position:charge.position,width:100});
          navigationNodes=this.buildNavigationNodes(map);pathCache.clear();
          sounds.push({at:now,source:{...charge.position},kind:'gunshot',loudness:2,owner:id});
          log({time:now,type:'utility',actor:id,position:{...charge.position},message:'파쇄 완료 · 새로운 통로 개방',goal:'wall-breached',side:owner.side});
        }
        pendingBreach.delete(id);
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
        if(Math.hypot(unit.velocity.x,unit.velocity.y)>.05) unit.lastMovedAt=now;
        unit.velocity = { x: 0, y: 0 };
        unit.recoil=Math.max(0,(unit.recoil??0)-weaponHandling(unit.weaponName).recovery*.1);
        if (!unit.alive) continue;
        const me = stat.get(unit.id)!; const enemies = living(unit.side === '공격' ? '수비' : '공격');
        const visible = enemies.filter((enemy) => this.canObserve(unit,enemy.position,map,gadgets,now));
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
        // 교전 인원은 보이는 적과 최근 보고 위치로 추정합니다. 미관측 생존자를 세지 않습니다.
        const knownPositions:TacticalPoint[]=visible.map(enemy=>enemy.position);
        for(const report of teamReports.get(unit.side)!) {
          if(report.kind==='visual'&&now-report.at<3&&knownPositions.every(point=>distance(point,report.position)>90))knownPositions.push(report.position);
        }
        const knownThreats=Math.min(5,knownPositions.length);
        const isClutch = knownThreats >= 2 && living(unit.side).length === 1;
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
        const anchorDuty = unit.side === '수비' && (unit.formationIndex === 2 || unit.formationIndex === 3 || input.defenseStyle==='anchor'&&unit.formationIndex>0) && !activeDevice;
        const roamer=unit.side==='수비'&&!anchorDuty&&(unit.formationIndex===0||input.defenseStyle==='roam'&&unit.formationIndex===1)&&!activeDevice;
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
        const outnumbered = knownThreats > living(unit.side).length;
        const priorRetreat=retreatGoals.get(unit.id);
        if(priorRetreat&&(distance(unit.position,priorRetreat)<28||now-(retreatStarted.get(unit.id)??now)>3)) {
          retreatGoals.delete(unit.id);retreatStarted.delete(unit.id);retreatRestUntil.set(unit.id,now+5);
        }
        const mustCommit=activeDevice&&unit.side==='수비'&&(objectiveState.activeUntil??0)-now<13;
        const losingPosition = !mustCommit&&(retreatRestUntil.get(unit.id)??0)<=now&&Boolean(
          (lowHealth && (seen || hasUnresolvedLead))
          || (outnumbered && unit.hp <= 65 && (seen || hasUnresolvedLead))
          || (isClutch && unit.hp <= 55 && (seen || hasUnresolvedLead)),
        );
        const weapon = weaponProfileFor(me.operator);
        if(!seen&&!lastKnownPosition&&unit.action==='hold') {
          const point=defenderSetup?.fallback??map.portals[unit.routeIndex%map.portals.length].center;
          unit.facing=Math.atan2(point.y-unit.position.y,point.x-unit.position.x)+Math.sin(now*.7+unit.formationIndex)*.55;
        }
        unit.shieldRaised=unit.callSign==='REUSS'&&Boolean(seen)&&(unit.cooldown>0||losingPosition);
        if(pendingBreach.has(unit.id)){unit.action='utility';unit.goal='파쇄 장약 설치 · 엄호 필요';continue;}
        const camera=gadgets.find(gadget=>gadget.kind==='camera'&&gadget.side!==unit.side&&distance(gadget.position,unit.position)<90&&this.canObserve(unit,gadget.position,map,gadgets,now));
        if(camera){gadgets.splice(gadgets.indexOf(camera),1);unit.action='utility';unit.cooldown=.7;log({time:now,type:'utility',actor:unit.id,position:{...camera.position},message:'발견한 관측 카메라 제거',goal:'camera-destroyed',side:unit.side});continue;}
        if(!unit.utilityUsed&&unit.reloadRemaining<=0&&now>2) {
          if(unit.side==='수비'&&!seen&&now<18&&(me.operator.role==='BLOCKING'||me.operator.role==='DEFENSIVE_SETUP')) {
            gadgets.push({id:unit.id+':camera',kind:'camera',side:unit.side,owner:unit.id,position:{...unit.position},activeAt:now+1,until:actionSeconds+50,radius:480});
            unit.utilityUsed=true;unit.action='utility';unit.goal='관측 카메라 설치 · 거점 접근 감시';
            log({time:now,type:'utility',actor:unit.id,position:{...unit.position},message:unit.goal,goal:'camera-deployed',side:unit.side});continue;
          }
          if(unit.side==='공격'&&seen&&visualContactDuration>.45+(1-aggression)*.5) {
            const gap=distance(unit.position,seen.position);
            const smoke=input.attackStyle==='smoke'||me.operator.role==='SEARCH'||unit.id===objectiveState.carrierId;
            if(smoke&&gap>200&&!gadgets.some(gadget=>gadget.kind==='smoke'&&gadget.side===unit.side&&distance(gadget.position,unit.position)<230)) {
              const amount=Math.min(.6,110/gap),position={x:unit.position.x+(seen.position.x-unit.position.x)*amount,y:unit.position.y+(seen.position.y-unit.position.y)*amount};
              gadgets.push({id:unit.id+':smoke',kind:'smoke',side:unit.side,owner:unit.id,position,from:{...unit.position},thrownAt:now,landedAt:now+.35,activeAt:now+.35,until:now+10,radius:95});
              unit.utilityUsed=true;unit.action='utility';unit.goal='연막 투척 · 긴 사선 차단 후 전진';
              log({time:now,type:'utility',actor:unit.id,position,message:unit.goal,goal:'smoke-thrown',side:unit.side});continue;
            }
            if(!smoke&&gap>160&&gap<440&&this.hasLineOfSight(unit.position,seen.position,map)&&living(unit.side).every(friend=>distance(friend.position,seen.position)>150)) {
              gadgets.push({id:unit.id+':grenade',kind:'grenade',side:unit.side,owner:unit.id,position:{...seen.position},from:{...unit.position},thrownAt:now,landedAt:now+gap/360,activeAt:now+gap/360+1.2,until:now+gap/360+1.3,radius:145});
              unit.utilityUsed=true;unit.action='utility';unit.goal='수류탄으로 확인한 엄폐 위치 압박';
              log({time:now,type:'utility',actor:unit.id,position:{...seen.position},message:unit.goal,goal:'grenade-thrown',side:unit.side});continue;
            }
          }
          if(unit.side==='공격'&&(unit.callSign==='MEDVED'||input.attackStyle==='breach'&&me.operator.role==='ENTRY')&&!seen) {
            const wall=map.walls.find(wall=>wall.kind==='interior'&&distance(wall.from,wall.to)>180&&pointToSegmentDistance(unit.position,wall.from,wall.to)<70
              && distance(unit.position,wall.from)>65&&distance(unit.position,wall.to)>65);
            if(wall){const dx=wall.to.x-wall.from.x,dy=wall.to.y-wall.from.y,t=clamp(((unit.position.x-wall.from.x)*dx+(unit.position.y-wall.from.y)*dy)/(dx*dx+dy*dy),.1,.9);
              const position={x:wall.from.x+dx*t,y:wall.from.y+dy*t};pendingBreach.set(unit.id,{wallId:wall.id,position,ready:now+2});unit.utilityUsed=true;unit.action='utility';
              log({time:now,type:'utility',actor:unit.id,position,message:'파쇄 장약 설치 시작',goal:'breach-started',side:unit.side});continue;}
          }
        }
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
        // 실제 착지 위치를 관측한 뒤 회피 임무를 기억합니다. 등을 돌려도 위험을 잊지 않습니다.
        let escapePlan = grenadeEscapes.get(unit.id);
        if (escapePlan && !gadgets.some(gadget => gadget.id === escapePlan?.gadgetId)) {
          grenadeEscapes.delete(unit.id);
          pathCache.delete(unit.id);
          escapePlan = undefined;
        }
        const threatGrenade = gadgets.find(gadget => gadget.kind === 'grenade'
          && now >= (gadget.landedAt ?? gadget.activeAt)
          && distance(unit.position, gadget.position) < gadget.radius + 40
          && this.canObserve(unit, gadget.position, map, gadgets, now));
        if (threatGrenade && !escapePlan) {
          const escape = navigationNodes.filter(point => distance(point, unit.position) < 250
            && distance(point, threatGrenade.position) > threatGrenade.radius + 35
            && this.canTraverse(unit.position, point, map))
            .sort((a, b) => distance(a, unit.position) - distance(b, unit.position))[0];
          if (escape) {
            escapePlan = { gadgetId: threatGrenade.id, goal: { ...escape } };
            grenadeEscapes.set(unit.id, escapePlan);
            pathCache.delete(unit.id);
          }
        }
        if (escapePlan) {
          unit.action = 'reposition';
          unit.goal = '확인한 수류탄 회피 · 이후 원래 임무 복귀';
          unit.decision = unit.goal;
          this.move(unit, escapePlan.goal, me, map, now, units, navigationNodes, pathCache,
            yieldUntil, blockedUntil, log, portalReservations);
          if (distance(unit.position, escapePlan.goal) <= 24) {
            unit.action = 'hold';
            unit.goal = '수류탄 폭발까지 안전 지점 유지';
            unit.decision = unit.goal;
          }
          continue;
        }
        const order = directorOrders.get(unit.side);
        const operationGoal = unit.side==='공격' && openingSearch
          ? isOpeningScout ? scoutDestinations.get(unit.id) : rally.get(unit.id)
          : undefined;
        const operationMoving = Boolean(operationGoal && distance(unit.position,operationGoal)>24);
        const objectiveSite = map.sites.find(site => site.id === objectiveState.siteId) ?? plannedSite;
        const plantPoint = objectiveSite.plantAnchors[0];
        const guardPoint=objectiveSite.defendAnchors[unit.formationIndex%objectiveSite.defendAnchors.length];
        const guarding=activeDevice&&unit.side==='공격'&&distance(unit.position,guardPoint)<30;
        if(guarding&&!seen&&!lastKnownPosition) {
          const exits=[...map.portals].filter(portal=>distance(portal.center,guardPoint)<600).sort((a,b)=>distance(a.center,guardPoint)-distance(b.center,guardPoint));
          const exit=exits[unit.formationIndex%Math.min(3,exits.length)]?.center;
          if(exit)unit.facing=Math.atan2(exit.y-unit.position.y,exit.x-unit.position.x)+Math.sin(now*.45+unit.formationIndex)*.25;
          unit.goal='설치 후 담당 출입구 엄호 · 동료와 교차 사선';unit.decision=unit.goal;
        }
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
        const handling=weaponHandling(unit.weaponName);
        const control=clamp((me.player.aim*.45+me.player.mastery*.35+me.player.composure*.2)/100,0,1);
        const range=target?distance(unit.position,target.position):0;
        const exposure=target?this.targetExposure(unit.position,target.position,map):1;
        const settled=now-(unit.lastMovedAt??0);
        const acquisition=.15+(1-control)*.35+(1-exposure)*.65+Math.max(0,range-450)/1800;
        const returning=unit.side==='공격'&&openingSearch&&operationState.phase!=='scouting'&&operationMoving;
        // 복귀 임무 중 먼 적을 보았다는 이유로 무한 조준 대기하지 않습니다.
        const breakContact=Boolean(!mustCommit && (retreatRestUntil.get(unit.id) ?? 0) <= now
          && seen && (returning && range > 180 || range > handling.comfortableDistance && visualContactDuration > 2.5));
        const friendlyLine=Boolean(target&&living(unit.side).some(friend=>friend.id!==unit.id&&distance(muzzle,friend.position)<distance(muzzle,target.position)&&pointToSegmentDistance(friend.position,muzzle,target.position)<UNIT_RADIUS));
        const canFire = !friendlyLine&&unit.cooldown <= 0 && unit.ammo > 0 && muzzleClear&&visualContactDuration>=acquisition&&settled>=.15;
        const continuingRetreat = !mustCommit && retreatGoals.has(unit.id) && retreatStarted.has(unit.id);
        const shouldFire = Boolean(seen && canFire && !losingPosition && !breakContact && !continuingRetreat
          && (aggression > 0.25 || isClutch || aimTimedOut));
        const outOfAmmo = unit.ammo <= 0;
        const directorOrder = directorOrders.get(unit.side);
        const forcedPush = directorOrder?.mode === 'push';
        const forcedHold = directorOrder?.mode === 'hold';
        const forcedRetreat = directorOrder?.mode === 'retreat';
        // 한 번 정한 이탈 임무는 순간적인 시야 소실로 취소하지 않고 도착·기한까지 유지합니다.
        const shouldReposition = Boolean(forcedRetreat || continuingRetreat || breakContact
          || !mustCommit && friendlyLine && visualContactDuration > 1 && (retreatRestUntil.get(unit.id) ?? 0) <= now
          || ((losingPosition || outOfAmmo) && !shouldFire));
        const needsObjectiveMove = Boolean(objectiveTask && taskPoint && !withinReach) || activeDevice&&!guarding;
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
              : guarding&&!hasUnresolvedLead ? 'hold' : operationGoal ? operationMoving ? (isOpeningScout ? 'search' : 'approach') : 'hold'
              : needsObjectiveMove && !openingSearch
                ? 'approach'
              : shouldSearch
                ? 'search'
                  : openingSearch && unit.side === '공격' && !forcedPush ? 'hold'
                : unit.side === '수비' && defenderSet&&!roamer ? 'hold' : 'approach';
        // 액션 잠금/히스테리시스: 짧은 시야 변화에 매 틱 행동을 바꾸지 않습니다.
        if (unit.action === 'fire' && unit.cooldown > 0) desired = 'aim';
        if (desired !== unit.action && (actionLockUntil.get(unit.id) ?? 0) <= now) {
          unit.decision=undefined;
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
          engagement.shots += 1; unit.ammo -= 1; unit.burst=(unit.burst??0)+1;
          unit.cooldown=shotInterval(handling,range,control,unit.burst);
          unit.spread=shotCone(handling,control,unit.recoil??0,settled,exposure);
          const offset=(random.next()+random.next()-1)*unit.spread;
          const bearing=Math.atan2(target.position.y-muzzle.y,target.position.x-muzzle.x)+offset;
          const reach=distance(muzzle,target.position);
          const intended={x:muzzle.x+Math.cos(bearing)*reach,y:muzzle.y+Math.sin(bearing)*reach};
          const targetPosition=this.traceShot(muzzle,intended,map);
          const hit=distance(targetPosition,target.position)<=UNIT_RADIUS;
          const flight=distance(muzzle,targetPosition)/(handling.velocity*WORLD_UNITS_PER_METRE);
          unit.recoil=Math.min(.18,(unit.recoil??0)+handling.kick*(1-control*.6));
          unit.decision=range>handling.comfortableDistance?'먼 사선 · 단발 후 재조준':unit.burst%3===0?'점사 종료 · 반동 회복':'짧은 점사 · 사선 유지';
          bullets.push({from:unit.id,target:target.id,position:{...muzzle},targetPosition,
            direction:{x:targetPosition.x-muzzle.x,y:targetPosition.y-muzzle.y},eta:now+flight,damage:handling.damage,hit});
          sounds.push({ at: now, source: { ...unit.position }, kind: 'gunshot', loudness: me.operator.callSign === 'COLLIER' ? 0.38 : 1, owner: unit.id });
          log({
            time: now, type: 'shot', actor: unit.id, target: target.id,
            message: `${unit.callSign} ${unit.decision}`, position: { ...muzzle },
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
          if (shouldReposition && !retreatGoals.has(unit.id)) {retreatGoals.set(unit.id,this.retreatDestination(unit,map));retreatStarted.set(unit.id,now);}
          if (!shouldReposition) { retreatGoals.delete(unit.id); retreatStarted.delete(unit.id); }
          const destination = shouldReposition
            ? returning&&operationGoal?operationGoal:forcedRetreat ? rally.get(unit.id) ?? retreatGoals.get(unit.id)! : retreatGoals.get(unit.id)!
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
                      : roamer ? (now%16<8 ? defenderSetup?.fallback : map.defenderSetups[(unit.formationIndex+6)%map.defenderSetups.length].position)??objectiveCenter : defenderSetup?.position ?? objectiveCenter));
          if(roamer&&!seen)unit.goal='로머 순환 · 실제 관측 보고에 대응';
          if(operationGoal) unit.goal = isOpeningScout ? '선발조 수색 · 지정 방향 확인' : operationState.phase==='scouting' ? '진압조 전진 대기선 · 선발조 엄호' : '실제 복귀 · 진압조와 합류';
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
      const visibleTo = Object.fromEntries((['공격','수비'] as OperatorSide[]).map(side=>[side,units.filter(target=>target.side===side||units.some(observer=>observer.alive&&observer.side===side&&this.canObserve(observer,target.position,map,gadgets,now))).map(unit=>unit.id)])) as Record<OperatorSide,string[]>;
      const snapshot = { time: now, objective: bombState, operation: operationState, visibleTo, gadgets:gadgets.map(gadget=>({...gadget,position:{...gadget.position}})), breaches:[...breaches], units: units.map((u) => ({ ...u, position: { ...u.position }, velocity: { ...u.velocity }, knowledge: { ...u.knowledge } })) };
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
  public canObserve(unit:RealtimeUnitState,point:TacticalPoint,map:TacticalMapDefinition,gadgets:readonly RealtimeGadget[]=[],time=0):boolean {
    return unit.alive&&this.canSee(unit,point,map)&&!gadgets.some(gadget=>gadget.kind==='smoke'&&time>=gadget.activeAt&&time<gadget.until&&pointToSegmentDistance(gadget.position,unit.position,point)<gadget.radius);
  }
  /** 개인 시야의 범위·방향·몸 노출을 함께 판정합니다. */
  private canSee(unit: RealtimeUnitState, point: TacticalPoint, map: TacticalMapDefinition): boolean {
    const range = distance(unit.position, point);
    if (range > 1200 || this.targetExposure(unit.position,point,map)<.34) return false;
    const angle = Math.atan2(point.y - unit.position.y, point.x - unit.position.x) - unit.facing;
    return range < 60 || Math.cos(angle) >= Math.cos(Math.PI * 0.4);
  }

  /** 몸 너비의 세 점을 검사해 문틈의 단일 픽셀로 전체 몸을 인식하지 않습니다. */
  private targetExposure(from: TacticalPoint, to: TacticalPoint, map: TacticalMapDefinition): number {
    const range=distance(from,to)||1,dx=-(to.y-from.y)/range*9,dy=(to.x-from.x)/range*9;
    return [-1,0,1].filter(offset=>this.hasLineOfSight(from,{x:to.x+dx*offset,y:to.y+dy*offset},map)).length/3;
  }
  /** 빗나간 탄도도 첫 벽·엄폐물 앞에서 멈춰 기록된 탄착과 렌더를 일치시킵니다. */
  private traceShot(from: TacticalPoint, to: TacticalPoint, map: TacticalMapDefinition): TacticalPoint {
    if(this.hasLineOfSight(from,to,map))return to;
    let low=0,high=1;
    for(let index=0;index<18;index++) {
      const mid=(low+high)/2,point={x:from.x+(to.x-from.x)*mid,y:from.y+(to.y-from.y)*mid};
      if(this.hasLineOfSight(from,point,map))low=mid;else high=mid;
    }
    return {x:from.x+(to.x-from.x)*low,y:from.y+(to.y-from.y)*low};
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
    const defensive = unit.side === '수비';
    const speed = (defensive ? 42 : 52) + me.operator.stats.entry / 5 + me.player.teamSynergy / 20;
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
    // 통행에 실패한 시도만으로 몸을 좌우로 돌리지 않습니다.
    unit.facing = Math.atan2(dy, dx);
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