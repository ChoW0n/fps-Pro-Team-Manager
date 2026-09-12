// 축척은 중계 식별용입니다. 총구는 원점, 개머리판은 음의 X, 탄창은 양의 Y입니다.
type Point=[number,number];
type WeaponPart={id:string;length:number;body:Point[];stock:Point[];mag:Point[];grip:number;support:number;barrel:number;suppressor?:boolean;optic:'dot'|'scope'|'rail';color:string};
const ar:Point[]=[[-32,-3],[-30,-4],[-14,-4],[-12,-3],[-11,-1],[-12,2],[-20,2],[-21,4],[-24,4],[-25,2],[-28,1],[-31,1],[-32,0]];
const stock:Point[]=[[-44,-3],[-42,-3.5],[-35,-3.5],[-34,-2],[-31,-2],[-31,0],[-36,1],[-37,2],[-39,6],[-43,6.5],[-44,5]];
const mag:Point[]=[[-24,3],[-19,3],[-18.8,6],[-18,9],[-20,11],[-24.5,11.5],[-25,10],[-22.5,9],[-23.5,6]];
const w=(id:string,length:number,body:Point[],rear:Point[],magazine:Point[],grip:number,support:number,barrel:number,optic:WeaponPart['optic'],color:string,suppressor=false):WeaponPart=>({id,length,body,stock:rear,mag:magazine,grip,support,barrel,optic,color,suppressor});
export const WEAPON_PARTS:WeaponPart[]=[
 w('L119',44,ar,stock,mag,-29,-13,10,'dot','#656953'),
 w('MP5SD',40,[[-28,-3],[-15,-3],[-14,2],[-25,3],[-29,1]],[[-40,-3],[-39,-3.5],[-31,-3],[-29,-2],[-28,0],[-32,1],[-35,1.5],[-37,5],[-39.5,5.5],[-40,4]],[[-23,3],[-19,3],[-17,10],[-20,13],[-25,5]],-27,-14,15,'rail','#485455',true),
 w('HK416',43,[[-31,-3],[-29,-4],[-10,-4],[-9,-3],[-8,0],[-9,2],[-21,2],[-22,3.5],[-25,3.5],[-26,2],[-28,1],[-31,1]],stock,mag,-29,-13,7,'dot','#505C60'),
 w('X95',36,[[-35,-6],[-10,-6],[-7,-3],[-10,3],[-20,3],[-24,0],[-35,3]],[[-36,-5],[-32,-5],[-32,5],[-36,6]],[[-30,3],[-25,3],[-24,11],[-29,12]],-20,-10,6,'dot','#827D60'),
 w('MPX',35,[[-26,-4],[-9,-4],[-8,1],[-22,3],[-26,1]],[[-35,-3],[-34,-3.5],[-29,-3],[-28,-2],[-25,-1],[-25,0],[-30,1],[-32,4.5],[-34,5],[-35,4]],[[-20,3],[-17,3],[-18,12],[-22,12]],-25,-10,7,'dot','#53656B'),
 w('AS Val',44,[[-32,-3],[-19,-3],[-17,0],[-20,3],[-29,2]],[[-44,-3],[-34,-3],[-31,0],[-39,1],[-41,5],[-44,5]],[[-27,3],[-22,3],[-20,9],[-23,12],[-29,7]],-31,-17,18,'rail','#515A4C',true),
 w('HK417',48,[[-34,-4],[-11,-4],[-10,2],[-26,3],[-31,1]],stock,[[-27,3],[-20,3],[-20,11],[-27,11]],-32,-14,9,'scope','#596360'),
 w('PSG',53,[[-38,-3],[-20,-3],[-12,-1],[-15,2],[-35,3]],[[-53,-3],[-51,-4],[-44,-3],[-42,-2],[-40,-1],[-36,0],[-38,2],[-42,2],[-44,4],[-45,6],[-52,7],[-53,6]],[[-30,3],[-24,3],[-24,8],[-30,8]],-38,-18,12,'scope','#4B5653'),
 w('P90',33,[[-32,-6],[-10,-6],[-7,-3],[-9,4],[-17,6],[-25,3],[-32,5]],[[-33,-5],[-30,-5],[-30,6],[-33,6]],[[-29,-9],[-10,-9],[-10,-6],[-29,-6]],-23,-11,6,'rail','#6D7360'),
 w('C14',57,[[-40,-3],[-23,-3],[-21,-1],[-12,-1],[-12,2],[-39,3]],[[-57,-2],[-55,-3],[-48,-3],[-45,-2],[-43,-1],[-38,0],[-37,2],[-40,3],[-42,2],[-45,3],[-48,6],[-55,7],[-57,6]],[[-30,3],[-24,3],[-24,7],[-30,7]],-39,-20,12,'scope','#8A8165'),
 w('K1A',41,[[-29,-3],[-14,-3],[-10,0],[-14,3],[-26,2]],[[-41,-3],[-30,-3],[-28,-1],[-39,-1],[-39,5],[-41,5]],[[-23,3],[-18,3],[-18,9],[-21,12],[-26,10]],-28,-14,10,'rail','#586455'),
 w('ARX',42,[[-33,-5],[-15,-5],[-10,-2],[-11,3],[-25,4],[-33,1]],[[-42,-3],[-40,-4],[-35,-3],[-33,-2],[-30,-1],[-30,1],[-35,2],[-37,3],[-39,6],[-41,6],[-42,5]],mag,-30,-12,9,'dot','#726F5C'),
];
export function weaponPart(name:string):WeaponPart{return WEAPON_PARTS.find(part=>name.includes(part.id))??WEAPON_PARTS[0];}
export interface WeaponPose { hands?:boolean; magazineTravel?:number; }
// 외형 구조는 총종별로 분리합니다. 장식용 잔선 대신 재질·결합부·음각을 그립니다.
export function paintWeaponPart(ctx:CanvasRenderingContext2D,name:string,accent?:string,outline=2,pose:WeaponPose={}):void{
 const part=weaponPart(name),ink='#101518',metal='#43494B',edge='#727B7C',dark='#272D30',polymer=part.color,tape=accent??part.color;
 ctx.save();ctx.strokeStyle=ink;ctx.lineWidth=outline;ctx.lineJoin='round';
 const poly=(points:Point[],fill:string,stroke=true)=>{ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();if(stroke)ctx.stroke();};
 const box=(x:number,y:number,w:number,h:number,fill:string,stroke=true)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(stroke)ctx.strokeRect(x,y,w,h);};
 const line=(points:Point[],color:string,width=.65)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.strokeStyle=ink;ctx.lineWidth=outline;};
 const circle=(x:number,y:number,r:number,fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
 const arFamily=['L119','HK416','HK417','MPX'].includes(part.id);
 // 개머리판의 빈 공간은 실제 구멍으로 남겨 바닥색이 보입니다.
 const frame=(outer:Point[],inner:Point[],fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();for(const points of [outer,inner]){points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.fill('evenodd');ctx.stroke();};
 if(part.id==='AS Val'){
  frame([[-44,-3],[-33,-3],[-30,0],[-40,5],[-44,5]],[[-42,-1],[-35,-1],[-33,0],[-41,3],[-42,3]],dark);
 }else if(part.id==='K1A'){
  line([[-29,-2],[-41,-2],[-41,5]],ink,outline+1);line([[-29,-2],[-41,-2],[-41,5]],edge,.8);
 }else{
  poly(part.stock,polymer);
  const rear=Math.min(...part.stock.map(([x])=>x));
  box(rear,-2,1.5,7,dark,false);
  if(arFamily){
   poly([[rear+3,-1],[rear+9,-1],[rear+6,1],[rear+3,3]],dark,false);
   line([[rear+2,-2],[rear+8,-2]],edge);box(-34,-2,4,2,dark,false);
  }
 }
 if(part.id==='PSG'||part.id==='C14'){
  box(-part.length+2,-5,10,3,polymer);line([[-part.length+4,-4],[-part.length+10,-4]],edge);
  if(part.id==='PSG'){box(-part.length,-1,2,9,dark,false);box(-40,8,7,2,polymer);}
 }
 // 하부 손잡이·방아쇠울과 리시버를 분리합니다. 불펍과 P90은 고유 구조입니다.
 if(part.id==='P90'){
  frame([[-32,-5],[-9,-5],[-7,-2],[-9,6],[-15,7],[-22,4],[-29,7],[-32,5]],[[-26,0],[-22,-1],[-20,1],[-22,4],[-26,4]],polymer);
  frame([[-17,-1],[-9,-1],[-10,6],[-15,6]],[[-15,1],[-11,1],[-12,4],[-14,4]],polymer);
 }else{
  frame([[part.grip+1,1],[part.grip+9,1],[part.grip+8,7],[part.grip+2,7]],[[part.grip+3,2],[part.grip+7,2],[part.grip+6,5],[part.grip+3,5]],dark);
  poly([[part.grip,1],[part.grip+3,2],[part.grip+1,9],[part.grip-3,8]],part.id==='PSG'?'#716653':dark);
  poly(part.body,part.id==='X95'||part.id==='ARX'?polymer:metal);
  line([[part.grip+4,2],[part.grip+4.5,3.5],[part.grip+3.5,4]],edge,.6);
 }
 box(-part.barrel,-(part.suppressor?2.7:1),part.barrel,part.suppressor?5.4:2,dark);
 if(part.suppressor){
  box(-part.barrel+.8,-2.2,part.barrel-2,1.3,metal,false);
  line([[-1.5,-2.3],[-1.5,2.3]],edge,.7);
 }else{
  box(-2.8,-1.5,2.8,3,dark);line([[-2,-.8],[-1,-.8]],edge,.6);
 }
 const front=-part.barrel-1;
 if(arFamily){
  const start=part.id==='HK417'?-24:part.id==='MPX'?-17:-22;
  poly([[start,-4],[front,-4],[front,2],[start,2]],dark);
  box(start+.8,-3.3,front-start-1.5,1.1,metal,false);
  for(let x=start+1.8;x<front-1;x+=3.4)box(x,-1.5,1.8,1.2,ink,false);
  line([[start+.7,1],[front-.7,1]],edge,.55);
  box(part.grip+1,-2.7,5.5,1.8,ink,false);box(part.grip+1.4,-2.4,4.5,.6,edge,false);
  line([[part.grip-1,0],[start-1,0],[start-1,2]],dark,.65);
  circle(part.grip-1,-1,.65,edge);circle(part.grip+2,1,.6,edge);
  // 레일은 실제 장착부의 짧은 돌기만 남깁니다.
  box(part.grip-2,-5,front-part.grip+2,1,dark,false);
  for(let x=part.grip-1;x<front;x+=2.5)box(x,-5.2,.8,.7,edge,false);
 }else if(part.id==='MP5SD'){
  box(-18,-3.6,5.5,7,dark);for(let x=-17;x<-13;x+=1.4)line([[x,-2.6],[x,2.5]],metal,.6);
  box(-27,-2.5,6,1.6,dark,false);line([[-27,-2.6],[-21,-2.6]],edge);
  line([[-24,-4],[-19,-4],[-18,-5]],edge,1);
  frame([[-15,-3],[-15,-6],[-12,-6],[-12,-3]],[[-14,-3.5],[-14,-5],[-13,-5],[-13,-3.5]],dark);
 }else if(part.id==='AS Val'){
  line([[-31,-2],[-21,-2]],edge,1);box(-26,-1.5,5,1.5,dark,false);
  poly([[-21,-2],[-17,-2],[-16,3],[-21,3]],polymer);
  box(-12,-4,2,1.5,dark);box(-30,-4,3,1.5,dark);
 }else if(part.id==='X95'){
  box(-34,-4,2,7,dark,false);box(-31,-4,8,1.7,dark,false);line([[-30,-3.7],[-25,-3.7]],edge);
  frame([[-22,1],[-12,1],[-13,8],[-19,9]],[[-19,3],[-14,3],[-15,6],[-18,6]],polymer);
  for(let x=-17;x<-10;x+=2.8)box(x,-3,1.4,2,dark,false);
  box(-28,-7,17,1.2,dark,false);
 }else if(part.id==='ARX'){
  poly([[-32,-3.8],[-18,-3.8],[-13,-1.2],[-26,-1.2]],metal,false);
  box(-30,-2.6,7,1.4,dark,false);line([[-29,-2.4],[-25,-2.4]],edge);
  for(let x=-19;x<-12;x+=2.6)box(x,-.5,1.2,1.7,dark,false);
  line([[-32,-3],[-32,1]],edge,1);box(-29,-6,16,1.1,dark,false);
 }else if(part.id==='K1A'){
  poly([[-19,-3],[-14,-3],[-10,0],[-14,3],[-19,2]],dark);
  for(let x=-17;x<-12;x+=2)line([[x,-1],[x,1]],edge,.55);
  box(-27,-2,6,1.4,dark,false);line([[-27,-2],[-23,-2]],edge);
  frame([[-11,-1],[-11,-5],[-9,-5],[-8,-1]],[[-10,-1],[-10,-3.5],[-9.5,-3.5],[-9,-1]],dark);
 }else if(part.id==='PSG'||part.id==='C14'){
  poly([[-25,-1],[-14,-1],[-15,3],[-23,3]],polymer,false);
  line([[-37,-2],[-26,-2]],edge,1);
  if(part.id==='C14'){line([[-31,0],[-30,3]],edge,1.2);circle(-30,3,1.1,dark);}
  else{box(-34,-1.5,6,1.5,dark,false);line([[-22,1],[-15,1]],dark,.7);}
 }
 // 탄창을 독립 파츠로 조립합니다. P90만 상부로 분리됩니다.
 const travel=pose.magazineTravel??0,magY=part.id==='P90'?-travel:travel;
 ctx.save();ctx.translate(0,magY);
 poly(part.mag,part.id==='P90'?'#77775F':part.id==='AS Val'?'#343C34':dark);
 if(part.id==='P90'){
  box(-28,-8.4,16,1.6,'#98977A',false);
  for(let x=-27;x<-12;x+=2.5)line([[x,-8.2],[x+.7,-7]],'#5B5A47',.7);
 }else{
  const mx=part.mag[0][0],my=part.mag[0][1];
  line([[mx+1.4,my+1.2],[mx+2.2,my+5]],metal,.8);
  line([[mx+3,my+1.2],[mx+3.8,my+5]],metal,.8);
  // 장비색은 작은 식별 테이프만 사용합니다. 금속 탄창 전체를 팀색으로 칠하지 않습니다.
  poly([[mx+1,my+5],[mx+4,my+5],[mx+4.5,my+6.2],[mx+1.5,my+6.2]],tape,false);
 }
 ctx.restore();
 if(part.optic==='scope'){
  const x=-part.length*.72;
  box(x+3,-6,2,2,dark);box(x+11,-6,2,2,dark);
  poly([[x,-9],[x+4,-9],[x+5,-8],[x+12,-8],[x+14,-10],[x+19,-10],[x+19,-5],[x+14,-5],[x+12,-6],[x+5,-6],[x+4,-5],[x,-5]],dark);
  line([[x+1,-8],[x+4,-8],[x+5,-7],[x+12,-7]],edge,.7);box(x+8,-10,2.5,2,dark);box(x+17,-9,1,3,metal,false);
 }else if(part.optic==='dot'){
  const x=part.id==='X95'?-20:part.id==='MPX'?-23:-27;
  poly([[x,-4.5],[x,-8],[x+1,-9],[x+4,-9],[x+5,-8],[x+5,-4.5]],dark);
  box(x+1,-7.8,2.5,2.1,'#7C8D87',false);box(x-.5,-5,6,1,dark,false);
 }else if(part.id==='P90'){
  frame([[-23,-9],[-23,-13],[-12,-13],[-10,-9]],[[-21,-10],[-21,-11.5],[-14,-11.5],[-13,-10]],dark);
 }
 if(pose.hands!==false){
  const mx=(part.mag[0][0]+part.mag[1][0])/2;
  const hands:Point[]=[[part.grip,5],travel>0?[mx,(part.id==='P90'?-7:6)+magY]:[part.support,2]];
  ctx.fillStyle=tape;for(const [x,y] of hands){ctx.beginPath();ctx.ellipse(x,y,2.8,2.3,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
 }
 ctx.restore();
}
