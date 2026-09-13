import anchors from './effectAnchors.json';

/** 실제 생성 원본에서 측정한 기준점. 난수는 사건 키에서만 얻습니다. */
export type EffectKind='muzzle'|'blood'|'blood-head'|'dust'|'blast'|'breach';
export const EFFECT_PARTS={muzzle:{count:4,length:16,seconds:.06},blood:{count:4,length:26,seconds:.28},'blood-head':{count:2,length:34,seconds:.28},dust:{count:3,length:10,seconds:.28},blast:{count:3,length:42,seconds:.65},breach:{count:2,length:30,seconds:.65}};
export function drawEffect(ctx:CanvasRenderingContext2D,load:(url:string)=>HTMLImageElement,kind:EffectKind,key:string,x:number,y:number,angle:number,age:number,reducedMotion=false):boolean {
  const part=EFFECT_PARTS[kind];if(age<0||age>=part.seconds)return false;
  let hash=2166136261;for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  const name=`${kind}-${(hash>>>0)%part.count+1}`,anchor=anchors[name as keyof typeof anchors];
  const image=load(`effects/${name}-v1.png`);
  if(!image.complete||!image.naturalWidth)return false;
  const progress=age/part.seconds,scale=part.length/anchor.axisLength*(reducedMotion?1:.6+.4*progress);
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=1-progress;
  ctx.drawImage(image,-anchor.origin[0]*scale,-anchor.origin[1]*scale,image.naturalWidth*scale,image.naturalHeight*scale);ctx.restore();return true;
}
