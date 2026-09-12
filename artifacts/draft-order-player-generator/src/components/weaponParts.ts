/** 생성된 PNG의 기준점입니다. 코드로 총기 외형을 그리거나 대체하지 않습니다. */
type Point=[number,number];
export type WeaponAssetLoader=(file:string)=>HTMLImageElement;
export interface WeaponPart { id:string;file:string;length:number;muzzle:Point;rear:number;gripPoint:Point;supportPoint:Point;magazinePoint:Point; }
/** 원본 픽셀 기준점을 총구 중심의 전장 좌표로 변환합니다. */
function part(id:string,file:string,length:number,muzzle:Point,rear:number,gripPoint:Point,supportPoint:Point,magazinePoint:Point):WeaponPart{
 const scale=length/(muzzle[0]-rear),local=(p:Point):Point=>[(p[0]-muzzle[0])*scale,(p[1]-muzzle[1])*scale];
 const mag=local(magazinePoint);
 return {id,file:'weapons/'+file+'-v1.png',length,muzzle,rear,gripPoint:local(gripPoint),supportPoint:local(supportPoint),magazinePoint:mag};
}
/** 수직 상부 PNG의 총구·손 기준점. 기존 측면 원본은 별도 보존합니다. */
export const WEAPON_PARTS:WeaponPart[]=[
 part('L119','top/l119',44,[2132,360],38,[720,425],[1450,410],[840,450]),
 part('MP5SD','top/mp5sd',40,[2148,348],24,[770,413],[1420,398],[890,438]),
 part('HK416','top/hk416',43,[2155,360],17,[720,425],[1460,410],[840,450]),
 part('X95','top/x95',36,[2136,356],35,[1190,421],[1600,406],[1310,446]),
 part('MPX','top/mpx',35,[2121,350],50,[1030,415],[1570,400],[1150,440]),
 part('AS Val','top/val',44,[2128,350],44,[720,415],[1350,400],[840,440]),
 part('HK417','top/hk417',48,[2140,347],31,[780,412],[1480,397],[900,437]),
 part('PSG','top/psg',53,[2153,351],18,[690,416],[1390,401],[810,441]),
 part('P90','top/p90',33,[2137,355],34,[1390,420],[1750,405],[1510,445]),
 part('C14','top/c14',57,[2140,350],26,[740,415],[1410,400],[860,440]),
 part('K1A','top/k1a',41,[2117,358],57,[950,423],[1510,408],[1070,448]),
 part('ARX','top/arx',42,[2139,355],31,[850,420],[1530,405],[970,445]),
];
/** 실제 총기 이름에 대응하는 원본을 선택합니다. */
export function weaponPart(name:string):WeaponPart{return WEAPON_PARTS.find(item=>name.includes(item.id))??WEAPON_PARTS[0];}
// 큰 원본을 매 프레임 직접 축소하지 않고 중간 해상도를 한 번만 준비합니다.
const thumbnails=new WeakMap<HTMLImageElement,Map<number,{color:HTMLCanvasElement;ink:HTMLCanvasElement}>>();
/** 표시 밀도에 맞춰 PNG 축소본과 알파 외곽을 캐시합니다. */
function thumbnail(image:HTMLImageElement,target:number):{color:HTMLCanvasElement;ink:HTMLCanvasElement}{
 let levels=thumbnails.get(image);if(!levels){levels=new Map();thumbnails.set(image,levels);}const ready=levels.get(target);if(ready)return ready;
 let source:CanvasImageSource=image,width=image.naturalWidth,height=image.naturalHeight;
 let canvas:HTMLCanvasElement;
 do{
  const nextWidth=Math.max(target,Math.round(width/2)),nextHeight=Math.round(height*nextWidth/width);
  canvas=document.createElement('canvas');canvas.width=nextWidth;canvas.height=nextHeight;
  const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(source,0,0,nextWidth,nextHeight);
  source=canvas;width=nextWidth;height=nextHeight;
 }while(width>target);
 const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;
 const c=mask.getContext('2d')!;c.drawImage(canvas,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#10191C';c.fillRect(0,0,mask.width,mask.height);
 const result={color:canvas,ink:mask};levels.set(target,result);return result;
}
// 기준점 정렬과 이미지 표시만 수행합니다. 로딩 실패 시 거부된 도형 총기를 재사용하지 않습니다.
export function paintWeaponPart(ctx:CanvasRenderingContext2D,name:string,asset:WeaponAssetLoader):boolean{
 const part=weaponPart(name),image=asset(part.file);
 if(!image||!image.complete||!image.naturalWidth)return false;
 const scale=part.length/(part.muzzle[0]-part.rear);
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const transform=ctx.getTransform(),pixels=image.naturalWidth*scale*Math.hypot(transform.a,transform.b);
 const target=Math.min(image.naturalWidth,pixels<=192?192:pixels<=384?384:768);
 const sprite=thumbnail(image,target),x=-part.muzzle[0]*scale,y=-part.muzzle[1]*scale,w=image.naturalWidth*scale,h=image.naturalHeight*scale;
 // 새 도형이 아니라 PNG 자체의 알파 외곽을 따라 작은 전장용 테두리를 합성합니다.
 for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]])ctx.drawImage(sprite.ink,x+dx,y+dy,w,h);
 ctx.drawImage(sprite.color,x,y,w,h);
 ctx.restore();return true;
}
