/** 인체 실측 복제값이 아닌 실내 전술 게임용 식별 범위입니다. 후방 시야 예외는 없습니다. */
export const FOCUS_HALF_ANGLE = Math.PI / 3;
export const PERIPHERAL_HALF_ANGLE = Math.PI / 2;
export const FOCUS_RANGE = 2400;
export const PERIPHERAL_RANGE = 600;
export const TURN_SPEED = Math.PI * 4 / 3;

/** ±π 경계를 넘어도 가장 짧은 방향으로 회전하도록 각도 차이를 구합니다. */
export function angleDifference(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
/** 몸·총구·시야가 함께 초당 최대 240도로 회전합니다. */
export function turnTowards(current: number, target: number, seconds: number): number {
  const difference = angleDifference(target, current), limit = TURN_SPEED * seconds;
  return current + Math.max(-limit, Math.min(limit, difference));
}
/** 주변부에서는 가까운 움직임만 확인하고 정면에서는 먼 대상을 식별합니다. */
export function sightRange(relativeAngle: number): number {
  const angle = Math.abs(angleDifference(relativeAngle, 0));
  return angle <= FOCUS_HALF_ANGLE ? FOCUS_RANGE : angle <= PERIPHERAL_HALF_ANGLE ? PERIPHERAL_RANGE : 0;
}
