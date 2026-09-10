/**
 * 레벨 성장 계산 모듈입니다.
 * 레벨 성장 계수는 챔피언 태그에서 자동 결정되며 챔피언별 수동 입력 금지입니다.
 * 밴픽에서 후반형을 많이 뽑은 팀이 실제 후반에 강해지도록 밴픽 결과를 경기 중 펼쳐 보이는 장치이고 밴픽을 대체하지 않습니다.
 * 아이템/자원은 다루지 않습니다.
 */

import { Champion } from './Champion';
import {
  AHEAD_TEAM_LEVEL_ACCELERATION,
  AHEAD_TEAM_LEVEL_ACCELERATION_HARD_CAP,
  EARLY_BASE_AT_LEVEL_ONE,
  EARLY_LEVEL_RANGE,
  EARLY_PER_LEVEL_GROWTH,
  LATE_BASE_AT_LEVEL_ONE,
  LATE_LEVEL_RANGE,
  LATE_PER_LEVEL_GROWTH,
  MASTERY_GROWTH_MAX_MULTIPLIER,
  MASTERY_GROWTH_MIN_MULTIPLIER,
  MID_LEVEL_RANGE,
} from './compositionStats';
import { Player } from './Player';
import { DIFFICULTY_PENALTY_COEFFICIENT } from './playerStats';
import type { PhaseResult } from './MatchResult';

// 태그 기반 성장 프로필 타입입니다.
export interface LevelGrowthProfile {
  baseAtLevelOne: number;
  perLevelGrowth: number;
}

// 구간별 레벨 범위 타입입니다.
type LevelRange = { min: number; max: number; baseline: number };

/** 챔피언의 시점 태그만으로 성장 프로필을 반환합니다. */
export function getLevelGrowthProfile(champion: Champion): LevelGrowthProfile {
  return champion.timing === 'EARLY'
    ? { baseAtLevelOne: EARLY_BASE_AT_LEVEL_ONE, perLevelGrowth: EARLY_PER_LEVEL_GROWTH }
    : { baseAtLevelOne: LATE_BASE_AT_LEVEL_ONE, perLevelGrowth: LATE_PER_LEVEL_GROWTH };
}

/** 숙련도와 챔피언 난이도만으로 난이도 페널티 배율을 계산합니다. */
export function calculateDifficultyMultiplier(player: Player, champion: Champion): number {
  const masteryGrade = Math.max(0, Math.min(100, player.mastery)) / 20;
  const difficultyGap = Math.max(0, champion.difficulty - masteryGrade);
  // 기존 난이도 페널티 계수는 이 단일 계산 지점에서만 사용합니다.
  return 1 - difficultyGap * DIFFICULTY_PENALTY_COEFFICIENT;
}

/** 레벨과 숙련도로 선수 한 명의 성장 전력 배율을 계산합니다. */
export function calculatePlayerLevelPowerMultiplier(
  player: Player,
  champion: Champion,
  level: number,
): number {
  const clampedLevel = Math.max(1, Math.min(18, level));
  const profile = getLevelGrowthProfile(champion);
  const masteryRatio = Math.max(0, Math.min(100, player.mastery)) / 100;
  const masteryMultiplier = MASTERY_GROWTH_MIN_MULTIPLIER
    + (MASTERY_GROWTH_MAX_MULTIPLIER - MASTERY_GROWTH_MIN_MULTIPLIER) * masteryRatio;
  return profile.baseAtLevelOne + (clampedLevel - 1) * profile.perLevelGrowth * masteryMultiplier;
}

/** 이전 구간 승수를 반영해 양 팀의 해당 구간 평균 레벨을 결정합니다. */
export function calculatePhaseTeamLevels(
  phase: PhaseResult['phase'],
  homePreviousWins: number,
  awayPreviousWins: number,
): { homeLevel: number; awayLevel: number } {
  const range: LevelRange = phase === 'EARLY'
    ? EARLY_LEVEL_RANGE
    : phase === 'MID' ? MID_LEVEL_RANGE : LATE_LEVEL_RANGE;
  const advantage = Math.min(
    AHEAD_TEAM_LEVEL_ACCELERATION_HARD_CAP,
    Math.abs(homePreviousWins - awayPreviousWins) * AHEAD_TEAM_LEVEL_ACCELERATION,
  );
  const homeLevel = homePreviousWins === awayPreviousWins
    ? range.baseline
    : range.baseline + (homePreviousWins > awayPreviousWins ? advantage : 0);
  const awayLevel = homePreviousWins === awayPreviousWins
    ? range.baseline
    : range.baseline + (awayPreviousWins > homePreviousWins ? advantage : 0);
  return {
    homeLevel: Math.max(range.min, Math.min(range.max, homeLevel)),
    awayLevel: Math.max(range.min, Math.min(range.max, awayLevel)),
  };
}