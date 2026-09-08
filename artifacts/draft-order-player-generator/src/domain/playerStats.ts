/**
 * 포지션별 선수 능력치 상수 모듈
 * 각 포지션별 5가지 능력치의 평균(mean)과 표준편차(stdDev)를 정의합니다.
 * 모든 수치는 교체 가능한 임시값입니다.
 */

import { Position } from './Player';

// 능력치 분포 타입 정의
export interface StatDistribution {
  mean: number;
  stdDev: number;
}

// 포지션별 5가지 능력치 타입 정의
export interface PositionStats {
  laning: StatDistribution;
  teamfight: StatDistribution;
  macro: StatDistribution;
  championPool: StatDistribution;
  volatility: StatDistribution;
}

// 포지션별 능력치 임시 데이터 상수
export const PLAYER_STATS_BY_POSITION: Record<Position, PositionStats> = {
  TOP: {
    laning: { mean: 70, stdDev: 10 },
    teamfight: { mean: 65, stdDev: 12 },
    macro: { mean: 60, stdDev: 10 },
    championPool: { mean: 65, stdDev: 15 },
    volatility: { mean: 50, stdDev: 20 },
  },
  JUNGLE: {
    laning: { mean: 55, stdDev: 10 },
    teamfight: { mean: 70, stdDev: 12 },
    macro: { mean: 75, stdDev: 10 },
    championPool: { mean: 60, stdDev: 15 },
    volatility: { mean: 60, stdDev: 15 },
  },
  MID: {
    laning: { mean: 75, stdDev: 10 },
    teamfight: { mean: 75, stdDev: 10 },
    macro: { mean: 65, stdDev: 10 },
    championPool: { mean: 70, stdDev: 10 },
    volatility: { mean: 55, stdDev: 15 },
  },
  ADC: {
    laning: { mean: 65, stdDev: 10 },
    teamfight: { mean: 80, stdDev: 10 },
    macro: { mean: 50, stdDev: 15 },
    championPool: { mean: 55, stdDev: 15 },
    volatility: { mean: 45, stdDev: 20 },
  },
  SUPPORT: {
    laning: { mean: 60, stdDev: 12 },
    teamfight: { mean: 70, stdDev: 12 },
    macro: { mean: 80, stdDev: 10 },
    championPool: { mean: 60, stdDev: 10 },
    volatility: { mean: 40, stdDev: 15 },
  },
};
