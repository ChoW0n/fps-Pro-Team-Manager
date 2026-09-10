/**
 * 골드·레벨·딜량·아이템은 경기 결과를 다시 계산하지 않는 표시 전용 데이터입니다.
 * 이미 계산된 구간 승패와 전력, 그리고 화면용 이벤트에서 거꾸로 파생합니다.
 * 따라서 이 파일은 두 번째 시뮬레이션이 아니며, 여기서 만든 숫자는 MatchResult의 승패나 전력을 바꾸지 않습니다.
 * 아이템 효과도 현재는 화면과 중계 서사만 담당하고, 계산된 구간 전력에는 절대 반영하지 않습니다.
 */

import { Champion } from './Champion';
import { MatchResult, PhaseResult } from './MatchResult';
import { MatchEvent, MatchEventParticipant } from './matchEvents';
import { Player } from './Player';
import { formatPlayerName } from './playerDisplay';

/** 화면에서 재생할 경기의 표시 시간입니다. */
export const MATCH_DISPLAY_DURATION_SECONDS = 2100;

/** 골드로 자동 구매하는 소수의 표시용 아이템 목록입니다. */
export const MATCH_ITEMS = [
  { key: 'WARDEN_PLATE', name: '검은 성벽판', cost: 1200, axis: 'DEFENSE' },
  { key: 'BLOOD_RELIC', name: '핏빛 유물검', cost: 1450, axis: 'DAMAGE' },
  { key: 'DUSK_CORE', name: '황혼의 핵', cost: 1650, axis: 'GROWTH' },
  { key: 'MIST_VEIL', name: '안개 장막', cost: 1100, axis: 'UTILITY' },
  { key: 'RAVEN_SIGIL', name: '까마귀 인장', cost: 1350, axis: 'DAMAGE' },
  { key: 'OATH_CHAIN', name: '서약의 사슬', cost: 1500, axis: 'DEFENSE' },
  { key: 'MOON_HOURGLASS', name: '월식 모래시계', cost: 1750, axis: 'GROWTH' },
  { key: 'GRAVE_LANTERN', name: '묘지의 등불', cost: 1250, axis: 'UTILITY' },
] as const;

export type MatchItem = (typeof MATCH_ITEMS)[number];
export type MatchItemAxis = MatchItem['axis'];

/** 선수 한 명의 현재 표시용 경기 자원입니다. */
export interface PlayerEconomySnapshot {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  gold: number;
  level: number;
  damage: number;
  items: MatchItem[];
}

/** 양 팀 스코어보드와 선수 상태를 한 시점에 묶은 표시 데이터입니다. */
export interface MatchEconomySnapshot {
  timestampSeconds: number;
  home: { gold: number; kills: number; objectives: number; averageLevel: number };
  away: { gold: number; kills: number; objectives: number; averageLevel: number };
  goldDifference: number;
  players: PlayerEconomySnapshot[];
}

/** 한 교전에서 선수별로 화면에 보여 줄 피해량입니다. */
export interface CombatDamageEntry {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  damage: number;
  targetCount: number;
}

export interface CombatDamageSummary {
  event: MatchEvent;
  entries: CombatDamageEntry[];
  totalDamage: number;
}

export interface MatchItemPurchase {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  item: MatchItem;
}

export interface MatchLevelUp {
  key: string;
  teamName: string;
  player: Player;
  champion: Champion;
  level: number;
  isLateGrowth: boolean;
}

type TeamEconomy = MatchEconomySnapshot['home'];

const COMBAT_EVENT_TYPES: MatchEvent['type'][] = ['KILL', 'GANK', 'TEAMFIGHT'];
const EVENT_GOLD: Record<MatchEvent['type'], number> = {
  KILL: 300,
  GANK: 180,
  OBJECTIVE: 360,
  TOWER: 300,
  TEAMFIGHT: 220,
  ROAM: 90,
};
const ITEM_GOLD_THRESHOLDS = [1200, 2350, 3600, 5000];

/** 화면 표시에서 같은 선수를 안정적으로 찾기 위한 키입니다. */
export function getMatchPlayerKey(teamName: string, player: Player): string {
  return `${teamName}:${player.nickname}`;
}

/** 경기 시각에 해당하는 기존 계산 결과의 구간을 반환합니다. */
export function getPhaseAtTimestamp(result: MatchResult, timestampSeconds: number): PhaseResult {
  if (timestampSeconds < 660) return result.phases[0];
  if (timestampSeconds < 1380) return result.phases[1];
  return result.phases[2];
}

/** 기존 구간 전력 비율을 골드 표시 속도에만 반영합니다. */
function getGoldRate(result: MatchResult, teamName: string, timestampSeconds: number): number {
  const phase = getPhaseAtTimestamp(result, timestampSeconds);
  const teamPower = teamName === result.homeTeam.name ? phase.homePower : phase.awayPower;
  const totalPower = Math.max(1, phase.homePower + phase.awayPower);
  return 0.8 + (teamPower / totalPower) * 0.4;
}

/** 챔피언과 팀 조합의 부족한 축을 완전히 채우지 않는 아이템 순서를 만듭니다. */
function getItemPlan(result: MatchResult, teamName: string, player: Player, champion: Champion): MatchItem[] {
  const picks = teamName === result.homeTeam.name ? result.homePicks : result.awayPicks;
  const hasTank = picks.some((pick) => pick.role === 'TANK');
  const lateCount = picks.filter((pick) => pick.timing === 'LATE').length;
  const pokeCount = picks.filter((pick) => pick.engagement === 'POKE').length;
  const preferredAxis: MatchItemAxis = !hasTank
    ? 'DEFENSE'
    : lateCount >= 3 && champion.timing === 'LATE'
      ? 'GROWTH'
      : pokeCount < 2 && champion.engagement === 'DIVE'
        ? 'UTILITY'
        : champion.role === 'DAMAGE' ? 'DAMAGE' : 'UTILITY';

  const preferred = MATCH_ITEMS.filter((item) => item.axis === preferredAxis);
  const personal = MATCH_ITEMS.filter((item) =>
    item.axis === (champion.timing === 'LATE' ? 'GROWTH' : champion.role === 'TANK' ? 'DEFENSE' : 'DAMAGE'));
  const remaining = MATCH_ITEMS.filter((item) => !preferred.includes(item) && !personal.includes(item));
  return [...preferred, ...personal, ...remaining].filter((item, index, list) => list.indexOf(item) === index);
}

/** 기존 구간 레벨을 화면용 정수 레벨로 표현합니다. */
function getDisplayLevel(result: MatchResult, teamName: string, timestampSeconds: number): number {
  const phase = getPhaseAtTimestamp(result, timestampSeconds);
  return Math.max(1, Math.min(18, Math.round(teamName === result.homeTeam.name ? phase.homeLevel : phase.awayLevel)));
}

/** 이벤트의 참가 선수에게 표시할 추가 골드를 배분합니다. */
function getEventGold(event: MatchEvent, participant: MatchEventParticipant): number {
  if (event.type === 'OBJECTIVE' || event.type === 'TOWER') return EVENT_GOLD[event.type];
  const participantIndex = event.participants.findIndex((entry) =>
    entry.teamName === participant.teamName && entry.player === participant.player);
  const divisor = Math.max(1, event.participants.length);
  return Math.round(EVENT_GOLD[event.type] * (participantIndex === 0 ? 1 : 0.72) / divisor);
}

/** 시각까지의 개인 골드를 계산합니다. 모든 항목은 이벤트와 기존 전력에서만 파생됩니다. */
function getPlayerGold(
  result: MatchResult,
  events: MatchEvent[],
  teamName: string,
  player: Player,
  timestampSeconds: number,
): number {
  const baseGold = 500 + Math.round(timestampSeconds * 2.25 * getGoldRate(result, teamName, timestampSeconds));
  const eventGold = events
    .filter((event) => event.timestampSeconds <= timestampSeconds)
    .reduce((sum, event) => {
      const isTeamReward = event.type === 'OBJECTIVE' || event.type === 'TOWER';
      if (isTeamReward && event.participants[0]?.teamName === teamName) {
        return sum + Math.round(EVENT_GOLD[event.type] / 5);
      }
      const participant = event.participants.find((entry) =>
        entry.teamName === teamName && entry.player === player);
      return participant ? sum + getEventGold(event, participant) : sum;
    }, 0);
  return baseGold + eventGold;
}

/** 이벤트 종류를 기존 경기 이벤트에서 읽어 팀 처치·오브젝트 수를 표시합니다. */
function getTeamScore(events: MatchEvent[], teamName: string, timestampSeconds: number): Pick<TeamEconomy, 'kills' | 'objectives'> {
  const visibleEvents = events.filter((event) => event.timestampSeconds <= timestampSeconds);
  return {
    kills: visibleEvents.reduce((sum, event) =>
      sum + (event.participants[0]?.teamName === teamName && COMBAT_EVENT_TYPES.includes(event.type)
        ? event.type === 'TEAMFIGHT' ? Math.max(1, event.participants.length - 1) : 1
        : 0), 0),
    objectives: visibleEvents.filter((event) =>
      event.participants[0]?.teamName === teamName && (event.type === 'OBJECTIVE' || event.type === 'TOWER')).length,
  };
}

/** 현재 골드에 도달한 아이템만 반환합니다. */
function getItemsForGold(
  result: MatchResult,
  teamName: string,
  player: Player,
  champion: Champion,
  gold: number,
): MatchItem[] {
  const plan = getItemPlan(result, teamName, player, champion);
  const itemCount = ITEM_GOLD_THRESHOLDS.filter((threshold) => gold >= 500 + threshold).length;
  return plan.slice(0, Math.min(itemCount, plan.length));
}

/** 경기 한 시점의 양 팀·열 명 선수 표시 정보를 만듭니다. */
export function deriveMatchEconomySnapshot(
  result: MatchResult,
  events: MatchEvent[],
  timestampSeconds: number,
): MatchEconomySnapshot {
  const time = Math.max(0, Math.min(MATCH_DISPLAY_DURATION_SECONDS, timestampSeconds));
  const players = [
    ...result.homeTeam.players.map((player, index) => ({
      teamName: result.homeTeam.name,
      player,
      champion: result.homePicks[index],
    })),
    ...result.awayTeam.players.map((player, index) => ({
      teamName: result.awayTeam.name,
      player,
      champion: result.awayPicks[index],
    })),
  ].map(({ teamName, player, champion }) => {
    const gold = getPlayerGold(result, events, teamName, player, time);
    const level = getDisplayLevel(result, teamName, time);
    return {
      key: getMatchPlayerKey(teamName, player),
      teamName,
      player,
      champion,
      gold,
      level,
      damage: getPlayerDamage(result, events, teamName, player, time),
      items: getItemsForGold(result, teamName, player, champion, gold),
    };
  });
  const homePlayers = players.filter((player) => player.teamName === result.homeTeam.name);
  const awayPlayers = players.filter((player) => player.teamName === result.awayTeam.name);
  const homeScore = getTeamScore(events, result.homeTeam.name, time);
  const awayScore = getTeamScore(events, result.awayTeam.name, time);
  const homeGold = homePlayers.reduce((sum, player) => sum + player.gold, 0);
  const awayGold = awayPlayers.reduce((sum, player) => sum + player.gold, 0);
  return {
    timestampSeconds: time,
    home: {
      gold: homeGold,
      ...homeScore,
      averageLevel: homePlayers.reduce((sum, player) => sum + player.level, 0) / homePlayers.length,
    },
    away: {
      gold: awayGold,
      ...awayScore,
      averageLevel: awayPlayers.reduce((sum, player) => sum + player.level, 0) / awayPlayers.length,
    },
    goldDifference: homeGold - awayGold,
    players,
  };
}

/** 한 교전의 피해량을 기존 선수 한타 능력치·레벨·챔피언 태그로 표시합니다. */
export function deriveCombatDamage(result: MatchResult, event: MatchEvent): CombatDamageSummary | null {
  if (!COMBAT_EVENT_TYPES.includes(event.type)) return null;
  const entries = event.participants.map((participant) => {
    const level = getDisplayLevel(result, participant.teamName, event.timestampSeconds);
    const championMultiplier = participant.champion.role === 'DAMAGE' ? 1.2 : participant.champion.role === 'UTILITY' ? 0.82 : 0.95;
    const rangeMultiplier = participant.champion.range === 'AOE' ? 0.92 : 1;
    const eventMultiplier = event.type === 'TEAMFIGHT' ? 1.35 : event.type === 'GANK' ? 0.95 : 0.72;
    const damage = Math.round((participant.player.teamfight * 9 + level * 22) * championMultiplier * rangeMultiplier * eventMultiplier);
    return {
      key: getMatchPlayerKey(participant.teamName, participant.player),
      teamName: participant.teamName,
      player: participant.player,
      champion: participant.champion,
      damage,
      targetCount: participant.champion.range === 'AOE' ? Math.max(2, event.participants.length) : 1,
    };
  }).sort((left, right) => right.damage - left.damage);
  return { event, entries, totalDamage: entries.reduce((sum, entry) => sum + entry.damage, 0) };
}

/** 시각까지 누적된 선수별 표시 딜량을 계산합니다. */
function getPlayerDamage(result: MatchResult, events: MatchEvent[], teamName: string, player: Player, timestampSeconds: number): number {
  return events
    .filter((event) => event.timestampSeconds <= timestampSeconds)
    .map((event) => deriveCombatDamage(result, event))
    .filter((summary): summary is CombatDamageSummary => Boolean(summary))
    .reduce((sum, summary) => sum + (summary.entries.find((entry) =>
      entry.teamName === teamName && entry.player === player)?.damage ?? 0), 0);
}

/** 두 시점 사이에 새로 구매한 아이템을 중계 알림용으로 반환합니다. */
export function getItemPurchasesBetween(
  before: MatchEconomySnapshot,
  after: MatchEconomySnapshot,
): MatchItemPurchase[] {
  return after.players.flatMap((player) => player.items
    .slice(before.players.find((entry) => entry.key === player.key)?.items.length ?? 0)
    .map((item) => ({
      key: player.key,
      teamName: player.teamName,
      player: player.player,
      champion: player.champion,
      item,
    })));
}

/** 두 시점 사이에 오른 선수의 중계 알림을 반환합니다. */
export function getLevelUpsBetween(
  before: MatchEconomySnapshot,
  after: MatchEconomySnapshot,
): MatchLevelUp[] {
  return after.players
    .filter((player) => player.level > (before.players.find((entry) => entry.key === player.key)?.level ?? player.level))
    .map((player) => ({
      key: player.key,
      teamName: player.teamName,
      player: player.player,
      champion: player.champion,
      level: player.level,
      isLateGrowth: player.champion.timing === 'LATE',
    }));
}

/** 아이템 구매와 레벨업 문장을 한 줄로 만들 때 사용하는 이름입니다. */
export function formatEconomyPlayer(player: { player: Player; champion: Champion }): string {
  return `${formatPlayerName(player.player)} / ${player.champion.name}`;
}