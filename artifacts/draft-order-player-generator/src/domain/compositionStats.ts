/**
 * 조합 보정 상수 모듈
 * 경기 구간별 조합 태그 보정에 쓰이는 임시 계수를 한곳에 둡니다.
 */

// 조합 보정 계수, 튜닝 대상: legacy 직접 시점 보정 값이며 태그 기반 레벨 성장으로 대체되어 값은 보존만 합니다.
export const EARLY_TIMING_BONUS = 0.04;
// 조합 보정 계수, 튜닝 대상: legacy 직접 시점 보정 값이며 태그 기반 레벨 성장으로 대체되어 값은 보존만 합니다.
export const LATE_TIMING_BONUS = 0.04;
// 조합 보정 계수, 튜닝 대상
export const LATE_AOE_BONUS = 0.025;
// 조합 보정 계수, 튜닝 대상
export const DIVE_VS_POKE_BONUS = 0.02;
// 조합 보정 계수, 튜닝 대상
export const NO_TANK_PENALTY = 0.06;

// 레벨 성장 계수, 튜닝 대상: 초반형 레벨 1 기본 전력 계수
export const EARLY_BASE_AT_LEVEL_ONE = 1.05;
// 레벨 성장 계수, 튜닝 대상: 후반형 레벨 1 기본 전력 계수
export const LATE_BASE_AT_LEVEL_ONE = 0.95;
// 레벨 성장 계수, 튜닝 대상: 초반형 레벨당 성장률
export const EARLY_PER_LEVEL_GROWTH = 0.008;
// 레벨 성장 계수, 튜닝 대상: 후반형 레벨당 성장률
export const LATE_PER_LEVEL_GROWTH = 0.016;
// 레벨 성장 계수, 튜닝 대상: 숙련도가 레벨당 성장 이득에 주는 최소 배율
export const MASTERY_GROWTH_MIN_MULTIPLIER = 0.75;
// 레벨 성장 계수, 튜닝 대상: 숙련도가 레벨당 성장 이득에 주는 최대 배율
export const MASTERY_GROWTH_MAX_MULTIPLIER = 1.25;
// 레벨 성장 계수, 튜닝 대상: 초반 구간 레벨 범위와 기준 레벨
export const EARLY_LEVEL_RANGE = { min: 1, max: 6, baseline: 4 };
// 레벨 성장 계수, 튜닝 대상: 중반 구간 레벨 범위와 기준 레벨
export const MID_LEVEL_RANGE = { min: 7, max: 12, baseline: 9 };
// 레벨 성장 계수, 튜닝 대상: 후반 구간 레벨 범위와 기준 레벨
export const LATE_LEVEL_RANGE = { min: 13, max: 18, baseline: 15 };
// 레벨 성장 계수, 튜닝 대상: 이전 구간 우세 팀의 레벨 가속량
export const AHEAD_TEAM_LEVEL_ACCELERATION = 0.5;
// 레벨 성장 계수, 튜닝 대상: 한 팀 폭주 방지용 구간별 최대 가속 상한
export const AHEAD_TEAM_LEVEL_ACCELERATION_HARD_CAP = 1;