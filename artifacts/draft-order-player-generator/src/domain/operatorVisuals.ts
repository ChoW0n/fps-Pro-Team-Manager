import manifest from '../../public/operators/manifest.json';
import type { TacticalPoint } from './tacticalMaps';

export const OPERATOR_SCALE = 0.145;
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
  const x = visual ? (visual.muzzle[0] - visual.pivot[0]) * OPERATOR_SCALE : 40;
  const y = visual ? (visual.muzzle[1] - visual.pivot[1]) * OPERATOR_SCALE : 0;
  return { x: position.x + x * Math.cos(facing) - y * Math.sin(facing),
    y: position.y + x * Math.sin(facing) + y * Math.cos(facing) };
}
