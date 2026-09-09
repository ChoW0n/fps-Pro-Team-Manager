/**
 * 전술 FPS 역할별 선수 능력치 분포 모듈입니다.
 * 새 데이터의 중심축은 조준·진입·정보수집·수비설계·클러치입니다.
 */

import type { Position, Role } from './Player';

// 기복 → 표준편차 변환 경계값, 튜닝 대상
export const MIN_VOLATILITY_STD_DEV = 2;

// 기복 → 표준편차 변환 경계값, 튜닝 대상
export const MAX_VOLATILITY_STD_DEV = 18;

// 난이도 페널티 계수, 튜닝 대상
export const DIFFICULTY_PENALTY_COEFFICIENT = 0.05;

// 숨은 능력치는 특성이며 좋고 나쁨이 아닙니다. 아래 보정 폭은 튜닝 대상이고 작게 유지합니다.
export const DEFAULT_MATCH_IMPORTANCE = 0.5;
export const COMPOSURE_DEFICIT_THRESHOLD = 0.12;
export const COMPOSURE_MAX_BONUS = 0.025;
export const RECOVERY_MAX_BONUS = 0.018;
export const COURAGE_MAX_BONUS = 0.015;
export const TEAM_SYNERGY_MAX_BONUS = 0.02;

// 능력치 분포 타입 정의
export interface StatDistribution {
  mean: number;
  stdDev: number;
}

// 역할별 전술 FPS 능력치와 기존 성향 분포 타입을 정의합니다.
export interface RoleStats {
  aim: StatDistribution;
  entry: StatDistribution;
  informationGathering: StatDistribution;
  defensiveSetup: StatDistribution;
  clutch: StatDistribution;
  operatorPool: StatDistribution;
  volatility: StatDistribution;
  mastery: StatDistribution;
  // 공격성은 성능이 아니라 성격을 나타내며, 전력·승패 계산에서 제외합니다.
  aggression: StatDistribution;
  // 숨은 능력치는 화면에 숫자로 공개하지 않고 경기 관찰 문장에만 사용합니다.
  composure: StatDistribution;
  recovery: StatDistribution;
  courage: StatDistribution;
  teamSynergy: StatDistribution;
}

export const PLAYER_STATS_BY_ROLE: Record<Role, RoleStats> = {
  SEARCH: {
    aim: { mean: 70, stdDev: 10 },
    entry: { mean: 64, stdDev: 11 },
    informationGathering: { mean: 86, stdDev: 9 },
    defensiveSetup: { mean: 56, stdDev: 12 },
    clutch: { mean: 68, stdDev: 12 },
    operatorPool: { mean: 60, stdDev: 15 },
    volatility: { mean: 60, stdDev: 15 },
    mastery: { mean: 62, stdDev: 13 },
    aggression: { mean: 62, stdDev: 15 },
    composure: { mean: 60, stdDev: 14 },
    recovery: { mean: 56, stdDev: 14 },
    courage: { mean: 55, stdDev: 16 },
    teamSynergy: { mean: 62, stdDev: 13 },
  },
  ENTRY: {
    aim: { mean: 78, stdDev: 10 },
    entry: { mean: 88, stdDev: 9 },
    informationGathering: { mean: 60, stdDev: 12 },
    defensiveSetup: { mean: 48, stdDev: 12 },
    clutch: { mean: 74, stdDev: 11 },
    operatorPool: { mean: 65, stdDev: 15 },
    volatility: { mean: 50, stdDev: 20 },
    mastery: { mean: 65, stdDev: 12 },
    aggression: { mean: 56, stdDev: 16 },
    composure: { mean: 55, stdDev: 16 },
    recovery: { mean: 52, stdDev: 15 },
    courage: { mean: 50, stdDev: 18 },
    teamSynergy: { mean: 54, stdDev: 14 },
  },
  FIREPOWER: {
    aim: { mean: 88, stdDev: 8 },
    entry: { mean: 70, stdDev: 11 },
    informationGathering: { mean: 62, stdDev: 12 },
    defensiveSetup: { mean: 58, stdDev: 11 },
    clutch: { mean: 76, stdDev: 10 },
    operatorPool: { mean: 55, stdDev: 15 },
    volatility: { mean: 45, stdDev: 20 },
    mastery: { mean: 64, stdDev: 12 },
    aggression: { mean: 66, stdDev: 15 },
    composure: { mean: 52, stdDev: 16 },
    recovery: { mean: 50, stdDev: 16 },
    courage: { mean: 57, stdDev: 17 },
    teamSynergy: { mean: 51, stdDev: 15 },
  },
  DEFENSIVE_SETUP: {
    aim: { mean: 74, stdDev: 10 },
    entry: { mean: 48, stdDev: 12 },
    informationGathering: { mean: 66, stdDev: 11 },
    defensiveSetup: { mean: 88, stdDev: 9 },
    clutch: { mean: 66, stdDev: 12 },
    operatorPool: { mean: 60, stdDev: 10 },
    volatility: { mean: 40, stdDev: 15 },
    mastery: { mean: 66, stdDev: 10 },
    aggression: { mean: 48, stdDev: 14 },
    composure: { mean: 63, stdDev: 13 },
    recovery: { mean: 61, stdDev: 13 },
    courage: { mean: 53, stdDev: 15 },
    teamSynergy: { mean: 67, stdDev: 12 },
  },
  BLOCKING: {
    aim: { mean: 80, stdDev: 10 },
    entry: { mean: 52, stdDev: 12 },
    informationGathering: { mean: 82, stdDev: 10 },
    defensiveSetup: { mean: 74, stdDev: 10 },
    clutch: { mean: 68, stdDev: 11 },
    operatorPool: { mean: 70, stdDev: 10 },
    volatility: { mean: 55, stdDev: 15 },
    mastery: { mean: 68, stdDev: 11 },
    aggression: { mean: 60, stdDev: 14 },
    composure: { mean: 57, stdDev: 15 },
    recovery: { mean: 55, stdDev: 15 },
    courage: { mean: 58, stdDev: 16 },
    teamSynergy: { mean: 56, stdDev: 14 },
  },
};

// 아직 MOBA 표시·검증 코드가 남아 있어 역할을 옛 포지션으로 읽을 때만 사용합니다.
const ROLE_FOR_LEGACY_POSITION: Record<Position, Role> = {
  TOP: 'ENTRY',
  JUNGLE: 'SEARCH',
  MID: 'BLOCKING',
  ADC: 'FIREPOWER',
  SUPPORT: 'DEFENSIVE_SETUP',
};

// 기존 도메인 모듈이 컴파일되는 동안에만 옛 포지션 조회를 새 분포에서 파생합니다.
export const PLAYER_STATS_BY_POSITION: Record<Position, RoleStats> = Object.fromEntries(
  Object.entries(ROLE_FOR_LEGACY_POSITION).map(([position, role]) => [
    position,
    PLAYER_STATS_BY_ROLE[role],
  ]),
) as Record<Position, RoleStats>;
