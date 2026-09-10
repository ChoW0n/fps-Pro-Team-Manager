/**
 * 공용 난수 유틸리티 모듈
 * 정규분포 난수 생성과 0~100 범위 제한을 한곳에서 담당합니다.
 */

/**
 * Box-Muller 변환으로 정규분포 난수를 생성합니다.
 */
export function generateNormalRandom(mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev;
}

/**
 * 숫자를 0~100 범위로 제한합니다.
 */
export function clampToStatRange(value: number): number {
  return Math.max(0, Math.min(100, value));
}