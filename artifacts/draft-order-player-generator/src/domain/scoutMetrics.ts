/**
 * 감독 화면용 지표는 이미 생성된 선수 능력치, MatchResult, MatchEvent, 표시용 자원에서 파생합니다.
 * 이 파일은 경기 승패·구간 전력·보정값을 다시 계산하지 않으며 두 번째 시뮬레이션을 만들지 않습니다.
 * CS·골드·딜량·시야는 계산된 결과가 어떤 흐름으로 나타났는지 설명하는 분석용 숫자입니다.
 */

import { Champion } from './Champion';
import { MatchResult } from './MatchResult';
import { MatchEvent } from './matchEvents';
import {
  MatchEconomySnapshot,
  MATCH_DISPLAY_DURATION_SECONDS,
  deriveMatchEconomySnapshot,
  getMatchPlayerKey,
} from './matchEconomy';
import { PLAYER_STATS_BY_POSITION } from './playerStats';
import { Player, Position } from './Player';
import { Team } from './Team';

export type ScoutMetricKey = 'gpm' | 'dpm' | 'csPerMinute' | 'kda' | 'damageShare' | 'goldShare' | 'visionPerMinute';

export interface ScoutMetric {
  value: number;
  low: number;
  high: number;
  leagueAverage: number;
}

export interface ScoutPlayerReport {
  key: string;
  teamName: string;
  player: Player;
  champion?: Champion;
  metrics: Record<ScoutMetricKey, ScoutMetric>;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  totalVision: number;
  totalGold: number;
  totalDamage: number;
  strongChampions: Champion[];
  developingChampions: Champion[];
}

export interface ScoutTeamReport {
  teamName: string;
  players: ScoutPlayerReport[];
  goldAt15: number;
  csAt15: number;
}

export interface ScoutMatchReport {
  players: ScoutPlayerReport[];
  home: ScoutTeamReport;
  away: ScoutTeamReport;
  goldGapAt15: number;
  csGapAt15: number;
}

export interface ScoutTrendPoint {
  timestampSeconds: number;
  goldGap: number;
  levelGap: number;
}

export const SCOUT_METRIC_LABELS: Record<ScoutMetricKey, string> = {
  gpm: 'GPM',
  dpm: 'DPM',
  csPerMinute: 'CS / MIN',
  kda: 'KDA',
  damageShare: '딜 지분',
  goldShare: '골드 지분',
  visionPerMinute: '시야 / MIN',
};

const COMBAT_TYPES: MatchEvent['type'][] = ['KILL', 'GANK', 'TEAMFIGHT'];
const POSITION_GPM_BONUS: Record<Position, number> = {
  TOP: 0,
  JUNGLE: -22,
  MID: 18,
  ADC: 32,
  SUPPORT: -55,
};
const POSITION_CS_BONUS: Record<Position, number> = {
  TOP: 0.2,
  JUNGLE: -1.4,
  MID: 0.25,
  ADC: 0.55,
  SUPPORT: -3.2,
};
const POSITION_VISION_BONUS: Record<Position, number> = {
  TOP: 0.08,
  JUNGLE: 0.42,
  MID: 0.12,
  ADC: 0.02,
  SUPPORT: 0.7,
};

/** 준비 화면에서 사용할 능력치 기반 예상 지표입니다. 실제 경기 승패를 계산하지 않습니다. */
export function derivePreMatchScoutReport(team: Team): ScoutPlayerReport[] {
  return team.players.map((player) => {
    const estimates = getBaseEstimates(player);
    return buildScoutPlayerReport({
      key: getMatchPlayerKey(team.name, player),
      teamName: team.name,
      player,
      metrics: {
        gpm: estimates.gpm,
        dpm: estimates.dpm,
        csPerMinute: estimates.csPerMinute,
        kda: 2.2 + player.teamfight / 100,
        damageShare: 20 + (player.teamfight - 60) * 0.08,
        goldShare: 20 + (player.laning - 60) * 0.05,
        visionPerMinute: estimates.visionPerMinute,
      },
      kills: 0,
      deaths: 0,
      assists: 0,
      totalCs: 0,
      totalVision: 0,
      totalGold: 0,
      totalDamage: 0,
      champion: undefined,
    });
  });
}

/** 경기 종료 시점의 열 명 지표와 15분 팀 격차를 만듭니다. */
export function deriveScoutMatchReport(
  result: MatchResult,
  events: MatchEvent[],
  economy: MatchEconomySnapshot = deriveMatchEconomySnapshot(
    result,
    events,
    MATCH_DISPLAY_DURATION_SECONDS,
  ),
): ScoutMatchReport {
  const at15 = deriveMatchEconomySnapshot(result, events, 900);
  const players = economy.players.map((economyPlayer) => {
    const csPerMinute = getMatchCsPerMinute(result, economyPlayer.teamName, economyPlayer.player);
    const totalCs = Math.round(csPerMinute * (economy.timestampSeconds / 60));
    const totalVision = Math.round(getMatchVisionPerMinute(economyPlayer.player) * (economy.timestampSeconds / 60));
    const kda = getKda(result, events, economyPlayer.teamName, economyPlayer.player);
    const teamPlayers = economy.players.filter((player) => player.teamName === economyPlayer.teamName);
    const teamDamage = Math.max(1, teamPlayers.reduce((sum, player) => sum + player.damage, 0));
    const teamGold = Math.max(1, teamPlayers.reduce((sum, player) => sum + player.gold, 0));
    const estimates: Record<ScoutMetricKey, number> = {
      gpm: economyPlayer.gold / Math.max(1, economy.timestampSeconds / 60),
      dpm: economyPlayer.damage / Math.max(1, economy.timestampSeconds / 60),
      csPerMinute,
      kda: kda.kda,
      damageShare: economyPlayer.damage / teamDamage * 100,
      goldShare: economyPlayer.gold / teamGold * 100,
      visionPerMinute: getMatchVisionPerMinute(economyPlayer.player),
    };
    return buildScoutPlayerReport({
      key: economyPlayer.key,
      teamName: economyPlayer.teamName,
      player: economyPlayer.player,
      champion: economyPlayer.champion,
      metrics: estimates,
      kills: kda.kills,
      deaths: kda.deaths,
      assists: kda.assists,
      totalCs,
      totalVision,
      totalGold: economyPlayer.gold,
      totalDamage: economyPlayer.damage,
    });
  });
  const homePlayers = players.filter((player) => player.teamName === result.homeTeam.name);
  const awayPlayers = players.filter((player) => player.teamName === result.awayTeam.name);
  const homeCsAt15 = homePlayers.reduce((sum, player) =>
    sum + Math.round(getMatchCsPerMinute(result, result.homeTeam.name, player.player) * 15), 0);
  const awayCsAt15 = awayPlayers.reduce((sum, player) =>
    sum + Math.round(getMatchCsPerMinute(result, result.awayTeam.name, player.player) * 15), 0);
  return {
    players,
    home: {
      teamName: result.homeTeam.name,
      players: homePlayers,
      goldAt15: at15.home.gold,
      csAt15: homeCsAt15,
    },
    away: {
      teamName: result.awayTeam.name,
      players: awayPlayers,
      goldAt15: at15.away.gold,
      csAt15: awayCsAt15,
    },
    goldGapAt15: at15.home.gold - at15.away.gold,
    csGapAt15: homeCsAt15 - awayCsAt15,
  };
}

/** 경기 중 그래프에 사용할 시간축 데이터를 만듭니다. */
export function deriveScoutTrend(
  result: MatchResult,
  events: MatchEvent[],
  sampleCount = 15,
): ScoutTrendPoint[] {
  return Array.from({ length: sampleCount }, (_, index) => {
    const timestampSeconds = Math.round(
      MATCH_DISPLAY_DURATION_SECONDS * index / (sampleCount - 1),
    );
    const snapshot = deriveMatchEconomySnapshot(result, events, timestampSeconds);
    return {
      timestampSeconds,
      goldGap: snapshot.home.gold - snapshot.away.gold,
      levelGap: snapshot.home.averageLevel - snapshot.away.averageLevel,
    };
  });
}

/** 선수별 지표 그래프에 표시할 리그 평균을 기존 포지션 분포에서 만듭니다. */
export function getLeagueAverage(metric: ScoutMetricKey, position: Position): number {
  const distribution = PLAYER_STATS_BY_POSITION[position];
  const laning = distribution.laning.mean;
  const teamfight = distribution.teamfight.mean;
  const macro = distribution.macro.mean;
  if (metric === 'gpm') return 220 + laning * 1.15 + macro * 0.45 + POSITION_GPM_BONUS[position];
  if (metric === 'dpm') return 120 + teamfight * 5.2 + macro * 0.3;
  if (metric === 'csPerMinute') return Math.max(2, 5.8 + laning * 0.025 + macro * 0.008 + POSITION_CS_BONUS[position]);
  if (metric === 'kda') return 2.6 + teamfight / 100;
  if (metric === 'damageShare') return position === 'ADC' || position === 'MID' ? 23 : 18;
  if (metric === 'goldShare') return position === 'ADC' ? 24 : position === 'SUPPORT' ? 12 : 21;
  return 0.6 + macro * 0.009 + POSITION_VISION_BONUS[position];
}

/** 선수의 챔피언 폭을 숙련 챔피언과 도전 챔피언으로 나눕니다. */
function splitChampionPool(player: Player): { strongChampions: Champion[]; developingChampions: Champion[] } {
  const ranked = [...player.championPool].sort((left, right) =>
    getChampionComfort(player, right) - getChampionComfort(player, left));
  const strongCount = Math.max(1, Math.ceil(ranked.length / 2));
  return {
    strongChampions: ranked.slice(0, strongCount),
    developingChampions: ranked.slice(strongCount),
  };
}

/** 숙련도와 챔피언 난이도 차이로 챔피언 숙련도를 표시합니다. */
function getChampionComfort(player: Player, champion: Champion): number {
  return player.mastery - champion.difficulty * 12;
}

/** 기복이 클수록 같은 평균에서도 넓은 예상 범위를 보여 줍니다. */
function addVolatilityRange(player: Player, key: ScoutMetricKey, value: number): ScoutMetric {
  const volatilityWidth = 0.08 + player.volatility / 100 * 0.34;
  return {
    value,
    low: Math.max(0, value * (1 - volatilityWidth)),
    high: value * (1 + volatilityWidth),
    leagueAverage: getLeagueAverage(key, player.position),
  };
}

/** 내부 계산값을 화면에서 사용할 선수 리포트로 묶습니다. */
function buildScoutPlayerReport(input: {
  key: string;
  teamName: string;
  player: Player;
  champion?: Champion;
  metrics: Record<ScoutMetricKey, number>;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  totalVision: number;
  totalGold: number;
  totalDamage: number;
}): ScoutPlayerReport {
  const metrics = Object.fromEntries(
    (Object.keys(input.metrics) as ScoutMetricKey[]).map((key) => [
      key,
      addVolatilityRange(input.player, key, input.metrics[key]),
    ]),
  ) as Record<ScoutMetricKey, ScoutMetric>;
  const pool = splitChampionPool(input.player);
  return { ...input, metrics, ...pool };
}

/** 기존 선수 능력치에서 경기 전 예상 지표를 계산합니다. */
function getBaseEstimates(player: Player) {
  return {
    gpm: 220 + player.laning * 1.15 + player.macro * 0.45 + POSITION_GPM_BONUS[player.position],
    dpm: 120 + player.teamfight * 5.2 + player.macro * 0.3,
    csPerMinute: Math.max(2, 5.8 + player.laning * 0.025 + player.macro * 0.008 + POSITION_CS_BONUS[player.position]),
    visionPerMinute: 0.6 + player.macro * 0.009 + POSITION_VISION_BONUS[player.position],
  };
}

/** 경기 구간 전력 우세를 CS 격차의 설명값으로만 반영합니다. */
function getMatchCsPerMinute(result: MatchResult, teamName: string, player: Player): number {
  const base = getBaseEstimates(player).csPerMinute;
  const advantage = result.phases.reduce((sum, phase) => {
    const homePower = phase.homePower;
    const awayPower = phase.awayPower;
    const total = Math.max(1, homePower + awayPower);
    const teamShare = teamName === result.homeTeam.name ? homePower / total : awayPower / total;
    return sum + (teamShare - 0.5) * 0.42;
  }, 0) / result.phases.length;
  return Math.max(2, Math.min(11, base + advantage));
}

/** 시야 점수는 새 전투 계산 없이 기존 운영 능력치와 포지션에서 파생합니다. */
function getMatchVisionPerMinute(player: Player): number {
  return getBaseEstimates(player).visionPerMinute;
}

/** 현재 이벤트의 참가·주도자를 KDA 표시값으로 변환합니다. */
function getKda(result: MatchResult, events: MatchEvent[], teamName: string, player: Player) {
  let kills = 0;
  let assists = 0;
  events.filter((event) => event.timestampSeconds <= MATCH_DISPLAY_DURATION_SECONDS).forEach((event) => {
    if (!COMBAT_TYPES.includes(event.type)) return;
    const participantIndex = event.participants.findIndex((participant) =>
      participant.teamName === teamName && participant.player === player);
    if (participantIndex < 0) return;
    if (participantIndex === 0) kills += event.type === 'TEAMFIGHT'
      ? Math.max(1, event.participants.length - 1)
      : 1;
    else assists += 1;
  });
  const teamPlayers = teamName === result.homeTeam.name ? result.homeTeam.players : result.awayTeam.players;
  const opponentName = teamName === result.homeTeam.name ? result.awayTeam.name : result.homeTeam.name;
  const opponentKills = events.filter((event) =>
    COMBAT_TYPES.includes(event.type) && event.participants[0]?.teamName === opponentName)
    .reduce((sum, event) => sum + (event.type === 'TEAMFIGHT' ? Math.max(1, event.participants.length - 1) : 1), 0);
  const deathWeight = 1 + (100 - player.teamfight) / 100 + (100 - player.laning) / 200;
  const teamDeathWeight = teamPlayers.reduce((sum, teammate) =>
    sum + 1 + (100 - teammate.teamfight) / 100 + (100 - teammate.laning) / 200, 0);
  const deaths = Math.max(0, Math.round(opponentKills * deathWeight / Math.max(1, teamDeathWeight)));
  return { kills, deaths, assists, kda: (kills + assists) / Math.max(1, deaths) };
}