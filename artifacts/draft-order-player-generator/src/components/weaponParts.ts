/** 생성된 PNG의 기준점입니다. 코드로 총기 외형을 그리거나 대체하지 않습니다. */
type Point=[number,number];
export type WeaponAssetLoader=(file:string)=>HTMLImageElement;
export interface WeaponPart { id:string;file:string;length:number;muzzle:Point;rear:number;gripPoint:Point;supportPoint:Point;magazinePoint:Point; }
function part(id:string,file:string,length:number,muzzle:Point,rear:number,gripPoint:Point,supportPoint:Point,magazinePoint:Point):WeaponPart{
 const scale=length/(muzzle[0]-rear),local=(p:Point):Point=>[(p[0]-muzzle[0])*scale,(p[1]-muzzle[1])*scale];
 const mag=local(magazinePoint);
 return {id,file:'weapons/'+file+'-v1.png',length,muzzle,rear,gripPoint:local(gripPoint),supportPoint:local(supportPoint),magazinePoint:mag};
}
export const WEAPON_PARTS:WeaponPart[]=[
 part('L119','l119',44,[1756,329],17,[606,545],[1340,365],[935,620]),
 part('MP5SD','mp5sd',40,[1965,263],21,[660,490],[1390,300],[1070,555]),
 part('HK416','hk416',43,[1764,305],13,[600,545],[1350,360],[950,620]),
 part('X95','x95',36,[1763,345],11,[880,650],[1390,550],[550,650]),
 part('MPX','mpx',35,[1762,279],13,[810,555],[1460,335],[1230,640]),
 part('AS Val','val',44,[1758,339],16,[586,495],[1140,380],[866,541]),
 part('HK417','hk417',48,[2160,297],13,[633,515],[1460,343],[963,565]),
 part('PSG','psg',53,[2000,320],27,[606,485],[1300,350],[916,515]),
 part('P90','p90',33,[1761,405],16,[1190,699],[1520,560],[940,305]),
 part('C14','c14',57,[2153,278],23,[510,457],[1240,347],[807,425]),
 part('K1A','k1a',41,[1903,260],18,[755,573],[1460,315],[1147,589]),
 part('ARX','arx',42,[1878,277],14,[657,568],[1430,350],[1100,631]),
];
export function weaponPart(name:string):WeaponPart{return WEAPON_PARTS.find(item=>name.includes(item.id))??WEAPON_PARTS[0];}
// 큰 원본을 매 프레임 직접 축소하지 않고 중간 해상도를 한 번만 준비합니다.
const thumbnails=new WeakMap<HTMLImageElement,{color:HTMLCanvasElement;ink:HTMLCanvasElement}>();
function thumbnail(image:HTMLImageElement):{color:HTMLCanvasElement;ink:HTMLCanvasElement}{
 const ready=thumbnails.get(image);if(ready)return ready;
 let source:CanvasImageSource=image,width=image.naturalWidth,height=image.naturalHeight;
 let canvas:HTMLCanvasElement;
 do{
  const nextWidth=Math.max(192,Math.round(width/2)),nextHeight=Math.round(height*nextWidth/width);
  canvas=document.createElement('canvas');canvas.width=nextWidth;canvas.height=nextHeight;
  const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(source,0,0,nextWidth,nextHeight);
  source=canvas;width=nextWidth;height=nextHeight;
 }while(width>192);
 const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;
 const c=mask.getContext('2d')!;c.drawImage(canvas,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#10191C';c.fillRect(0,0,mask.width,mask.height);
 const result={color:canvas,ink:mask};thumbnails.set(image,result);return result;
}
// 기준점 정렬과 이미지 표시만 수행합니다. 로딩 실패 시 거부된 도형 총기를 재사용하지 않습니다.
export function paintWeaponPart(ctx:CanvasRenderingContext2D,name:string,asset:WeaponAssetLoader):boolean{
 const part=weaponPart(name),image=asset(part.file);
 if(!image||!image.complete||!image.naturalWidth)return false;
 const scale=part.length/(part.muzzle[0]-part.rear);
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const sprite=thumbnail(image),x=-part.muzzle[0]*scale,y=-part.muzzle[1]*scale,w=image.naturalWidth*scale,h=image.naturalHeight*scale;
 // 새 도형이 아니라 PNG 자체의 알파 외곽을 따라 작은 전장용 테두리를 합성합니다.
 for(const [dx,dy] of [[-.65,-.65],[.65,-.65],[-.65,.65],[.65,.65]])ctx.drawImage(sprite.ink,x+dx,y+dy,w,h);
 ctx.drawImage(sprite.color,x,y,w,h);
 ctx.restore();return true;
}
