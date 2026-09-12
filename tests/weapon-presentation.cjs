const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas'),root='../artifacts/draft-order-player-generator/src/';
const weapons=require(root+'components/weaponParts.ts'),{paintWeaponPart,weaponPart,weaponUp}=weapons;let actualMatrix;weapons.paintWeaponPart=(ctx,name)=>{actualMatrix=ctx.getTransform();return paintWeaponPart(ctx,name);};
const {OPERATORS}=require(root+'domain/Operator.ts'),{paintMinimalOperator}=require(root+'components/minimalOperator.ts'),{muzzlePosition}=require(root+'domain/operatorVisuals.ts');
const canvas=createCanvas(1200,840),ctx=canvas.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1200,840);
const pixels=new Set();let checks=0;
OPERATORS.forEach((op,i)=>{
 const c=createCanvas(240,100),p=c.getContext('2d');p.translate(215,45);p.scale(3,3);paintWeaponPart(p,op.firearms[0]);pixels.add(c.toBuffer('image/png').toString('base64'));
 const x=(i%3)*400,y=Math.floor(i/3)*210;ctx.fillStyle='#D5DEDB';ctx.font='16px sans-serif';ctx.fillText(op.firearms[0],x+15,y+24);ctx.drawImage(c,x+20,y+36);
 for(let angle=0;angle<8;angle++){
  const facing=angle*Math.PI/4,part=weaponPart(op.firearms[0]),up=weaponUp(facing);
  // 조준선은 총열 앞쪽이며, 좌우 어느 쪽에서도 탄창이 화면 아래를 향합니다.
  const stock={x:-part.length*Math.cos(facing),y:-part.length*Math.sin(facing)};
  assert(stock.x*Math.cos(facing)+stock.y*Math.sin(facing)<0);
  assert(up*Math.cos(facing)>=-1e-9);
  const unit={id:String(i),callSign:op.callSign,side:op.side,weaponName:op.firearms[0],position:{x:64,y:68},velocity:{x:0,y:0},facing,alive:true,action:'hold'};
  const m=muzzlePosition(op.callSign,unit.position,facing);assert(Number.isFinite(m.x)&&Number.isFinite(m.y));
  const tile=createCanvas(128,128),tc=tile.getContext('2d');paintMinimalOperator(tc,unit,1,undefined,()=>{throw Error('구형 PNG 의존 금지');});
  assert(Math.abs(actualMatrix.e-m.x)<1e-4&&Math.abs(actualMatrix.f-m.y)<1e-4,JSON.stringify({actual:{x:actualMatrix.e,y:actualMatrix.f},expected:m,facing}));assert(actualMatrix.a*Math.cos(facing)+actualMatrix.b*Math.sin(facing)>0,'실제 총열이 조준 방향으로 향함');assert(actualMatrix.d>=-1e-8,'실제 합성 탄창의 좌우 역전 금지');
  assert(tc.getImageData(0,0,128,128).data.some((v,index)=>index%4===3&&v>0));checks++;
 }
});
assert.equal(pixels.size,12,'12종 주무기의 실제 렌더가 모두 달라야 합니다');
fs.writeFileSync('validation/individual-weapons.png',canvas.toBuffer('image/png'));
const dirs=createCanvas(960,300),d=dirs.getContext('2d');d.fillStyle='#263237';d.fillRect(0,0,960,300);
for(let a=0;a<8;a++){d.save();d.translate(a*120+60,160);d.scale(1.6,1.6);paintMinimalOperator(d,{id:'review',callSign:'MAGPIE',side:'공격',weaponName:'L119A2',position:{x:0,y:0},velocity:{x:0,y:0},facing:a*Math.PI/4,alive:true,action:'hold'},1,undefined,()=>{throw Error('legacy');});d.restore();d.fillStyle='#D5DEDB';d.font='14px sans-serif';d.fillText(a*45+'°',a*120+45,260);}
fs.writeFileSync('validation/weapon-eight-directions.png',dirs.toBuffer('image/png'));
fs.writeFileSync('validation/weapon-presentation.json',JSON.stringify({primaryWeapons:12,directionalRenders:checks,checks:'distinct rendered weapons; muzzle/stock direction; upright magazine; actual vector composition without legacy PNG; eight-direction visual sheet',limits:'Not a manufacturer-accurate model or real device test.'},null,2)+'\n');console.log('PASS 12 unique weapons, 96 directional renders');
