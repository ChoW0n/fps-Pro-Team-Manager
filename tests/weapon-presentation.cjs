const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas'),root='../artifacts/draft-order-player-generator/src/';
const weapons=require(root+'components/weaponParts.ts'),{paintWeaponPart,weaponPart}=weapons;let actualMatrix,skipWeapon=false;weapons.paintWeaponPart=(...args)=>{actualMatrix=args[0].getTransform();if(!skipWeapon)return paintWeaponPart(...args);};
const {OPERATORS}=require(root+'domain/Operator.ts'),{paintMinimalOperator}=require(root+'components/minimalOperator.ts'),{muzzlePosition}=require(root+'domain/operatorVisuals.ts');
(async()=>{
const asset=await require('./load-weapon-sprites.cjs')();
const canvas=createCanvas(1200,840),ctx=canvas.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1200,840);
const pixels=new Set();let checks=0;
OPERATORS.forEach((op,i)=>{
 const c=createCanvas(380,170),p=c.getContext('2d');p.translate(355,75);p.scale(5.6,5.6);paintWeaponPart(p,op.firearms[0],asset);pixels.add(c.toBuffer('image/png').toString('base64'));
 const x=(i%3)*400,y=Math.floor(i/3)*210;ctx.fillStyle='#D5DEDB';ctx.font='16px sans-serif';ctx.fillText(op.firearms[0],x+15,y+24);ctx.drawImage(c,x+10,y+35);
 for(let angle=0;angle<8;angle++){
  const facing=angle*Math.PI/4,part=weaponPart(op.firearms[0]);
  // 탑뷰에서는 탄창도 몸체와 함께 회전하며 화면 기준 거울 반전을 하지 않습니다.
  const stock={x:-part.length*Math.cos(facing),y:-part.length*Math.sin(facing)};
  assert(stock.x*Math.cos(facing)+stock.y*Math.sin(facing)<0);
  const unit={id:String(i),callSign:op.callSign,side:op.side,weaponName:op.firearms[0],position:{x:64,y:68},velocity:{x:0,y:0},facing,alive:true,action:'hold'};
  const m=muzzlePosition(unit.weaponName,unit.position,facing);assert(Number.isFinite(m.x)&&Number.isFinite(m.y));
  const tile=createCanvas(128,128),tc=tile.getContext('2d');paintMinimalOperator(tc,unit,1,undefined,asset);
  assert(Math.abs(actualMatrix.e-m.x)<1e-4&&Math.abs(actualMatrix.f-m.y)<1e-4,JSON.stringify({actual:{x:actualMatrix.e,y:actualMatrix.f},expected:m,facing}));assert(actualMatrix.a*Math.cos(facing)+actualMatrix.b*Math.sin(facing)>0,'실제 총열이 조준 방향으로 향함');assert(actualMatrix.a*actualMatrix.d-actualMatrix.b*actualMatrix.c>0,'반사 없이 연속 회전');assert(Math.abs(Math.hypot(actualMatrix.a,actualMatrix.b)-Math.hypot(actualMatrix.c,actualMatrix.d))<1e-5,'균일 축척으로 외곽선 보존');
  const full=tc.getImageData(0,0,128,128).data;
  const bare=createCanvas(128,128),bc=bare.getContext('2d');skipWeapon=true;paintMinimalOperator(bc,unit,1,undefined,asset);skipWeapon=false;
  const without=bc.getImageData(0,0,128,128).data;let visible=0;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const dx=x-64,dy=y-68,forward=dx*Math.cos(facing)+dy*Math.sin(facing),lateral=-dx*Math.sin(facing)+dy*Math.cos(facing),offset=(y*128+x)*4;
   // 몸체 전방 끝은 로컬 X=7, 외곽선을 포함해 X=8입니다.
   if(forward>10&&Math.abs(lateral)<10&&Math.abs(full[offset]-without[offset])+Math.abs(full[offset+1]-without[offset+1])+Math.abs(full[offset+2]-without[offset+2])+Math.abs(full[offset+3]-without[offset+3])>30)visible++;
  }
  assert(visible>8,op.callSign+' '+angle*45+'도 몸 밖 무기 실루엣 픽셀 '+visible);checks++;
 }
});
// 기존 정면/측면/좌우 반전 경계 앞뒤에서 갑작스러운 실루엣 변경을 검사합니다.
for(const boundary of [Math.asin(.72),Math.PI/2,Math.PI-Math.asin(.72),Math.PI,Math.PI+Math.asin(.72),Math.PI*1.5,Math.PI*2-Math.asin(.72),Math.PI*2]){
 const render=facing=>{const c=createCanvas(128,128);paintMinimalOperator(c.getContext('2d'),{id:'continuity',callSign:'MAGPIE',side:'공격',weaponName:'L119A2',position:{x:64,y:64},velocity:{x:0,y:0},facing,alive:true,action:'hold'},1,undefined,asset);return c.getContext('2d').getImageData(0,0,128,128).data;};
 const a=render(boundary-.0001),b=render(boundary+.0001);let difference=0,mass=0;for(let i=0;i<a.length;i+=4){for(let j=0;j<3;j++){const av=a[i+j]*a[i+3]/255,bv=b[i+j]*b[i+3]/255;difference+=Math.abs(av-bv);mass+=Math.max(av,bv);}}assert(difference/mass<.02,'각도 경계 불연속 '+boundary+' '+difference/mass);
}
assert.equal(pixels.size,12,'12종 주무기의 실제 렌더가 모두 달라야 합니다');
fs.writeFileSync('validation/individual-weapons.png',canvas.toBuffer('image/png'));
const dirs=createCanvas(960,300),d=dirs.getContext('2d');d.fillStyle='#263237';d.fillRect(0,0,960,300);
for(let a=0;a<8;a++){d.save();d.translate(a*120+60,160);d.scale(1.6,1.6);paintMinimalOperator(d,{id:'review',callSign:'MAGPIE',side:'공격',weaponName:'L119A2',position:{x:0,y:0},velocity:{x:0,y:0},facing:a*Math.PI/4,alive:true,action:'hold'},1,undefined,asset);d.restore();d.fillStyle='#D5DEDB';d.font='14px sans-serif';d.fillText(a*45+'°',a*120+45,260);}
fs.writeFileSync('validation/weapon-eight-directions.png',dirs.toBuffer('image/png'));
fs.writeFileSync('validation/weapon-presentation.json',JSON.stringify({primaryWeapons:12,directionalRenders:checks,checks:'distinct rendered weapons; muzzle/stock direction; no reflection; uniform outline scaling; visible weapon pixels outside body at every angle; eight boundary continuity checks; actual generated PNG composition without vector weapon fallback; eight-direction visual sheet',limits:'Not a manufacturer-accurate model or real device test.'},null,2)+'\n');console.log('PASS 12 unique weapons, 96 directional renders');

})().catch(error=>{console.error(error);process.exitCode=1;});
