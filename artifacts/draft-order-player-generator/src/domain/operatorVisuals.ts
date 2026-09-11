import manifest from '../operators/manifest.json';
import type { TacticalPoint } from './tacticalMaps';

/** 3600×2400 월드에서 몸통 약 24단위, 총구와 충돌 반경이 같은 게임용 비율입니다. */
export const OPERATOR_SCALE = 0.11;
export const TEMPORARY_OPERATOR_SCALE = 0.75;
const VISUAL_KEYS: Record<string, keyof typeof manifest> = {
  MAGPIE: 'magpie', COLLIER: 'collier', 해동: 'haedong',
};

export interface OperatorVisual {
  width:number; height:number; pivot:readonly number[]; muzzle:readonly number[]; sprite:string; portrait?:string;
  region?:readonly number[];
  scale?:number;
  rotationOffset?:number;
}
const FIELD_VISUALS: Record<string,OperatorVisual> = Object.fromEntries([
  ['ARBEL',[20,100,370,250],[165,118],[363,123]],
  ['AUBERT',[432,100,355,250],[163,130],[347,122]],
  ['MEDVED',[840,100,395,270],[180,135],[387,123]],
  ['REUSS',[20,490,398,260],[145,128],[392,110]],
  ['BRANDT',[425,505,455,250],[150,115],[447,109]],
  ['MARCHAND',[895,500,314,253],[130,120],[306,109]],
  ['HALLORAN',[20,885,440,230],[158,100],[433,108]],
  ['성곽',[458,890,343,240],[140,110],[335,108]],
  ['SAVELLI',[837,885,393,257],[170,122],[385,110]],
].map(([name,region,pivot,muzzle])=>[name,{region,pivot,muzzle,width:(region as number[])[2],height:(region as number[])[3],sprite:'field-operators-atlas.webp'}])) as Record<string,OperatorVisual>;

/** 준비된 인물에만 고유 원화를 연결하며 다른 인물로 대체하지 않습니다. */
export function operatorVisual(callSign: string): OperatorVisual | undefined {
  const key = VISUAL_KEYS[callSign];
  return key ? manifest[key] : FIELD_VISUALS[callSign];
}

const COLLIER_DOWNED: OperatorVisual = {
  sprite:'collier-poses-v2.png',region:[910,565,610,405],width:610,height:405,
  pivot:[290,210],muzzle:[590,300],scale:.1,rotationOffset:.45,
};

/** 검수한 다운 자세만 실제 다운 상태에 연결합니다. 다른 인물의 원화로 대체하지 않습니다. */
export function operatorPoseVisual(callSign: string, downed: boolean): OperatorVisual | undefined {
  return callSign==='COLLIER' && downed ? COLLIER_DOWNED : operatorVisual(callSign);
}

/** 이미지의 피벗·총구를 회전시켜 판정과 중계가 같은 발사 원점을 사용합니다. */
export function muzzlePosition(callSign: string, position: TacticalPoint, facing: number): TacticalPoint {
  const visual = operatorVisual(callSign);
  const x = visual ? (visual.muzzle[0] - visual.pivot[0]) * OPERATOR_SCALE : 40 * TEMPORARY_OPERATOR_SCALE;
  const y = visual ? (visual.muzzle[1] - visual.pivot[1]) * OPERATOR_SCALE : 0;
  return { x: position.x + x * Math.cos(facing) - y * Math.sin(facing),
    y: position.y + x * Math.sin(facing) + y * Math.cos(facing) };
}
