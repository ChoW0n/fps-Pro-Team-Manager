import type { WeaponAssetLoader } from './weaponParts';

/** 장비 표시 좌표만 정의합니다. 방어 범위·충돌 판정과 무관합니다. */
export const HANDHELD_SHIELD={file:'effects/handheld-shield-v2.png',grip:{x:41,y:348},span:1145,height:36,hand:{x:10,y:-20}} as const;

export function paintHandheldShield(ctx:CanvasRenderingContext2D,asset:WeaponAssetLoader):boolean {
  const part=HANDHELD_SHIELD,image=asset(part.file);
  if(!image?.complete||!image.naturalWidth)return false;
  const scale=part.height/part.span;
  ctx.drawImage(image,part.hand.x-part.grip.x*scale,part.hand.y-part.grip.y*scale,image.naturalWidth*scale,image.naturalHeight*scale);
  return true;
}

/** 설치물도 등비 축소합니다. 가로 설치의 회전은 호출자가 담당합니다. */
export function paintDeployedShield(ctx:CanvasRenderingContext2D,asset:WeaponAssetLoader,width:number,height:number):boolean {
  const image=asset('effects/deployed-shield-v2.png');
  if(!image?.complete||!image.naturalWidth)return false;
  const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);
  ctx.drawImage(image,-image.naturalWidth*scale/2,-image.naturalHeight*scale/2,image.naturalWidth*scale,image.naturalHeight*scale);
  return true;
}
