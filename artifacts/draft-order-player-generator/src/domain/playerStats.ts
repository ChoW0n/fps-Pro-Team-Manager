/**
 * 포지션별 선수 능력치 상수 모듈
 * 각 포지션별 능력치의 평균(mean)과 표준편차(stdDev)를 정의합니다.
 * 모든 수치는 교체 가능한 임시값입니다.
 */

import { Position } from './Player';

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

// 포지션별 5가지 능력치 타입 정의
export interface PositionStats {
  laning: StatDistribution;
  // 파밍 능력치 분포 임시값, 사용자가 지정한 임시값입니다.
  farming: StatDistribution;
  // 시야 능력치 분포 임시값, 사용자가 지정한 임시값입니다.
  vision: StatDistribution;
  teamfight: StatDistribution;
  macro: StatDistribution;
  championPool: StatDistribution;
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

// 포지션별 능력치 임시 데이터 상수
export const PLAYER_STATS_BY_POSITION: Record<Position, PositionStats> = {
  TOP: {
    laning: { mean: 70, stdDev: 10 },
    farming: { mean: 66, stdDev: 10 },
    vision: { mean: 45, stdDev: 12 },
    teamfight: { mean: 65, stdDev: 12 },
    macro: { mean: 60, stdDev: 10 },
    championPool: { mean: 65, stdDev: 15 },
    volatility: { mean: 50, stdDev: 20 },
    // 숙련도 분포 임시값, 튜닝 전 임시값
    mastery: { mean: 65, stdDev: 12 },
    // 공격성 분포 임시값, 성격 튜닝 전 임시값
    aggression: { mean: 56, stdDev: 16 },
    // 숨은 능력치 분포 임시값, 특성 튜닝 전 임시값
    composure: { mean: 55, stdDev: 16 },
    recovery: { mean: 52, stdDev: 15 },
    courage: { mean: 50, stdDev: 18 },
    teamSynergy: { mean: 54, stdDev: 14 },
  },
  JUNGLE: {
    laning: { mean: 55, stdDev: 10 },
    farming: { mean: 70, stdDev: 10 },
    vision: { mean: 68, stdDev: 10 },
    teamfight: { mean: 70, stdDev: 12 },
    macro: { mean: 75, stdDev: 10 },
    championPool: { mean: 60, stdDev: 15 },
    volatility: { mean: 60, stdDev: 15 },
    // 숙련도 분포 임시값, 튜닝 전 임시값
    mastery: { mean: 62, stdDev: 13 },
    // 공격성 분포 임시값, 성격 튜닝 전 임시값
    aggression: { mean: 62, stdDev: 15 },
    // 숨은 능력치 분포 임시값, 특성 튜닝 전 임시값
    composure: { mean: 60, stdDev: 14 },
    recovery: { mean: 56, stdDev: 14 },
    courage: { mean: 55, stdDev: 16 },
    teamSynergy: { mean: 62, stdDev: 13 },
  },
  MID: {
    laning: { mean: 75, stdDev: 10 },
    farming: { mean: 72, stdDev: 10 },
    vision: { mean: 48, stdDev: 12 },
    teamfight: { mean: 75, stdDev: 10 },
    macro: { mean: 65, stdDev: 10 },
    championPool: { mean: 70, stdDev: 10 },
    volatility: { mean: 55, stdDev: 15 },
    // 숙련도 분포 임시값, 튜닝 전 임시값
    mastery: { mean: 68, stdDev: 11 },
    // 공격성 분포 임시값, 성격 튜닝 전 임시값
    aggression: { mean: 60, stdDev: 14 },
    // 숨은 능력치 분포 임시값, 특성 튜닝 전 임시값
    composure: { mean: 57, stdDev: 15 },
    recovery: { mean: 55, stdDev: 15 },
    courage: { mean: 58, stdDev: 16 },
    teamSynergy: { mean: 56, stdDev: 14 },
  },
  ADC: {
    laning: { mean: 65, stdDev: 10 },
    farming: { mean: 78, stdDev: 9 },
    vision: { mean: 42, stdDev: 12 },
    teamfight: { mean: 80, stdDev: 10 },
    macro: { mean: 50, stdDev: 15 },
    championPool: { mean: 55, stdDev: 15 },
    volatility: { mean: 45, stdDev: 20 },
    // 숙련도 분포 임시값, 튜닝 전 임시값
    mastery: { mean: 64, stdDev: 12 },
    // 공격성 분포 임시값, 성격 튜닝 전 임시값
    aggression: { mean: 66, stdDev: 15 },
    // 숨은 능력치 분포 임시값, 특성 튜닝 전 임시값
    composure: { mean: 52, stdDev: 16 },
    recovery: { mean: 50, stdDev: 16 },
    courage: { mean: 57, stdDev: 17 },
    teamSynergy: { mean: 51, stdDev: 15 },
  },
  SUPPORT: {
    laning: { mean: 60, stdDev: 12 },
    farming: { mean: 35, stdDev: 12 },
    vision: { mean: 82, stdDev: 9 },
    teamfight: { mean: 70, stdDev: 12 },
    macro: { mean: 80, stdDev: 10 },
    championPool: { mean: 60, stdDev: 10 },
    volatility: { mean: 40, stdDev: 15 },
    // 숙련도 분포 임시값, 튜닝 전 임시값
    mastery: { mean: 66, stdDev: 10 },
    // 공격성 분포 임시값, 성격 튜닝 전 임시값
    aggression: { mean: 48, stdDev: 14 },
    // 숨은 능력치 분포 임시값, 특성 튜닝 전 임시값
    composure: { mean: 63, stdDev: 13 },
    recovery: { mean: 61, stdDev: 13 },
    courage: { mean: 53, stdDev: 15 },
    teamSynergy: { mean: 67, stdDev: 12 },
  },
};
