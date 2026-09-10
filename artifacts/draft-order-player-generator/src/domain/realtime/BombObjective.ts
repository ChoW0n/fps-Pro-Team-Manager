import type { OperatorSide } from '../Operator';
import type { TacticalPoint, TacticalRect } from '../tacticalMaps';

export interface BombSite { id: 'A' | 'B'; label: string; zone: TacticalRect; plantPoint: TacticalPoint }
export interface BombActor {
  id: string; side: OperatorSide; alive: boolean; position: TacticalPoint;
  /** 이동·사격·장전·사망 중에는 장치를 조작할 수 없습니다. */
  canInteract: boolean;
}
export interface BombInteraction { actorId: string; type: 'pickup' | 'plant' | 'disable'; siteId?: 'A' | 'B' }
export type BombPhase = 'carried' | 'dropped' | 'planting' | 'active' | 'disabling' | 'resolved';
export type BombWinReason = 'defenders-eliminated' | 'attackers-eliminated' | 'time-expired' | 'bombs-defused' | 'device-disabled' | 'mutual-elimination';
export interface BombState {
  phase: BombPhase; carrierId?: string; siteId?: 'A' | 'B'; devicePosition?: TacticalPoint;
  interactingId?: string; interactionStartedAt?: number; progress: number; activeUntil?: number;
  winner?: OperatorSide | '무승부'; reason?: BombWinReason; resolvedAt?: number;
}
export interface BombEvent {
  time: number; kind: 'dropped' | 'picked-up' | 'plant-started' | 'plant-cancelled' | 'planted' | 'disable-started' | 'disable-cancelled' | 'resolved';
  actor?: string; position?: TacticalPoint; siteId?: 'A' | 'B'; message: string;
}
export interface BombRules { actionSeconds: number; plantSeconds: number; disableSeconds: number; activeSeconds: number; interactionRange: number }
/** 현재 프로젝트의 게임용 시간·거리입니다. 외부 게임의 최신 대회 규정이라는 뜻은 아닙니다. */
export const BOMB_RULES: Readonly<BombRules> = { actionSeconds: 180, plantSeconds: 7, disableSeconds: 7, activeSeconds: 45, interactionRange: 30 };
export const BOMB_RESULT_LABELS: Record<BombWinReason, string> = {
  'defenders-eliminated': '수비팀 전원 이탈', 'attackers-eliminated': '설치 전 공격팀 전원 이탈',
  'time-expired': '제한 시간까지 폭탄 방어', 'bombs-defused': '폭탄 해체 완료',
  'device-disabled': '해체 장치 무력화', 'mutual-elimination': '양 팀 동시 이탈',
};
const EPSILON = 1e-7;
const distance = (a: TacticalPoint, b: TacticalPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (point: TacticalPoint, zone: TacticalRect): boolean => point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;

/** 목표 규칙만 소유합니다. AI의 적 탐지·이동·명중 판정과 화면은 이 상태를 읽습니다. */
export class BombObjective {
  private state: BombState;
  private previousTime = -1;
  private interactionPosition?: TacticalPoint;
  public readonly rules: BombRules;

  /** 최초 운반자를 지정하고 규칙 수치가 잘못된 경기를 조기에 거부합니다. */
  public constructor(public readonly sites: readonly BombSite[], carrierId: string, rules: Partial<BombRules> = {}) {
    this.rules = { ...BOMB_RULES, ...rules };
    if (!carrierId || sites.length !== 2 || new Set(sites.map(site => site.id)).size !== 2) throw new Error('폭탄전은 A/B 사이트와 장치 운반자가 필요합니다.');
    if (Object.values(this.rules).some(value => !Number.isFinite(value) || value <= 0)) throw new Error('폭탄전 시간·거리는 양수여야 합니다.');
    this.state = { phase: 'carried', carrierId, progress: 0 };
  }

  /** 외부에서 좌표를 수정해 목표 상태를 바꾸지 못하도록 사본을 반환합니다. */
  public snapshot(): BombState {
    return { ...this.state, devicePosition: this.state.devicePosition ? { ...this.state.devicePosition } : undefined };
  }

  /** 같은 규칙 시각과 행동 입력이면 항상 같은 목표 사건을 만듭니다. 벽시계·난수는 사용하지 않습니다. */
  public step(now: number, actors: readonly BombActor[], interaction?: BombInteraction): BombEvent[] {
    if (!Number.isFinite(now) || now < 0 || now < this.previousTime) throw new Error('목표 시각은 역행할 수 없습니다.');
    if (now === this.previousTime || this.state.phase === 'resolved') return [];
    this.previousTime = now;
    const events: BombEvent[] = [];
    const emit = (kind: BombEvent['kind'], message: string, actor?: string): void => {
      events.push({ time: now, kind, message, actor, siteId: this.state.siteId,
        position: this.state.devicePosition ? { ...this.state.devicePosition } : undefined });
    };
    const resolve = (winner: NonNullable<BombState['winner']>, reason: BombWinReason): BombEvent[] => {
      this.state = { ...this.state, phase: 'resolved', winner, reason, resolvedAt: now, interactingId: undefined, interactionStartedAt: undefined, progress: 0 };
      emit('resolved', BOMB_RESULT_LABELS[reason]);
      return events;
    };
    const alive = (side: OperatorSide): number => actors.filter(actor => actor.alive && actor.side === side).length;
    const carrier = actors.find(actor => actor.id === this.state.carrierId);
    if (this.state.carrierId && !carrier) throw new Error('장치 운반자가 경기 명단에 없습니다.');
    if (carrier && carrier.side !== '공격') throw new Error('수비는 해체 장치를 운반할 수 없습니다.');
    if (carrier && !carrier.alive) {
      if (this.state.phase === 'planting') emit('plant-cancelled', '운반자 이탈로 설치 중단', carrier.id);
      this.state = { phase: 'dropped', devicePosition: { ...carrier.position }, progress: 0 };
      this.interactionPosition = undefined;
      emit('dropped', '해체 장치 유실', carrier.id);
    }
    let active = this.state.phase === 'active' || this.state.phase === 'disabling';
    // 작동 종료와 무력화가 같은 틱에 겹치면 이미 도달한 작동 종료가 우선합니다.
    if (active && now + EPSILON >= this.state.activeUntil!) return resolve('공격', 'bombs-defused');
    const attackers = alive('공격'), defenders = alive('수비');
    if (!attackers && !defenders && !active) return resolve('무승부', 'mutual-elimination');
    if (!defenders) return resolve('공격', 'defenders-eliminated');
    if (!attackers && !active) return resolve('수비', 'attackers-eliminated');

    const actor = actors.find(candidate => candidate.id === interaction?.actorId);
    const usable = Boolean(actor?.alive && actor.canInteract);
    const canContinue = usable && actor!.id === this.state.interactingId && this.interactionPosition
      && distance(actor!.position, this.interactionPosition) <= 1;
    if (this.state.phase === 'planting') {
      const site = this.sites.find(candidate => candidate.id === this.state.siteId)!;
      if (!canContinue || interaction?.type !== 'plant' || actor!.side !== '공격' || actor!.id !== this.state.carrierId
        || interaction.siteId !== site.id || !inside(actor!.position, site.zone)) {
        emit('plant-cancelled', '설치 행동 중단', this.state.interactingId);
        this.state = { phase: 'carried', carrierId: this.state.carrierId, progress: 0 };
        this.interactionPosition = undefined;
      } else {
        this.state.progress = Math.min(1, (now - this.state.interactionStartedAt!) / this.rules.plantSeconds);
        if (now + EPSILON >= this.state.interactionStartedAt! + this.rules.plantSeconds) {
          this.state = { phase: 'active', siteId: site.id, devicePosition: { ...actor!.position }, progress: 0, activeUntil: now + this.rules.activeSeconds };
          this.interactionPosition = undefined;
          active = true;
          emit('planted', '해체 장치 가동', actor!.id);
        }
      }
    } else if (this.state.phase === 'disabling') {
      if (!canContinue || interaction?.type !== 'disable' || actor!.side !== '수비'
        || distance(actor!.position, this.state.devicePosition!) > this.rules.interactionRange) {
        emit('disable-cancelled', '장치 무력화 중단', this.state.interactingId);
        this.state = { ...this.state, phase: 'active', progress: 0, interactingId: undefined, interactionStartedAt: undefined };
        this.interactionPosition = undefined;
      } else {
        this.state.progress = Math.min(1, (now - this.state.interactionStartedAt!) / this.rules.disableSeconds);
        if (now + EPSILON >= this.state.interactionStartedAt! + this.rules.disableSeconds) return resolve('수비', 'device-disabled');
      }
    }
    // 제한 시간 직전에 시작한 설치만 이어갈 수 있고, 중단하면 시간 초과로 끝납니다.
    if (!active && this.state.phase !== 'planting' && now + EPSILON >= this.rules.actionSeconds) return resolve('수비', 'time-expired');
    if (!usable || !interaction) return events;
    if (interaction.type === 'pickup' && this.state.phase === 'dropped' && actor!.side === '공격'
      && distance(actor!.position, this.state.devicePosition!) <= this.rules.interactionRange) {
      const position = this.state.devicePosition!;
      this.state = { phase: 'carried', carrierId: actor!.id, progress: 0, devicePosition: { ...position } };
      emit('picked-up', '해체 장치 회수', actor!.id);
      this.state.devicePosition = undefined;
    } else if (interaction.type === 'plant' && this.state.phase === 'carried' && actor!.side === '공격'
      && actor!.id === this.state.carrierId && now < this.rules.actionSeconds) {
      const site = this.sites.find(candidate => candidate.id === interaction.siteId);
      if (site && inside(actor!.position, site.zone)) {
        this.state = { ...this.state, phase: 'planting', siteId: site.id, devicePosition: { ...actor!.position }, interactingId: actor!.id, interactionStartedAt: now, progress: 0 };
        this.interactionPosition = { ...actor!.position };
        emit('plant-started', '해체 장치 설치 시작', actor!.id);
      }
    } else if (interaction.type === 'disable' && this.state.phase === 'active' && actor!.side === '수비'
      && distance(actor!.position, this.state.devicePosition!) <= this.rules.interactionRange) {
      this.state = { ...this.state, phase: 'disabling', interactingId: actor!.id, interactionStartedAt: now, progress: 0 };
      this.interactionPosition = { ...actor!.position };
      emit('disable-started', '해체 장치 무력화 시작', actor!.id);
    }
    return events;
  }
}
