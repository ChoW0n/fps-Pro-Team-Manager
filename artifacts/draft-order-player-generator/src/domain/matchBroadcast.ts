/**
 * 중계 카메라와 라인전 장면은 이미 계산된 MatchResult와 이벤트를 시각화하는 표시 레이어입니다.
 * 이 파일은 승패·구간 전력·밴픽 결과를 다시 계산하지 않습니다.
 * 구간 전력 우세는 견제 명중률과 CS 표시의 방향만 설명하며, 화면용 라인전이 경기 결과를 바꾸지 않습니다.
 */

import { Champion } from './Champion';
import { MatchResult } from './MatchResult';
import { MatchEvent, MatchPlayerSnapshot } from './matchEvents';
import { getPhaseAtTimestamp } from './matchEconomy';
import { Player, Position } from './Player';

export type BroadcastLane = 'TOP' | 'MID' | 'BOT';

export interface BroadcastPoint {
  x: number;
  y: number;
}

export interface BroadcastChampion {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  position: BroadcastPoint;
  health: number;
  resource: number;
  cs: number;
  gold: number;
  state: '라인전' | '압박' | '후퇴' | '합류';
}

export interface BroadcastMinion {
  key: string;
  teamName: string;
  position: BroadcastPoint;
  alive: boolean;
}

export interface BroadcastProjectile {
  source: BroadcastPoint;
  target: BroadcastPoint;
  progress: number;
  hit: boolean;
  teamName: string;
}

export interface BroadcastWard {
  teamName: string;
  position: BroadcastPoint;
  remaining: number;
}

export interface BroadcastTurret {
  teamName: string;
  position: BroadcastPoint;
  destroyed: boolean;
}

export interface BroadcastScene {
  focusLane: BroadcastLane;
  cameraCenter: BroadcastPoint;
  cameraZoom: number;
  champions: BroadcastChampion[];
  allChampions: BroadcastChampion[];
  minions: BroadcastMinion[];
  projectiles: BroadcastProjectile[];
  wards: BroadcastWard[];
  turrets: BroadcastTurret[];
  focusEvent?: MatchEvent;
  laneMessage: string;
}

const MATCH_END_SECONDS = 2100;
const LANES: BroadcastLane[] = ['TOP', 'MID', 'BOT'];
const COMBAT_TYPES: MatchEvent['type'][] = ['KILL', 'GANK', 'TEAMFIGHT', 'ROAM'];
const HOME_COLOR = '#557D91';
const AWAY_COLOR = '#8B4745';

/** 현재 시점에서 가장 방송 가치가 높은 라인을 고릅니다. */
export function deriveBroadcastScene(
  result: MatchResult,
  events: MatchEvent[],
  snapshots: MatchPlayerSnapshot[],
  timestampSeconds: number,
): BroadcastScene {
  const time = Math.max(0, Math.min(MATCH_END_SECONDS, timestampSeconds));
  const focusEvent = getFocusEvent(events, time);
  const focusLane = focusEvent
    ? getPlayerLane(focusEvent.participants[0]?.player)
    : getMostActiveLane(result, events, time);
  const allChampions = createChampions(result, events, snapshots, time);
  const focusedKeys = new Set(
    allChampions
      .filter((champion) => champion.player.position !== 'JUNGLE'
        && getPlayerLane(champion.player) === focusLane)
      .map((champion) => champion.key),
  );
  focusEvent?.participants.forEach((participant) => {
    focusedKeys.add(getPlayerKey(participant.teamName, participant.player));
  });
  const champions = allChampions.filter((champion) => focusedKeys.has(champion.key)).slice(0, 5);
  const cameraCenter = focusEvent
    ? clampPoint(focusEvent.position)
    : getLaneCenter(focusLane, time);
  const cameraZoom = champions.length >= 5 ? 2.1 : 2.45;
  return {
    focusLane,
    cameraCenter,
    cameraZoom,
    champions,
    allChampions,
    minions: createMinions(result, events, focusLane, time),
    projectiles: createProjectiles(focusEvent, champions, time),
    wards: createWards(result, focusLane, time),
    turrets: createTurrets(result, events, focusLane),
    focusEvent,
    laneMessage: focusEvent
      ? focusEvent.description
      : `${getLaneLabel(focusLane)} 라인에서 미니언 웨이브가 맞붙고 있습니다.`,
  };
}

/** 이벤트가 없을 때도 현재 흐름이 가장 큰 라인을 찾아 평소 카메라를 유지합니다. */
function getMostActiveLane(result: MatchResult, events: MatchEvent[], timestampSeconds: number): BroadcastLane {
  const recent = events.filter((event) =>
    event.timestampSeconds <= timestampSeconds
    && timestampSeconds - event.timestampSeconds < 150,
  );
  const scores = LANES.map((lane) => ({
    lane,
    score: recent.reduce((sum, event) =>
      sum + (event.participants.some((participant) => getPlayerLane(participant.player) === lane)
        ? event.type === 'TEAMFIGHT' ? 4 : event.type === 'GANK' ? 3 : 1
        : 0), 0),
  }));
  return scores.sort((left, right) => right.score - left.score)[0]?.lane ?? getLaneFromPosition(result.homeTeam.players[0]?.position);
}

/** 너무 오래되지 않은 교전이나 포탑 이벤트를 카메라의 우선 표적으로 선택합니다. */
function getFocusEvent(events: MatchEvent[], timestampSeconds: number): MatchEvent | undefined {
  return events
    .filter((event) => event.timestampSeconds <= timestampSeconds && timestampSeconds - event.timestampSeconds < 18)
    .sort((left, right) => {
      const priority = (event: MatchEvent) =>
        event.type === 'TEAMFIGHT' ? 5 : event.type === 'GANK' ? 4 : event.type === 'TOWER' ? 3 : 1;
      return priority(right) - priority(left) || right.timestampSeconds - left.timestampSeconds;
    })[0];
}

/** 열 명의 챔피언과 현재 체력·CS·골드 표시값을 만듭니다. */
function createChampions(
  result: MatchResult,
  events: MatchEvent[],
  snapshots: MatchPlayerSnapshot[],
  timestampSeconds: number,
): BroadcastChampion[] {
  const phase = getPhaseAtTimestamp(result, timestampSeconds);
  const entries = [
    ...result.homeTeam.players.map((player, index) => ({
      player,
      champion: result.homePicks[index],
      teamName: result.homeTeam.name,
      teamPower: phase.homePower,
      enemyPower: phase.awayPower,
    })),
    ...result.awayTeam.players.map((player, index) => ({
      player,
      champion: result.awayPicks[index],
      teamName: result.awayTeam.name,
      teamPower: phase.awayPower,
      enemyPower: phase.homePower,
    })),
  ];
  return entries.map(({ player, champion, teamName, teamPower, enemyPower }, index) => {
    const key = getPlayerKey(teamName, player);
    const snapshotPosition = getSnapshotPosition(snapshots, key, timestampSeconds);
    const position = player.position === 'JUNGLE'
      ? snapshotPosition ?? getJunglePoint(teamName === result.homeTeam.name, timestampSeconds, index)
      : getLanePoint(getPlayerLane(player), teamName === result.homeTeam.name, timestampSeconds, index);
    const powerShare = teamPower / Math.max(1, teamPower + enemyPower);
    const pressure = getOpponentPressure(events, teamName, player, timestampSeconds);
    const health = clamp(73 + (powerShare - 0.5) * 42 - pressure * 9, 18, 100);
    const csPerMinute = player.position === 'JUNGLE'
      ? 5.5 + player.macro / 55
      : 5.8 + player.laning / 23 + player.macro / 90;
    const cs = Math.round(csPerMinute * timestampSeconds / 60);
    const gold = Math.round(500 + cs * 21 + Math.max(0, timestampSeconds - 300) * (0.8 + powerShare * 0.4));
    const state = getChampionState(player, health, events, timestampSeconds);
    return {
      key,
      teamName,
      player,
      champion,
      position,
      health,
      resource: clamp(42 + player.macro * 0.52 + (timestampSeconds % 80) * 0.18, 18, 100),
      cs,
      gold,
      state,
    };
  });
}

/** 상대 팀의 최근 라인 압박을 표시용 체력 감소로 변환합니다. */
function getOpponentPressure(
  events: MatchEvent[],
  teamName: string,
  player: Player,
  timestampSeconds: number,
): number {
  return events.filter((event) =>
    event.timestampSeconds <= timestampSeconds
    && timestampSeconds - event.timestampSeconds < 110
    && COMBAT_TYPES.includes(event.type)
    && event.participants[0]?.teamName !== teamName
    && event.participants.some((participant) => getPlayerLane(participant.player) === getPlayerLane(player)),
  ).length;
}

/** 현재 이벤트 참가 여부와 체력으로 중계용 행동 상태를 정합니다. */
function getChampionState(
  player: Player,
  health: number,
  events: MatchEvent[],
  timestampSeconds: number,
): BroadcastChampion['state'] {
  if (health < 35) return '후퇴';
  const recent = events.some((event) =>
    event.timestampSeconds <= timestampSeconds
    && timestampSeconds - event.timestampSeconds < 15
    && event.participants.some((participant) => participant.player === player)
    && ['GANK', 'TEAMFIGHT', 'ROAM'].includes(event.type),
  );
  if (recent) return '합류';
  if (player.aggression >= 68 || player.laning >= 78) return '압박';
  return '라인전';
}

/** 30초 웨이브가 라인에서 전진하고 서로 부딪히는 장면을 만듭니다. */
function createMinions(
  result: MatchResult,
  events: MatchEvent[],
  lane: BroadcastLane,
  timestampSeconds: number,
): BroadcastMinion[] {
  const path = getLanePath(lane);
  const cycle = timestampSeconds % 30 / 30;
  const baseProgress = 0.14 + Math.min(0.66, timestampSeconds / MATCH_END_SECONDS * 0.66);
  const lanePressure = events.filter((event) =>
    event.timestampSeconds <= timestampSeconds
    && timestampSeconds - event.timestampSeconds < 180
    && event.participants.some((participant) => getPlayerLane(participant.player) === lane),
  ).length;
  const homeProgress = clamp(baseProgress + lanePressure * 0.006, 0.1, 0.86);
  const awayProgress = 1 - homeProgress;
  const minions: BroadcastMinion[] = [];
  [result.homeTeam.name, result.awayTeam.name].forEach((teamName, teamIndex) => {
    const progress = teamIndex === 0
      ? clamp(homeProgress + cycle * 0.12, 0.08, 0.94)
      : clamp(awayProgress - cycle * 0.12, 0.06, 0.92);
    const deaths = Math.min(4, Math.floor(lanePressure / 3));
    for (let index = 0; index < 6; index += 1) {
      const offset = (index - 2.5) * 0.012;
      minions.push({
        key: `${teamName}:${lane}:${Math.floor(timestampSeconds / 30)}:${index}`,
        teamName,
        position: pointOnPath(path, clamp(progress + offset, 0, 1)),
        alive: index >= deaths,
      });
    }
  });
  return minions;
}

/** 현재 라인에서 날아가는 스킬과 명중 여부를 표시합니다. */
function createProjectiles(
  focusEvent: MatchEvent | undefined,
  champions: BroadcastChampion[],
  timestampSeconds: number,
): BroadcastProjectile[] {
  if (!focusEvent || !['KILL', 'GANK', 'TEAMFIGHT', 'ROAM'].includes(focusEvent.type)) return [];
  const source = champions.find((champion) =>
    champion.player === focusEvent.participants[0]?.player);
  const target = champions.find((champion) =>
    champion.player === focusEvent.participants[1]?.player)
    ?? champions.find((champion) => champion.teamName !== source?.teamName);
  if (!source || !target) return [];
  const progress = clamp((timestampSeconds - focusEvent.timestampSeconds + 7) / 14, 0, 1);
  return [{
    source: source.position,
    target: target.position,
    progress,
    hit: progress >= 0.75,
    teamName: source.teamName,
  }];
}

/** 시야 능력을 별도 능력치로 다시 만들지 않고 기존 운영값에서 표시용 와드를 만듭니다. */
function createWards(result: MatchResult, lane: BroadcastLane, timestampSeconds: number): BroadcastWard[] {
  return [result.homeTeam, result.awayTeam].flatMap((team, teamIndex) => {
    const player = team.players.find((candidate) => candidate.position === 'SUPPORT')
      ?? team.players.find((candidate) => candidate.position === 'JUNGLE');
    if (!player || player.macro < 48) return [];
    const path = getLanePath(lane);
    const cycle = Math.floor(timestampSeconds / 90);
    const point = pointOnPath(path, teamIndex === 0 ? 0.33 : 0.67);
    return [{
      teamName: team.name,
      position: { x: point.x + (teamIndex === 0 ? -0.025 : 0.025), y: point.y + 0.025 },
      remaining: 90 - (timestampSeconds % 90),
    }];
  });
}

/** 라인 바깥 포탑 두 개와 파괴 여부를 표시합니다. */
function createTurrets(result: MatchResult, events: MatchEvent[], lane: BroadcastLane): BroadcastTurret[] {
  const towerCount = events.filter((event) => event.type === 'TOWER'
    && event.participants.some((participant) => getPlayerLane(participant.player) === lane)).length;
  const path = getLanePath(lane);
  return [
    { teamName: result.homeTeam.name, position: pointOnPath(path, 0.23), destroyed: towerCount >= 2 },
    { teamName: result.awayTeam.name, position: pointOnPath(path, 0.77), destroyed: towerCount >= 1 },
  ];
}

/** 미니맵과 메인 카메라가 같은 선수 키를 사용하도록 합니다. */
function getPlayerKey(teamName: string, player: Player): string {
  return `${teamName}:${player.nickname}`;
}

/** 스냅샷에서 현재 선수의 전체 맵 위치를 읽습니다. */
function getSnapshotPosition(
  snapshots: MatchPlayerSnapshot[],
  key: string,
  timestampSeconds: number,
): BroadcastPoint | undefined {
  const snapshot = snapshots.reduce<MatchPlayerSnapshot | undefined>((selected, candidate) =>
    candidate.timestampSeconds <= timestampSeconds
      && (!selected || candidate.timestampSeconds > selected.timestampSeconds)
      ? candidate : selected, undefined);
  const player = snapshot?.players.find((entry) => getPlayerKey(entry.teamName, entry.player) === key);
  return player?.position;
}

/** 선수 포지션을 탑·미드·바텀 방송 라인으로 변환합니다. */
function getPlayerLane(player: Player | undefined): BroadcastLane {
  if (!player) return 'MID';
  if (player.position === 'TOP') return 'TOP';
  if (player.position === 'MID') return 'MID';
  return 'BOT';
}

/** 포지션 타입을 방송 라인으로 변환합니다. */
function getLaneFromPosition(position: Position | undefined): BroadcastLane {
  if (position === 'TOP') return 'TOP';
  if (position === 'MID') return 'MID';
  return 'BOT';
}

/** 시간에 따라 라인 위의 챔피언 위치를 반환합니다. */
function getLanePoint(lane: BroadcastLane, isHome: boolean, timestampSeconds: number, index: number): BroadcastPoint {
  const progress = 0.13 + Math.min(0.72, timestampSeconds / MATCH_END_SECONDS * 0.72);
  const teamProgress = isHome ? progress : 1 - progress;
  const offset = ((index % 2) - 0.5) * 0.035;
  const point = pointOnPath(getLanePath(lane), clamp(teamProgress + (isHome ? offset : -offset), 0, 1));
  return clampPoint({ x: point.x + offset * 0.3, y: point.y - offset * 0.3 });
}

/** 정글러가 미니맵에서 순환하는 위치를 계산합니다. */
function getJunglePoint(isHome: boolean, timestampSeconds: number, index: number): BroadcastPoint {
  const centers = isHome
    ? [{ x: 0.28, y: 0.28 }, { x: 0.28, y: 0.72 }]
    : [{ x: 0.72, y: 0.72 }, { x: 0.72, y: 0.28 }];
  return centers[(Math.floor(timestampSeconds / 120) + index) % centers.length];
}

/** 라인별 세계 좌표 경로를 반환합니다. */
function getLanePath(lane: BroadcastLane): BroadcastPoint[] {
  if (lane === 'TOP') return [{ x: 0.08, y: 0.08 }, { x: 0.08, y: 0.92 }, { x: 0.92, y: 0.92 }];
  if (lane === 'MID') return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.92 }];
  return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }];
}

/** 카메라가 바라볼 기본 라인 중앙을 반환합니다. */
function getLaneCenter(lane: BroadcastLane, timestampSeconds: number): BroadcastPoint {
  return pointOnPath(getLanePath(lane), 0.5 + Math.sin(timestampSeconds / 180) * 0.06);
}

/** 꺾인 라인 경로에서 진행률에 해당하는 점을 반환합니다. */
function pointOnPath(path: BroadcastPoint[], progress: number): BroadcastPoint {
  const scaled = clamp(progress, 0, 1) * (path.length - 1);
  const segment = Math.min(path.length - 2, Math.floor(scaled));
  const local = scaled - segment;
  return {
    x: path[segment].x + (path[segment + 1].x - path[segment].x) * local,
    y: path[segment].y + (path[segment + 1].y - path[segment].y) * local,
  };
}

/** 좌표를 맵 안쪽에 고정합니다. */
function clampPoint(point: BroadcastPoint): BroadcastPoint {
  return { x: clamp(point.x, 0.04, 0.96), y: clamp(point.y, 0.04, 0.96) };
}

/** 숫자를 범위 안에 고정합니다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** 방송 화면에 쓸 짧은 라인 이름입니다. */
export function getLaneLabel(lane: BroadcastLane): string {
  return lane === 'TOP' ? '탑' : lane === 'MID' ? '미드' : '바텀';
}

/** 메인 캔버스에서 사용할 팀 색을 제공합니다. */
export function getBroadcastTeamColor(teamName: string, result: MatchResult): string {
  return teamName === result.homeTeam.name ? HOME_COLOR : AWAY_COLOR;
}