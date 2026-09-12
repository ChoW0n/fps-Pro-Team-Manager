// 축척은 중계 식별용입니다. 총구는 원점, 개머리판은 음의 X, 탄창은 양의 Y입니다.
type Point=[number,number];
type WeaponPart={id:string;length:number;body:Point[];stock:Point[];mag:Point[];grip:number;support:number;barrel:number;suppressor?:boolean;optic:'dot'|'scope'|'rail';color:string};
const ar:Point[]=[[-32,-4],[-13,-4],[-11,-2],[-12,3],[-23,3],[-27,1],[-32,1]];
const stock:Point[]=[[-44,-3],[-34,-3],[-31,-1],[-36,1],[-38,6],[-44,7]];
const mag:Point[]=[[-24,3],[-19,3],[-19,10],[-22,12],[-27,10]];
const w=(id:string,length:number,body:Point[],rear:Point[],magazine:Point[],grip:number,support:number,barrel:number,optic:WeaponPart['optic'],color:string,suppressor=false):WeaponPart=>({id,length,body,stock:rear,mag:magazine,grip,support,barrel,optic,color,suppressor});
export const WEAPON_PARTS:WeaponPart[]=[
 w('L119',44,ar,stock,mag,-29,-13,10,'dot','#656953'),
 w('MP5SD',40,[[-28,-3],[-15,-3],[-14,2],[-25,3],[-29,1]],[[-40,-3],[-29,-3],[-28,0],[-35,1],[-37,6],[-40,6]],[[-23,3],[-19,3],[-17,10],[-20,13],[-25,5]],-27,-14,15,'rail','#485455',true),
 w('HK416',43,[[-31,-4],[-9,-4],[-8,2],[-23,3],[-28,1],[-31,1]],stock,mag,-29,-13,7,'dot','#505C60'),
 w('X95',36,[[-35,-6],[-10,-6],[-7,-3],[-10,3],[-20,3],[-24,0],[-35,3]],[[-36,-5],[-32,-5],[-32,5],[-36,6]],[[-30,3],[-25,3],[-24,11],[-29,12]],-20,-10,6,'dot','#827D60'),
 w('MPX',35,[[-26,-4],[-9,-4],[-8,1],[-22,3],[-26,1]],[[-35,-3],[-28,-3],[-25,0],[-31,1],[-33,5],[-35,5]],[[-20,3],[-17,3],[-18,12],[-22,12]],-25,-10,7,'dot','#53656B'),
 w('AS Val',44,[[-32,-3],[-19,-3],[-17,0],[-20,3],[-29,2]],[[-44,-3],[-34,-3],[-31,0],[-39,1],[-41,5],[-44,5]],[[-27,3],[-22,3],[-20,9],[-23,12],[-29,7]],-31,-17,18,'rail','#515A4C',true),
 w('HK417',48,[[-34,-4],[-11,-4],[-10,2],[-26,3],[-31,1]],stock,[[-27,3],[-20,3],[-20,11],[-27,11]],-32,-14,9,'scope','#596360'),
 w('PSG',53,[[-38,-3],[-20,-3],[-12,-1],[-15,2],[-35,3]],[[-53,-4],[-42,-4],[-36,0],[-43,2],[-43,8],[-52,8]],[[-30,3],[-24,3],[-24,8],[-30,8]],-38,-18,12,'scope','#4B5653'),
 w('P90',33,[[-32,-6],[-10,-6],[-7,-3],[-9,4],[-17,6],[-25,3],[-32,5]],[[-33,-5],[-30,-5],[-30,6],[-33,6]],[[-29,-9],[-10,-9],[-10,-6],[-29,-6]],-23,-11,6,'rail','#6D7360'),
 w('C14',57,[[-40,-3],[-23,-3],[-21,-1],[-12,-1],[-12,2],[-39,3]],[[-57,-4],[-43,-4],[-38,0],[-44,2],[-47,7],[-57,7]],[[-30,3],[-24,3],[-24,7],[-30,7]],-39,-20,12,'scope','#8A8165'),
 w('K1A',41,[[-29,-3],[-14,-3],[-10,0],[-14,3],[-26,2]],[[-41,-3],[-30,-3],[-28,-1],[-39,-1],[-39,5],[-41,5]],[[-23,3],[-18,3],[-18,9],[-21,12],[-26,10]],-28,-14,10,'rail','#586455'),
 w('ARX',42,[[-33,-5],[-15,-5],[-10,-2],[-11,3],[-25,4],[-33,1]],[[-42,-3],[-33,-3],[-30,0],[-36,2],[-39,7],[-42,6]],mag,-30,-12,9,'dot','#726F5C'),
];
export function weaponPart(name:string):WeaponPart{return WEAPON_PARTS.find(part=>name.includes(part.id))??WEAPON_PARTS[0];}
// 전장에서는 이 도형을 몸체와 함께 회전합니다. 화면 기준 좌우 반전은 하지 않습니다.
export function paintWeaponPart(ctx:CanvasRenderingContext2D,name:string,accent?:string,outline=2):void{
 const part=weaponPart(name),ink='#10191C',base='#475456',shade='#29373A',tint=accent??part.color;
 ctx.strokeStyle=ink;ctx.lineWidth=outline;ctx.lineJoin='round';
 const poly=(points:Point[],fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();};
 const box=(x:number,y:number,w:number,h:number,fill:string)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);};
 poly(part.stock,tint);poly(part.body,base);poly(part.mag,tint);
 poly([[part.grip,1],[part.grip+4,2],[part.grip+2,9],[part.grip-2,8]],shade);
 box(-part.barrel,-(part.suppressor?3:1.5),part.barrel,part.suppressor?6:3,shade);
 // 잔선 대신 리시버 상면과 광학 장치만 큰 면으로 남깁니다.
 ctx.fillStyle='#7C8883';ctx.fillRect(-part.length*.65,-3,8,2);
 if(part.optic==='scope'){box(-part.length*.72,-9,17,4,shade);}
 if(part.optic==='dot')poly([[-25,-4],[-25,-8],[-20,-8],[-18,-4]],shade);
 if(part.id==='P90'){ctx.fillStyle='#8E957E';ctx.fillRect(-28,-8,16,2);ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(-19,2,3,2,0,0,Math.PI*2);ctx.fill();}
 // 손도 군장과 같은 저채도 강조색을 사용합니다.
 ctx.fillStyle=tint;for(const [x,y] of [[part.grip,5],[part.support,2]]){ctx.beginPath();ctx.ellipse(x,y,2.8,2.3,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
}
