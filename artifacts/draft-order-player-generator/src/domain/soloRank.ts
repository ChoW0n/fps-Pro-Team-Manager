/**
 * 솔로랭크는 대회 경기와 별도의 공개 기록입니다.
 * 솔로랭크는 라인전·파밍을 대신하는 라인전 기반값, 숙련도, 챔피언 폭, 공격성을 크게 보고,
 * 한타·운영·시야와 숨은 능력치·팀 궁합은 거의 반영하지 않습니다.
 * 따라서 솔로랭크 순위가 높아도 대회에서 강하다는 뜻은 아니며, 이 모듈은 대회 승패를 직접 바꾸지 않습니다.
 */

import { CHAMPIONS, Champion } from './Champion';
import { Player } from './Player';

export type SoloRankTier = '챌린저' | '그랜드마스터' | '마스터' | '다이아몬드' | '에메랄드';

export interface SoloRankChampionRecord {
  champion: Champion;
  games: number;
  wins: number;
  averageKda: number;
  csPerMinute: number;
  soloValue: number;
  tournamentValue: number;
}

export interface RecentSoloRankGame {
  champion: Champion;
  won: boolean;
  kda: number;
  csPerMinute: number;
  playedAt: number;
}

export interface SoloRankRecord {
  tier: SoloRankTier;
  points: number;
  ladderRank: number;
  championRecords: SoloRankChampionRecord[];
  recentGames: RecentSoloRankGame[];
  practicingChampion: Champion;
}

/** 태그에서 혼자 캐리하기 좋은 정도를 계산합니다. 챔피언별 수동값은 두지 않습니다. */
export function getSoloRankChampionValue(champion: Champion): number {
  const roleBonus = champion.role === 'DAMAGE' ? 14 : champion.role === 'TANK' ? 5 : 1;
  const engagementBonus = champion.engagement === 'DIVE' ? 13 : 5;
  const rangeBonus = champion.range === 'SINGLE' ? 7 : 3;
  const timingBonus = champion.timing === 'EARLY' ? 7 : 4;
  return clamp(35 + roleBonus + engagementBonus + rangeBonus + timingBonus, 0, 100);
}

/** 태그에서 팀 조합과 함께 강해지는 정도를 계산합니다. */
export function getTournamentChampionValue(champion: Champion): number {
  const roleBonus = champion.role === 'UTILITY' ? 16 : champion.role === 'TANK' ? 13 : 5;
  const rangeBonus = champion.range === 'AOE' ? 13 : 5;
  const engagementBonus = champion.engagement === 'POKE' ? 10 : 6;
  const timingBonus = champion.timing === 'LATE' ? 8 : 5;
  return clamp(35 + roleBonus + rangeBonus + engagementBonus + timingBonus, 0, 100);
}

/** 생성된 선수에게 경기 전까지 누적된 솔로랭크 기록을 붙입니다. */
export function createSoloRankRecord(player: Player): SoloRankRecord {
  const expandedChampions = getExpandedChampionPool(player);
  player.championPool = expandedChampions;
  const championRecords = expandedChampions.map((champion, index) =>
    createChampionRecord(player, champion, index));
  const recentGames = createRecentGames(player, championRecords);
  const soloRating = calculateSoloRating(player, championRecords);
  return {
    tier: getTier(soloRating),
    points: Math.round(100 + (soloRating % 900)),
    ladderRank: Math.max(1, Math.round(5200 - soloRating * 42 + stableSeed(player.nickname) % 180)),
    championRecords,
    recentGames,
    practicingChampion: recentGames[0]?.champion ?? expandedChampions[0],
  };
}

/** 챔피언 폭 능력치에 따라 솔로랭크에서 새로 연습한 챔피언을 소수 추가합니다. */
function getExpandedChampionPool(player: Player): Champion[] {
  const current = [...player.championPool];
  const extraCount = Math.max(1, Math.min(3, Math.round(player.championPool.length / 2)));
  const extras = CHAMPIONS
    .filter((champion) => !current.includes(champion))
    .sort((left, right) =>
      (getSoloRankChampionValue(right) + stableSeed(`${player.nickname}:${right.name}`) % 9)
      - (getSoloRankChampionValue(left) + stableSeed(`${player.nickname}:${left.name}`) % 9),
    )
    .slice(0, extraCount);
  return [...current, ...extras];
}

/** 선수와 챔피언의 기존 능력치에서 챔피언별 솔로랭크 전적을 파생합니다. */
function createChampionRecord(player: Player, champion: Champion, index: number): SoloRankChampionRecord {
  const soloValue = getSoloRankChampionValue(champion);
  const tournamentValue = getTournamentChampionValue(champion);
  const games = 8 + stableSeed(`${player.nickname}:${champion.name}`) % 25 + index;
  const winRate = clamp(
    0.42
      + (player.laning - 50) / 500
      + (player.mastery - 50) / 700
      + (player.aggression - 50) / 950
      + (soloValue - 50) / 900,
    0.32,
    0.72,
  );
  return {
    champion,
    games,
    wins: Math.round(games * winRate),
    averageKda: Number((1.25 + player.mastery / 42 + (soloValue - 50) / 35).toFixed(2)),
    csPerMinute: Number(Math.max(3.5, 5.2 + player.laning / 24 + (player.mastery - 50) / 40).toFixed(1)),
    soloValue,
    tournamentValue,
  };
}

/** 최근 경기 기록을 만들어 어떤 챔피언을 반복 연습했는지 보여 줍니다. */
function createRecentGames(player: Player, records: SoloRankChampionRecord[]): RecentSoloRankGame[] {
  const ordered = [...records].sort((left, right) => {
    const leftSeed = stableSeed(`${player.nickname}:recent:${left.champion.name}`);
    const rightSeed = stableSeed(`${player.nickname}:recent:${right.champion.name}`);
    return right.games + rightSeed % 12 - (left.games + leftSeed % 12);
  });
  return Array.from({ length: 8 }, (_, index) => {
    const record = ordered[index % Math.min(3, ordered.length)];
    const won = (stableSeed(`${player.nickname}:game:${index}`) + record.wins) % 3 !== 0;
    return {
      champion: record.champion,
      won,
      kda: Number((record.averageKda + ((index % 3) - 1) * 0.22).toFixed(2)),
      csPerMinute: record.csPerMinute,
      playedAt: index + 1,
    };
  });
}

/** 솔로랭크 성적에만 사용하는 공개 래더 점수를 계산합니다. */
function calculateSoloRating(player: Player, records: SoloRankChampionRecord[]): number {
  const championAverage = records.reduce((sum, record) => sum + record.soloValue, 0) / Math.max(1, records.length);
  return clamp(
    player.laning * 1.4
      + player.mastery * 1.15
      + player.aggression * 0.72
      + player.championPool.length * 5
      + championAverage * 0.7
      + player.teamfight * 0.16
      + player.macro * 0.12,
    100,
    500,
  );
}

/** 래더 점수 구간을 티어로 바꿉니다. */
function getTier(rating: number): SoloRankTier {
  if (rating >= 420) return '챌린저';
  if (rating >= 350) return '그랜드마스터';
  if (rating >= 280) return '마스터';
  if (rating >= 210) return '다이아몬드';
  return '에메랄드';
}

/** 닉네임 기반의 안정적인 작은 변동값을 만듭니다. */
function stableSeed(value: string): number {
  return [...value].reduce((sum, character, index) =>
    (sum + character.charCodeAt(0) * (index + 17)) % 9973, 0);
}

/** 값이 화면과 기록의 허용 범위를 벗어나지 않게 합니다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}