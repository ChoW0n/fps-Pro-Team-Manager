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
export interface RealtimeVector extends TacticalPoint { }
export type RealtimeAction = 'approach' | 'search' | 'hold' | 'take-cover' | 'reposition' | 'aim' | 'fire' | 'dead';
export interface RealtimeUnitState {
  id: string; teamName: string; side: OperatorSide; callSign: string;
  position: RealtimeVector; velocity: RealtimeVector; facing: number; hp: number;
  ammo: number; cooldown: number; goal: string; action: RealtimeAction;
  knowledge: { lastKnownPosition?: RealtimeVector; lastKnownAt?: number; confidence: number };
  alive: boolean;
}
export interface RealtimeSnapshot {
  time: number; units: Array<RealtimeUnitState>;
}
export interface RealtimeEvent {
  time: number; type: 'move' | 'sound' | 'shot' | 'impact' | 'death' | 'action' | 'objective';
  actor?: string; target?: string; message: string; position?: RealtimeVector;
}
export interface RealtimeEngagement {
  attackerCallSign: string; defenderCallSign: string; firstShotAt: number;
  shots: number; hits: number; winner?: OperatorSide;
}
export interface TacticalRealtimeResult {
  winner: OperatorSide | '무승부'; survivors: RealtimeUnitState[];
  executionTime: number; events: RealtimeEvent[]; eventLog: RealtimeEvent[];
  engagements: RealtimeEngagement[]; snapshots: RealtimeSnapshot[];
}

interface Bullet { from: string; target: string; position: RealtimeVector; direction: RealtimeVector; eta: number; damage: number; }
interface SoundEvent { at: number; source: RealtimeVector; kind: 'footstep' | 'gunshot'; loudness: number; owner: string; }

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

  /** 공격·수비를 서로 다른 진입 전략으로 10Hz 진행합니다. */
  public run(input: TacticalRealtimeSimulationInput): TacticalRealtimeResult {
    if (!input.attackers.length || !input.defenders.length) throw new Error('공격과 수비에 각각 오퍼레이터가 필요합니다.');
    const map = input.map ?? this.map;
    const random = new SeededRandom(input.seed ?? 1);
    const maxTicks = Math.min(1800, Math.max(1, Math.floor((input.maxSeconds ?? 180) * 10)));
    const units: RealtimeUnitState[] = [...input.attackers, ...input.defenders].map((u, i) => ({
      id: `${u.teamName}:${u.player.nickname}:${u.operator.callSign}:${i}`, teamName: u.teamName,
      side: u.side, callSign: u.operator.callSign,
      position: this.startPosition(u, i, input.attackers.length, map), velocity: { x: 0, y: 0 },
      facing: u.side === '공격' ? 0 : Math.PI, hp: 100, ammo: 30, cooldown: 0,
      goal: u.side === '공격' ? '목표 접근' : '목표 방어', action: 'approach',
      knowledge: { confidence: 0 }, alive: true,
    }));
    const byId = new Map(units.map((u) => [u.id, u]));
    const source = [...input.attackers, ...input.defenders];
    const stat = new Map(source.map((u) => [u.operator.callSign, u]));
    const actionLockUntil = new Map<string, number>();
    const visualContactSince = new Map<string, { targetId: string; at: number }>();
    const searchUntil = new Map<string, number>();
    const searchOrigin = new Map<string, RealtimeVector>();
    const events: RealtimeEvent[] = []; const snapshots: RealtimeSnapshot[] = [];
    const bullets: Bullet[] = []; const sounds: SoundEvent[] = []; const engagements: RealtimeEngagement[] = [];
    const log = (event: RealtimeEvent) => events.push(event);
    const living = (side: OperatorSide) => units.filter((u) => u.alive && u.side === side);
    for (let tick = 0; tick < maxTicks; tick += 1) {
      const now = tick / 10;
      // 먼저 비행 중인 총알을 탄착시켜, 발사와 피해의 순서를 보장합니다.
      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const bullet = bullets[i]; if (bullet.eta > now) continue;
        const target = byId.get(bullet.target); bullets.splice(i, 1);
        if (!target?.alive) continue;
        const blocked = !this.hasLineOfSight(bullet.position, target.position, map);
        if (!blocked) {
          target.hp -= bullet.damage; log({ time: now, type: 'impact', actor: bullet.from, target: target.id, message: `${target.callSign}에게 탄착`, position: target.position });
          if (target.hp <= 0) { target.alive = false; target.action = 'dead'; log({ time: now, type: 'death', actor: bullet.from, target: target.id, message: `${target.callSign} 사망`, position: target.position }); }
        }
      }
      if (!living('공격').length || !living('수비').length) break;
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
        const defenderSet = distance(unit.position, objectiveCenter) < 95;
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
        const shouldReposition = Boolean((losingPosition || outOfAmmo) && !shouldFire);
        const shouldSearch = Boolean(
          !seen
          && !holdAngleAfterSound
          && (investigateSound || hasUnresolvedLead || isSearching),
        );
        let desired: RealtimeAction = shouldReposition
          ? 'reposition'
          : shouldFire
            ? 'fire'
            : seen
              ? 'aim'
              : shouldSearch
                ? 'search'
                : unit.side === '수비' && defenderSet ? 'hold' : 'approach';
        // 액션 잠금/히스테리시스: 짧은 시야 변화에 매 틱 행동을 바꾸지 않습니다.
        if (unit.action === 'fire' && unit.cooldown > 0) desired = 'aim';
        if (desired !== unit.action && (actionLockUntil.get(unit.id) ?? 0) <= now) {
          unit.action = desired; log({ time: now, type: 'action', actor: unit.id, message: `${unit.callSign}: ${desired}` });
          unit.goal = desired === 'reposition'
            ? '열세 판단 후 후퇴·재배치'
            : desired === 'search'
              ? '마지막 소리 위치 수색'
              : desired === 'hold' ? '목표 각 유지' : unit.goal;
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
          bullets.push({ from: unit.id, target: target.id, position: { ...unit.position }, direction: { x: target.position.x - unit.position.x, y: target.position.y - unit.position.y }, eta: now + flight, damage: hit ? 34 : 0 });
          sounds.push({ at: now, source: { ...unit.position }, kind: 'gunshot', loudness: me.operator.callSign === 'COLLIER' ? 0.38 : 1, owner: unit.id });
          log({ time: now, type: 'shot', actor: unit.id, target: target.id, message: `${unit.callSign} 발사` });
        } else if (unit.action !== 'hold') {
          // 공격자는 돌입점으로 전진하고, 수비자는 소리·마지막 위치·열세 판단에 따라 움직입니다.
          const doorCenter = {
            x: (map.doorGap.from.x + map.doorGap.to.x) / 2,
            y: (map.doorGap.from.y + map.doorGap.to.y) / 2,
          };
          const attackerGoal = distance(unit.position, map.breachEntryPoint) > 90
            ? map.breachEntryPoint
            : distance(unit.position, doorCenter) > 70 ? doorCenter : objectiveCenter;
          const destination = shouldReposition
            ? this.retreatDestination(unit, map)
            : seen?.position
              ?? (isSearching && searchOrigin.get(unit.id)
                ? this.searchDestination(searchOrigin.get(unit.id)!, unit, now, map)
                : (hasUnresolvedLead && lastKnownPosition
                  ? (unit.action === 'search'
                    ? this.searchDestination(lastKnownPosition, unit, now, map)
                    : lastKnownPosition)
                  : unit.side === '공격' ? attackerGoal : objectiveCenter));
          this.move(unit, destination, me, map, now);
        }
        if (unit.cooldown <= 0 && unit.action === 'approach') sounds.push({ at: now, source: { ...unit.position }, kind: 'footstep', loudness: 0.25, owner: unit.id });
      }
      for (const e of sounds) if (e.at === now) log({ time: now, type: 'sound', actor: e.owner, message: e.kind === 'gunshot' ? '총성' : '발소리', position: e.source });
      snapshots.push({ time: now, units: units.map((u) => ({ ...u, position: { ...u.position }, velocity: { ...u.velocity }, knowledge: { ...u.knowledge } })) });
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
    return { winner, survivors: units.filter((u) => u.alive), executionTime: snapshots.length / 10, events, eventLog: events, engagements, snapshots };
  }

  /** 역할과 공격/수비 배치가 이동 경로에 영향을 줍니다. */
  private startPosition(u: RealtimeUnitInput, index: number, attackers: number, map: TacticalMapDefinition): RealtimeVector {
    const base = u.side === '공격' ? map.attackerSpawn : map.defenderSpawn;
    const spread = (index - (u.side === '공격' ? attackers : 5) / 2) * 18;
    return { x: clamp(base.x + (u.side === '공격' ? 0 : spread), 0, map.width), y: clamp(base.y + spread, 0, map.height) };
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
}

/** 클래스 없이 사용할 수 있는 순수 동기 실행 진입점입니다. */
export function runTacticalRealtimeSimulation(input: TacticalRealtimeSimulationInput): TacticalRealtimeResult {
  return new TacticalRealtimeSimulation(input.map).run(input);
}