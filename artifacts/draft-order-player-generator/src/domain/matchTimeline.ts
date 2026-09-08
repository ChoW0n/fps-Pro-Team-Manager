/**
 * 경기 관전 기록은 경기 시작 시 딱 한 번 만든다.
 *
 * 0초부터 경기 종료까지 매 초 선수의 행동을 정하고, 목표를 정하고,
 * 목표를 향해 이동시키고, 투사체·전투·CS를 처리한 뒤 그 결과를 배열에 넣는다.
 * 화면은 이 배열의 해당 인덱스를 읽어 그리기만 한다. 화면에서 시각을 넣어
 * 위치·체력·CS를 다시 계산하지 않으므로 배속을 바꿔도 결과가 같고 되감기도 가능하다.
 */

import { Champion } from './Champion';
import { MatchResult } from './MatchResult';
import {
  MATCH_ITEMS,
  MatchItem,
  getPhaseAtTimestamp,
} from './matchEconomy';
import { MatchEvent } from './matchEvents';
import { Player } from './Player';

export type TimelineLane = 'TOP' | 'MID' | 'BOT';
export type TimelinePlayerState = '파밍' | '견제' | '딜교' | '회피' | '이동' | '귀환' | '전투' | '사망';

export interface TimelinePoint {
  x: number;
  y: number;
}

export interface TimelinePlayerFrame {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  position: TimelinePoint;
  target: TimelinePoint;
  health: number;
  resource: number;
  state: TimelinePlayerState;
  level: number;
  cs: number;
  gold: number;
  ultimateReady: boolean;
  items: MatchItem[];
  respawned: boolean;
}

export interface TimelineMinionWave {
  key: string;
  teamName: string;
  lane: TimelineLane;
  position: TimelinePoint;
  alive: boolean;
  engaged: boolean;
}

export interface TimelineProjectile {
  key: string;
  sourceKey: string;
  targetKey: string;
  source: TimelinePoint;
  target: TimelinePoint;
  progress: number;
  hit: boolean;
  teamName: string;
}

export interface TimelineWard {
  key: string;
  teamName: string;
  position: TimelinePoint;
  remainingSeconds: number;
}

export interface TimelineVisionArea {
  center: TimelinePoint;
  radius: number;
  sourceType: 'PLAYER' | 'WARD' | 'BASE';
  sourceKey: string;
}

export interface TimelineTeamVision {
  teamName: string;
  areas: TimelineVisionArea[];
  coveragePercent: number;
}

export interface TimelineGankOutcome {
  eventIndex: number;
  timestampSeconds: number;
  attackingTeamName: string;
  defendingTeamName: string;
  gankerKey: string;
  victimKey: string;
  success: boolean;
  failedByVision: boolean;
}

export interface TimelineTeamStats {
  kills: number;
  gold: number;
  turrets: number;
  objectiveStacks: number;
}

export interface TimelineRecentKill {
  timestampSeconds: number;
  teamName: string;
  victimTeamName: string;
  description: string;
}

export interface MatchTimelineFrame {
  timestampSeconds: number;
  players: TimelinePlayerFrame[];
  minionWaves: TimelineMinionWave[];
  projectiles: TimelineProjectile[];
  wards: TimelineWard[];
  teamVision: TimelineTeamVision[];
  home: TimelineTeamStats;
  away: TimelineTeamStats;
  recentKills: TimelineRecentKill[];
  activeEventIndices: number[];
  cameraCenter: TimelinePoint;
  cameraFocusKeys: string[];
  cameraHardCut: boolean;
}

export interface MatchTimeline {
  durationSeconds: number;
  frames: MatchTimelineFrame[];
  highlightSeconds: number[];
  maxPositionDelta: number;
  movementViolations: Array<{ key: string; timestampSeconds: number; delta: number }>;
  gankOutcomes: TimelineGankOutcome[];
}

const MAX_MOVE_PER_SECOND = 0.012;
const MATCH_DURATION_SECONDS = 2100;
const HEALTH_THRESHOLD_TO_RECALL = 24;
const LANES: TimelineLane[] = ['TOP', 'MID', 'BOT'];
const LANE_FOR_POSITION: Partial<Record<Player['position'], TimelineLane>> = {
  TOP: 'TOP',
  MID: 'MID',
  ADC: 'BOT',
  SUPPORT: 'BOT',
};
const BASES = {
  home: { x: 0.08, y: 0.08 },
  away: { x: 0.92, y: 0.92 },
} as const;
const JUNGLE_CAMPS = [
  { x: 0.26, y: 0.23 },
  { x: 0.38, y: 0.36 },
  { x: 0.26, y: 0.68 },
  { x: 0.38, y: 0.54 },
  { x: 0.56, y: 0.5 },
];

type SimPlayer = TimelinePlayerFrame & {
  lane?: TimelineLane;
  side: 'home' | 'away';
  base: TimelinePoint;
  csFraction: number;
  recallStartedAt: number;
  baseRecoverUntil: number;
  deathUntil: number;
  nextPokeAt: number;
  respawned: boolean;
  eventTarget?: { point: TimelinePoint; until: number };
};

type SimWave = TimelineMinionWave & {
  progress: number;
  spawnedAt: number;
};

type PendingAttack = {
  key: string;
  sourceKey: string;
  targetKey: string;
  teamName: string;
  launchTime: number;
  hitTime: number;
  source: TimelinePoint;
  target: TimelinePoint;
  damage: number;
  willHit: boolean;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointDistance(left: TimelinePoint, right: TimelinePoint): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function circleDistance(left: TimelinePoint, right: TimelinePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function isPointVisibleToTeam(
  point: TimelinePoint,
  teamName: string,
  teamVision: TimelineTeamVision[],
): boolean {
  const vision = teamVision.find((entry) => entry.teamName === teamName);
  return vision?.areas.some((area) => circleDistance(point, area.center) <= area.radius) ?? false;
}

/**
 * 이동량의 기준은 유클리드가 아니라 요구한 가로·세로 합이다.
 * 따라서 어떤 방향으로도 매 초 변화량은 반드시 0.012 이하이다.
 */
function moveToward(current: TimelinePoint, target: TimelinePoint): TimelinePoint {
  const deltaX = target.x - current.x;
  const deltaY = target.y - current.y;
  const manhattan = Math.abs(deltaX) + Math.abs(deltaY);
  if (manhattan <= MAX_MOVE_PER_SECOND) return { ...target };
  const ratio = MAX_MOVE_PER_SECOND / manhattan;
  return {
    x: clamp(current.x + deltaX * ratio, 0.02, 0.98),
    y: clamp(current.y + deltaY * ratio, 0.02, 0.98),
  };
}

function deterministic(seed: number): number {
  return (Math.sin(seed * 12.9898 + 78.233) + 1) / 2;
}

function keyForPlayer(teamName: string, player: Player): string {
  return `${teamName}:${player.nickname}`;
}

function getSide(result: MatchResult, teamName: string): 'home' | 'away' {
  return teamName === result.homeTeam.name ? 'home' : 'away';
}

function getLanePath(lane: TimelineLane): TimelinePoint[] {
  if (lane === 'TOP') return [{ x: 0.08, y: 0.08 }, { x: 0.08, y: 0.92 }, { x: 0.92, y: 0.92 }];
  if (lane === 'MID') return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.92 }];
  return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }];
}

function pointOnLane(lane: TimelineLane, progress: number): TimelinePoint {
  const path = getLanePath(lane);
  const scaled = clamp(progress, 0, 1) * (path.length - 1);
  const segment = Math.min(path.length - 2, Math.floor(scaled));
  const local = scaled - segment;
  return {
    x: path[segment].x + (path[segment + 1].x - path[segment].x) * local,
    y: path[segment].y + (path[segment + 1].y - path[segment].y) * local,
  };
}

function getBase(result: MatchResult, teamName: string): TimelinePoint {
  return getSide(result, teamName) === 'home' ? { ...BASES.home } : { ...BASES.away };
}

function getPhasePowerRatio(result: MatchResult, teamName: string, timestampSeconds: number): number {
  const phase = getPhaseAtTimestamp(result, timestampSeconds);
  const own = teamName === result.homeTeam.name ? phase.homePower : phase.awayPower;
  const opponent = teamName === result.homeTeam.name ? phase.awayPower : phase.homePower;
  return own / Math.max(1, own + opponent);
}

function getLanePlayer(players: SimPlayer[], teamName: string, lane: TimelineLane): SimPlayer | undefined {
  return players.find((player) => player.teamName === teamName && player.lane === lane && player.player.position !== 'SUPPORT');
}

function getWaveEngagementPoint(waves: SimWave[], lane: TimelineLane): TimelinePoint {
  const laneWaves = waves.filter((wave) => wave.lane === lane && wave.alive);
  if (laneWaves.length === 0) return pointOnLane(lane, 0.5);
  const homeWave = laneWaves.find((wave) => wave.teamName !== undefined && wave.progress <= 0.5);
  const awayWave = laneWaves.find((wave) => wave.teamName !== undefined && wave.progress > 0.5);
  if (homeWave && awayWave) return pointOnLane(lane, (homeWave.progress + awayWave.progress) / 2);
  return pointOnLane(lane, laneWaves.reduce((sum, wave) => sum + wave.progress, 0) / laneWaves.length);
}

function getJungleTarget(side: 'home' | 'away', timestampSeconds: number): TimelinePoint {
  const camp = JUNGLE_CAMPS[Math.floor(timestampSeconds / 42) % JUNGLE_CAMPS.length];
  return side === 'home' ? { ...camp } : { x: 1 - camp.x, y: 1 - camp.y };
}

function getEventForPlayer(
  events: MatchEvent[],
  player: SimPlayer,
  timestampSeconds: number,
): MatchEvent | undefined {
  return events.find((event) =>
    event.timestampSeconds <= timestampSeconds
    && timestampSeconds - event.timestampSeconds <= 8
    && event.participants.some((participant) =>
      participant.teamName === player.teamName && participant.player === player.player));
}

function chooseState(
  player: SimPlayer,
  opponent: SimPlayer | undefined,
  wavePoint: TimelinePoint,
  event: MatchEvent | undefined,
  attacks: PendingAttack[],
  timestampSeconds: number,
): TimelinePlayerState {
  if (player.deathUntil > timestampSeconds) return '사망';
  if (player.recallStartedAt >= 0 || player.baseRecoverUntil > timestampSeconds) return '귀환';
  if (player.health <= HEALTH_THRESHOLD_TO_RECALL) {
    player.recallStartedAt = timestampSeconds;
    return '귀환';
  }
  if (event) return event.type === 'TEAMFIGHT' || event.type === 'KILL' ? '전투' : '딜교';
  const incomingProjectile = attacks.find((attack) =>
    attack.targetKey === player.key
    && attack.launchTime <= timestampSeconds
    && attack.hitTime > timestampSeconds);
  if (incomingProjectile) {
    const dodgeChance = clamp(player.player.laning / 100, 0, 1);
    const dodgeSeed = incomingProjectile.launchTime * 17
      + player.player.laning
      + player.player.nickname.length * 31;
    if (deterministic(dodgeSeed) < dodgeChance) return '회피';
  }
  if (
    player.lane
    && opponent
    && opponent.deathUntil <= timestampSeconds
    && timestampSeconds >= player.nextPokeAt
    && pointDistance(player.position, opponent.position)
      <= player.champion.combatStats.basicRange / 15000
  ) {
    const pokeChance = 0.06 + clamp(player.player.aggression / 100, 0, 1) * 0.18;
    const pokeSeed = timestampSeconds * 29
      + player.player.aggression * 7
      + player.player.nickname.length * 13;
    if (deterministic(pokeSeed) < pokeChance) return '견제';
  }
  return '파밍';
}

function getGoal(
  result: MatchResult,
  player: SimPlayer,
  state: TimelinePlayerState,
  wavePoint: TimelinePoint,
  timestampSeconds: number,
  event?: MatchEvent,
): TimelinePoint {
  if (state === '사망') return player.position;
  if (state === '귀환') {
    const atBase = pointDistance(player.position, player.base) < 0.018;
    if (atBase && player.baseRecoverUntil === 0) player.baseRecoverUntil = timestampSeconds + 8;
    return player.base;
  }
  if (event) return { ...event.position };
  if (player.player.position === 'JUNGLE') return getJungleTarget(player.side, timestampSeconds);
  if (!player.lane) return wavePoint;
  const laneIndex = player.lane === 'TOP' ? 0 : player.lane === 'MID' ? 1 : 2;
  const offset = (player.player.position === 'SUPPORT' ? 0.028 : -0.018) + laneIndex * 0.002;
  const baseProgress = player.side === 'home' ? 0.5 + offset : 0.5 - offset;
  return pointOnLane(player.lane, clamp(baseProgress + (wavePoint.x - 0.5) * 0.08, 0.08, 0.92));
}

function getItemList(gold: number, champion: Champion): MatchItem[] {
  const count = Math.min(4, Math.floor(Math.max(0, gold - 500) / 1300));
  const preferred = champion.role === 'TANK'
    ? MATCH_ITEMS.filter((item) => item.axis === 'DEFENSE')
    : champion.role === 'UTILITY'
      ? MATCH_ITEMS.filter((item) => item.axis === 'UTILITY')
      : MATCH_ITEMS.filter((item) => item.axis === (champion.timing === 'LATE' ? 'GROWTH' : 'DAMAGE'));
  return [...preferred, ...MATCH_ITEMS].filter((item, index, list) => list.indexOf(item) === index).slice(0, count);
}

function createPlayers(result: MatchResult): SimPlayer[] {
  const create = (teamName: string, players: Player[], picks: Champion[]): SimPlayer[] =>
    players.map((player, index) => {
      const side = getSide(result, teamName);
      const start = getBase(result, teamName);
      return {
        key: keyForPlayer(teamName, player),
        teamName,
        player,
        champion: picks[index],
        position: { ...start },
        target: { ...start },
        health: 100,
        resource: 100,
        state: '이동',
        level: 1,
        cs: 0,
        gold: 500,
        ultimateReady: false,
        items: [],
        lane: LANE_FOR_POSITION[player.position],
        side,
        base: start,
        csFraction: 0,
        recallStartedAt: -1,
        baseRecoverUntil: 0,
        deathUntil: 0,
        nextPokeAt: 0,
        respawned: false,
      };
    });
  return [
    ...create(result.homeTeam.name, result.homeTeam.players, result.homePicks),
    ...create(result.awayTeam.name, result.awayTeam.players, result.awayPicks),
  ];
}

function spawnWaves(
  result: MatchResult,
  waves: SimWave[],
  timestampSeconds: number,
): void {
  if (timestampSeconds % 30 !== 0) return;
  LANES.forEach((lane, laneIndex) => {
    waves.push({
      key: `${timestampSeconds}-${lane}-home`,
      teamName: result.homeTeam.name,
      lane,
      position: pointOnLane(lane, 0.08),
      alive: true,
      engaged: false,
      progress: 0.08,
      spawnedAt: timestampSeconds,
    });
    waves.push({
      key: `${timestampSeconds}-${lane}-away`,
      teamName: result.awayTeam.name,
      lane,
      position: pointOnLane(lane, 0.92),
      alive: true,
      engaged: false,
      progress: 0.92,
      spawnedAt: timestampSeconds,
    });
    // laneIndex is intentionally part of the deterministic cadence without changing the wave rule.
    if (laneIndex < 0) waves.pop();
  });
}

function advanceWaves(result: MatchResult, waves: SimWave[], timestampSeconds: number): void {
  waves.forEach((wave) => {
    if (!wave.alive) return;
    const direction = wave.teamName === result.homeTeam.name ? 1 : -1;
    wave.progress = clamp(wave.progress + direction * 0.0045, 0.04, 0.96);
    wave.position = pointOnLane(wave.lane, wave.progress);
  });
  LANES.forEach((lane) => {
    const pair = waves.filter((wave) => wave.lane === lane && wave.alive && timestampSeconds - wave.spawnedAt < 130);
    const home = pair.filter((wave) => wave.teamName === result.homeTeam.name).sort((a, b) => b.spawnedAt - a.spawnedAt)[0];
    const away = pair.filter((wave) => wave.teamName === result.awayTeam.name).sort((a, b) => b.spawnedAt - a.spawnedAt)[0];
    if (!home || !away) return;
    const phase = getPhaseAtTimestamp(result, timestampSeconds);
    const homeRatio = phase.homePower / Math.max(1, phase.homePower + phase.awayPower);
    if (Math.abs(home.progress - away.progress) < 0.09) {
      home.engaged = true;
      away.engaged = true;
      const push = (homeRatio - 0.5) * 0.0016;
      home.progress = clamp(home.progress + push, 0.04, 0.96);
      away.progress = clamp(away.progress + push, 0.04, 0.96);
      home.position = pointOnLane(lane, home.progress);
      away.position = pointOnLane(lane, away.progress);
    }
  });
  waves.forEach((wave) => {
    if (timestampSeconds - wave.spawnedAt > 145 || wave.progress > 0.94 || wave.progress < 0.06) wave.alive = false;
  });
}

function createAttack(
  attacker: SimPlayer,
  defender: SimPlayer,
  result: MatchResult,
  timestampSeconds: number,
  index: number,
): PendingAttack {
  const attackerRatio = getPhasePowerRatio(result, attacker.teamName, timestampSeconds);
  const laneDiff = (attacker.player.laning - defender.player.laning) / 100;
  const hitChance = clamp(0.46 + laneDiff * 0.22 + (attackerRatio - 0.5) * 0.75, 0.18, 0.92);
  return {
    key: `poke-${timestampSeconds}-${index}`,
    sourceKey: attacker.key,
    targetKey: defender.key,
    teamName: attacker.teamName,
    launchTime: timestampSeconds,
    hitTime: timestampSeconds + 2,
    source: { ...attacker.position },
    target: { ...defender.position },
    damage: 4.5 + attacker.player.laning / 32,
    willHit: deterministic(timestampSeconds * 17 + index * 31 + attacker.player.laning) < hitChance,
  };
}

function currentProjectiles(attacks: PendingAttack[], timestampSeconds: number): TimelineProjectile[] {
  return attacks
    .filter((attack) => timestampSeconds >= attack.launchTime && timestampSeconds <= attack.hitTime)
    .map((attack) => ({
      key: attack.key,
      sourceKey: attack.sourceKey,
      targetKey: attack.targetKey,
      source: attack.source,
      target: attack.target,
      progress: clamp((timestampSeconds - attack.launchTime) / (attack.hitTime - attack.launchTime), 0, 1),
      hit: timestampSeconds >= attack.hitTime && attack.willHit,
      teamName: attack.teamName,
    }));
}

function applyAttackResults(
  players: SimPlayer[],
  attacks: PendingAttack[],
  timestampSeconds: number,
): void {
  attacks.filter((attack) => attack.hitTime === timestampSeconds && attack.willHit).forEach((attack) => {
    const target = players.find((player) => player.key === attack.targetKey);
    if (!target || target.deathUntil > timestampSeconds || target.state === '회피') return;
    target.health = clamp(target.health - attack.damage, 0, 100);
  });
}

function createWards(players: SimPlayer[], timestampSeconds: number): TimelineWard[] {
  const wards: TimelineWard[] = [];
  players.forEach((player, index) => {
    if (player.player.position !== 'JUNGLE' && player.player.position !== 'SUPPORT') return;
    if (player.state === '사망') return;
    const interval = Math.max(28, Math.round(88 - player.player.vision * 0.42));
    if (timestampSeconds < 10 || timestampSeconds % interval !== (index * 7) % interval) return;
    const point = player.player.position === 'JUNGLE'
      ? getJungleTarget(player.side, timestampSeconds + index * 11)
      : pointOnLane((player.lane ?? 'MID'), player.side === 'home' ? 0.38 : 0.62);
    wards.push({
      key: `ward-${player.key}-${timestampSeconds}`,
      teamName: player.teamName,
      position: point,
      remainingSeconds: 120,
    });
  });
  return wards;
}

function updateActiveWards(
  players: SimPlayer[],
  timestampSeconds: number,
  activeWards: TimelineWard[],
): TimelineWard[] {
  activeWards.forEach((ward) => {
    ward.remainingSeconds -= 1;
  });
  for (let index = activeWards.length - 1; index >= 0; index -= 1) {
    if (activeWards[index].remainingSeconds <= 0) activeWards.splice(index, 1);
  }
  activeWards.push(...createWards(players, timestampSeconds));
  return activeWards.map((ward) => ({
    ...ward,
    position: { ...ward.position },
  }));
}

function createTeamVision(
  result: MatchResult,
  players: SimPlayer[],
  wards: TimelineWard[],
): TimelineTeamVision[] {
  return [result.homeTeam.name, result.awayTeam.name].map((teamName) => {
    const areas: TimelineVisionArea[] = [
      ...players
        .filter((player) => player.teamName === teamName && player.state !== '사망')
        .map((player) => ({
          center: { ...player.position },
          radius: 0.06,
          sourceType: 'PLAYER' as const,
          sourceKey: player.key,
        })),
      ...wards
        .filter((ward) => ward.teamName === teamName && ward.remainingSeconds > 0)
        .map((ward) => ({
          center: { ...ward.position },
          radius: 0.09,
          sourceType: 'WARD' as const,
          sourceKey: ward.key,
        })),
      {
        center: getBase(result, teamName),
        radius: 0.08,
        sourceType: 'BASE' as const,
        sourceKey: `${teamName}:base`,
      },
    ];
    const visibleCells = Array.from({ length: 40 * 40 }, (_, index) => ({
      x: (index % 40 + 0.5) / 40,
      y: (Math.floor(index / 40) + 0.5) / 40,
    })).filter((point) =>
      areas.some((area) => circleDistance(point, area.center) <= area.radius),
    ).length;
    return {
      teamName,
      areas,
      coveragePercent: visibleCells / (40 * 40) * 100,
    };
  });
}

function judgeGank(
  result: MatchResult,
  event: MatchEvent,
  eventIndex: number,
  players: SimPlayer[],
  teamVision: TimelineTeamVision[],
): TimelineGankOutcome {
  const attackingTeamName = event.participants[0]?.teamName ?? result.homeTeam.name;
  const defendingTeamName = attackingTeamName === result.homeTeam.name
    ? result.awayTeam.name
    : result.homeTeam.name;
  const ganker = event.participants
    .map((participant) => players.find((player) =>
      player.teamName === participant.teamName && player.player === participant.player))
    .find((player) => player?.player.position === 'JUNGLE')
    ?? players.find((player) => player.teamName === attackingTeamName && player.player.position === 'JUNGLE')
    ?? players.find((player) => player.teamName === attackingTeamName)!;
  const victim = players
    .filter((player) => player.teamName === defendingTeamName && player.state !== '사망')
    .sort((left, right) =>
      circleDistance(left.position, event.position) - circleDistance(right.position, event.position))[0]
    ?? players.find((player) => player.teamName === defendingTeamName)!;
  const failedByVision = isPointVisibleToTeam(ganker.position, defendingTeamName, teamVision);
  return {
    eventIndex,
    timestampSeconds: event.timestampSeconds,
    attackingTeamName,
    defendingTeamName,
    gankerKey: ganker.key,
    victimKey: victim.key,
    success: !failedByVision,
    failedByVision,
  };
}

function snapshotPlayer(player: SimPlayer, result: MatchResult, timestampSeconds: number): TimelinePlayerFrame {
  const phase = getPhaseAtTimestamp(result, timestampSeconds);
  const teamRatio = getPhasePowerRatio(result, player.teamName, timestampSeconds);
  const levelBase = player.teamName === result.homeTeam.name ? phase.homeLevel : phase.awayLevel;
  const level = clamp(Math.round(levelBase + (timestampSeconds / MATCH_DURATION_SECONDS) * 2), 1, 18);
  player.level = level;
  player.ultimateReady = level >= 6 && player.resource >= 45 && player.state !== '사망';
  player.gold = Math.round(500 + timestampSeconds * (1.5 + teamRatio * 0.8) + player.cs * 20);
  player.items = getItemList(player.gold, player.champion);
  return {
    key: player.key,
    teamName: player.teamName,
    player: player.player,
    champion: player.champion,
    position: { ...player.position },
    target: { ...player.target },
    health: Math.round(player.health * 10) / 10,
    resource: Math.round(player.resource * 10) / 10,
    state: player.state,
    level,
    cs: Math.floor(player.cs),
    gold: player.gold,
    ultimateReady: player.ultimateReady,
    items: [...player.items],
    respawned: player.respawned,
  };
}

function getTeamStats(
  result: MatchResult,
  events: MatchEvent[],
  players: SimPlayer[],
  teamName: string,
  timestampSeconds: number,
  gankOutcomes: TimelineGankOutcome[],
): TimelineTeamStats {
  const visible = events
    .map((event, eventIndex) => ({ event, eventIndex }))
    .filter(({ event }) => event.timestampSeconds <= timestampSeconds);
  const kills = visible.reduce((sum, { event, eventIndex }) =>
    sum + (event.participants[0]?.teamName === teamName
      && ['KILL', 'GANK', 'TEAMFIGHT'].includes(event.type)
      && (event.type !== 'GANK' || gankOutcomes.find((outcome) => outcome.eventIndex === eventIndex)?.success)
      ? event.type === 'TEAMFIGHT' ? Math.max(1, event.participants.length - 1) : 1
      : 0), 0);
  const turrets = visible.filter(({ event }) => event.type === 'TOWER' && event.participants[0]?.teamName === teamName).length;
  const objectiveStacks = visible.filter((event) =>
    event.event.type === 'OBJECTIVE' && event.event.participants[0]?.teamName === teamName).length;
  return {
    kills,
    gold: players.filter((player) => player.teamName === teamName)
      .reduce((sum, player) => sum + player.gold, 0),
    turrets,
    objectiveStacks,
  };
}

function getCamera(
  result: MatchResult,
  events: MatchEvent[],
  players: SimPlayer[],
  timestampSeconds: number,
  previous: TimelinePoint,
): { center: TimelinePoint; focusKeys: string[]; hardCut: boolean } {
  const currentEvent = events.find((event) => event.timestampSeconds === timestampSeconds);
  const eventPlayers = currentEvent?.participants
    .map((participant) => players.find((player) =>
      player.teamName === participant.teamName && player.player === participant.player))
    .filter((player): player is SimPlayer => Boolean(player)) ?? [];
  if (currentEvent && eventPlayers.length >= 5) {
    return { center: { ...currentEvent.position }, focusKeys: eventPlayers.map((player) => player.key), hardCut: true };
  }
  const combatPlayers = players.filter((player) =>
    player.state === '전투' || player.state === '딜교' || player.state === '견제');
  const selected = combatPlayers.slice(0, 3);
  const desired = selected.length > 0
    ? {
      x: selected.reduce((sum, player) => sum + player.position.x, 0) / selected.length,
      y: selected.reduce((sum, player) => sum + player.position.y, 0) / selected.length,
    }
    : previous;
  const center = moveToward(previous, desired);
  return { center, focusKeys: selected.map((player) => player.key), hardCut: false };
}

/**
 * 0초부터 종료까지 한 번만 실행하는 경기 기록 생성기다.
 * 기존 MatchResult의 구간 승패·전력·밴픽은 읽기만 하고 다시 계산하거나 변경하지 않는다.
 */
export function generateMatchTimeline(result: MatchResult, events: MatchEvent[]): MatchTimeline {
  const players = createPlayers(result);
  const waves: SimWave[] = [];
  const attacks: PendingAttack[] = [];
  const activeWards: TimelineWard[] = [];
  const frames: MatchTimelineFrame[] = [];
  const previousPositions = new Map<string, TimelinePoint>();
  const movementViolations: MatchTimeline['movementViolations'] = [];
  const highlightSeconds = new Set<number>();
  const gankOutcomes: TimelineGankOutcome[] = [];
  let cameraCenter: TimelinePoint = { x: 0.5, y: 0.5 };

  for (let timestampSeconds = 0; timestampSeconds <= MATCH_DURATION_SECONDS; timestampSeconds += 1) {
    spawnWaves(result, waves, timestampSeconds);
    advanceWaves(result, waves, timestampSeconds);
    const activeWaves = waves.filter((wave) => wave.alive);
    const eventIndices = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.timestampSeconds === timestampSeconds)
      .map(({ index }) => index);
    const eventsAtTime = eventIndices.map((index) => events[index]);
    const wardsAtStart = updateActiveWards(players, timestampSeconds, activeWards);
    const visionAtStart = createTeamVision(result, players, wardsAtStart);
    eventsAtTime.forEach((event, localIndex) => {
      if (['KILL', 'GANK', 'TEAMFIGHT'].includes(event.type)) highlightSeconds.add(timestampSeconds);
      if (event.type === 'GANK') {
        const outcome = judgeGank(
          result,
          event,
          eventIndices[localIndex],
          players,
          visionAtStart,
        );
        gankOutcomes.push(outcome);
        if (!outcome.success) return;
      }
      event.participants.forEach((participant) => {
        const player = players.find((candidate) =>
          candidate.teamName === participant.teamName && candidate.player === participant.player);
        if (player) player.eventTarget = { point: { ...event.position }, until: timestampSeconds + 8 };
      });
    });

    players.forEach((player) => {
      const wavePoint = player.lane
        ? getWaveEngagementPoint(activeWaves, player.lane)
        : getJungleTarget(player.side, timestampSeconds);
      const opponent = player.lane
        ? getLanePlayer(players, player.teamName === result.homeTeam.name ? result.awayTeam.name : result.homeTeam.name, player.lane)
        : undefined;
      const event = getEventForPlayer(events, player, timestampSeconds);
        player.respawned = false;
        if (player.deathUntil > 0 && timestampSeconds >= player.deathUntil) {
          player.health = 100;
          player.resource = 100;
          player.position = { ...player.base };
          player.deathUntil = 0;
          player.recallStartedAt = -1;
          player.baseRecoverUntil = 0;
          player.respawned = true;
          player.state = '이동';
        }
        player.state = chooseState(player, opponent, wavePoint, event, attacks, timestampSeconds);
      player.target = getGoal(
        result,
        player,
        player.state,
        wavePoint,
        timestampSeconds,
        player.eventTarget && player.eventTarget.until >= timestampSeconds ? { position: player.eventTarget.point } as MatchEvent : event,
      );
      if (player.state === '귀환' && pointDistance(player.position, player.base) < 0.018 && player.baseRecoverUntil > timestampSeconds) {
        player.health = clamp(player.health + 12, 0, 100);
        player.resource = clamp(player.resource + 16, 0, 100);
      }
      if (player.state !== '사망') player.position = moveToward(player.position, player.target);
      if (player.state !== '사망' && player.state !== '귀환') {
        player.resource = clamp(player.resource + (player.state === '전투' ? -4 : 1.6), 0, 100);
      }
      if (player.recallStartedAt >= 0
        && pointDistance(player.position, player.base) < 0.018
        && player.baseRecoverUntil > 0
        && timestampSeconds >= player.baseRecoverUntil) {
        player.recallStartedAt = -1;
        player.baseRecoverUntil = 0;
        player.health = 100;
        player.resource = 100;
      }
    });

    // 각 선수는 자신의 기본기 사거리와 쿨타임, 공격성에 따라 독립적으로 견제한다.
    LANES.forEach((lane, laneIndex) => {
      const home = getLanePlayer(players, result.homeTeam.name, lane);
      const away = getLanePlayer(players, result.awayTeam.name, lane);
      if (!home || !away || home.state === '사망' || away.state === '사망') return;
      [
        [home, away],
        [away, home],
      ].forEach(([attacker, defender], attackIndex) => {
        if (attacker.state !== '견제') return;
        attacker.nextPokeAt = timestampSeconds + attacker.champion.combatStats.basicCooldown;
        attacks.push(createAttack(attacker, defender, result, timestampSeconds, attacks.length + laneIndex + attackIndex));
        highlightSeconds.add(timestampSeconds);
      });
    });

    applyAttackResults(players, attacks, timestampSeconds);
    players.forEach((player) => {
      if (player.health <= 0 && player.deathUntil <= timestampSeconds) {
        player.health = 0;
        player.deathUntil = timestampSeconds + 20;
        player.state = '사망';
      }
      const farmPoint = player.lane
        ? getWaveEngagementPoint(activeWaves, player.lane)
        : getJungleTarget(player.side, timestampSeconds);
      if (player.state === '파밍' && pointDistance(player.position, farmPoint) < 0.12) {
        const teamRatio = getPhasePowerRatio(result, player.teamName, timestampSeconds);
        const roleFactor = player.player.position === 'SUPPORT'
          ? 0.15
          : player.player.position === 'JUNGLE'
            ? 0.75
            : 1;
        player.csFraction += (0.10 + player.player.farming / 1400)
          * roleFactor
          * (0.85 + teamRatio * 0.3);
        player.cs = Math.floor(player.csFraction);
      }
    });

    const wards = wardsAtStart;
    const teamVision = createTeamVision(result, players, wards);
    const camera = getCamera(result, events, players, timestampSeconds, cameraCenter);
    cameraCenter = camera.center;
    const framePlayers = players.map((player) => snapshotPlayer(player, result, timestampSeconds));
    framePlayers.forEach((player) => {
      const previous = previousPositions.get(player.key);
      if (previous) {
        const delta = pointDistance(previous, player.position);
        if (delta > MAX_MOVE_PER_SECOND + 0.000001 && !player.respawned) {
          movementViolations.push({ key: player.key, timestampSeconds, delta });
        }
      }
      previousPositions.set(player.key, { ...player.position });
    });
    const homeStats = getTeamStats(result, events, players, result.homeTeam.name, timestampSeconds, gankOutcomes);
    const awayStats = getTeamStats(result, events, players, result.awayTeam.name, timestampSeconds, gankOutcomes);
    const recentKills = events
      .map((event, eventIndex) => ({ event, eventIndex }))
      .filter(({ event }) => event.timestampSeconds <= timestampSeconds && timestampSeconds - event.timestampSeconds <= 30)
      .filter(({ event, eventIndex }) =>
        ['KILL', 'GANK', 'TEAMFIGHT'].includes(event.type)
        && (event.type !== 'GANK' || gankOutcomes.find((outcome) => outcome.eventIndex === eventIndex)?.success))
      .slice(-3)
      .map(({ event }) => ({
        timestampSeconds: event.timestampSeconds,
        teamName: event.participants[0]?.teamName ?? '',
        victimTeamName: event.participants[0]?.teamName === result.homeTeam.name ? result.awayTeam.name : result.homeTeam.name,
        description: event.description,
      }));
    frames.push({
      timestampSeconds,
      players: framePlayers,
      minionWaves: activeWaves.map((wave) => ({
        key: wave.key,
        teamName: wave.teamName,
        lane: wave.lane,
        position: { ...wave.position },
        alive: wave.alive,
        engaged: wave.engaged,
      })),
      projectiles: currentProjectiles(attacks, timestampSeconds),
      wards,
      teamVision,
      home: homeStats,
      away: awayStats,
      recentKills,
      activeEventIndices: eventIndices,
      cameraCenter: { ...camera.center },
      cameraFocusKeys: camera.focusKeys,
      cameraHardCut: camera.hardCut,
    });
  }

  const maxPositionDelta = frames.reduce((maximum, frame, frameIndex) => {
    if (frameIndex === 0) return maximum;
    return frame.players.reduce((currentMaximum, player, playerIndex) => {
      const previous = frames[frameIndex - 1].players[playerIndex];
      return Math.max(currentMaximum, pointDistance(previous.position, player.position));
    }, maximum);
  }, 0);

  [300, 900, 1500, 2100].forEach((timestampSeconds) => {
    const frame = frames[timestampSeconds];
    const homeCoverage = frame.teamVision.find((vision) => vision.teamName === result.homeTeam.name)?.coveragePercent ?? 0;
    const awayCoverage = frame.teamVision.find((vision) => vision.teamName === result.awayTeam.name)?.coveragePercent ?? 0;
    console.log(
      `[전장의 안개] ${timestampSeconds / 60}분 | HOME ${homeCoverage.toFixed(2)}% | AWAY ${awayCoverage.toFixed(2)}%`,
    );
  });
  const successfulGanks = gankOutcomes.filter((outcome) => outcome.success).length;
  const failedGanks = gankOutcomes.filter((outcome) => !outcome.success);
  const visionFailureRate = failedGanks.length === 0
    ? 0
    : failedGanks.filter((outcome) => outcome.failedByVision).length / failedGanks.length * 100;
  console.log(
    `[전장의 안개] 갱 시도 ${gankOutcomes.length}회 | 성공 ${successfulGanks}회 | 실패 중 시야 감지 ${visionFailureRate.toFixed(2)}%`,
  );

  return {
    durationSeconds: MATCH_DURATION_SECONDS,
    frames,
    highlightSeconds: [...highlightSeconds].sort((left, right) => left - right),
    maxPositionDelta,
    movementViolations,
    gankOutcomes,
  };
}

export const TIMELINE_MAX_MOVE_PER_SECOND = MAX_MOVE_PER_SECOND;