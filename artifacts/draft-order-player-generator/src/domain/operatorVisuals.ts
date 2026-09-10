import manifest from '../../public/operators/manifest.json';
import type { TacticalPoint } from './tacticalMaps';

/** 3600×2400 월드에서 몸통 약 24단위, 총구와 충돌 반경이 같은 게임용 비율입니다. */
export const OPERATOR_SCALE = 0.11;
export const TEMPORARY_OPERATOR_SCALE = 0.75;
const VISUAL_KEYS: Record<string, keyof typeof manifest> = {
  MAGPIE: 'magpie', COLLIER: 'collier', 해동: 'haedong',
};

/** 준비된 인물에만 고유 원화를 연결하며 다른 인물로 대체하지 않습니다. */
export function operatorVisual(callSign: string) {
  const key = VISUAL_KEYS[callSign];
  return key ? manifest[key] : undefined;
}

/** 이미지의 피벗·총구를 회전시켜 판정과 중계가 같은 발사 원점을 사용합니다. */
export function muzzlePosition(callSign: string, position: TacticalPoint, facing: number): TacticalPoint {
  const visual = operatorVisual(callSign);
  const x = visual ? (visual.muzzle[0] - visual.pivot[0]) * OPERATOR_SCALE : 40 * TEMPORARY_OPERATOR_SCALE;
  const y = visual ? (visual.muzzle[1] - visual.pivot[1]) * OPERATOR_SCALE : 0;
  return { x: position.x + x * Math.cos(facing) - y * Math.sin(facing),
    y: position.y + x * Math.sin(facing) + y * Math.cos(facing) };
}
