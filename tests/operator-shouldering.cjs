// 실제 PNG와 실제 렌더러를 Node Canvas에서 검사합니다. 브라우저는 실행하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas'),root='../artifacts/draft-order-player-generator/src/';
const {OPERATORS}=require(root+'domain/Operator.ts');
const {weaponMountPose,solveArm,paintModularOperator,modularMuzzlePosition}=require(root+'components/modularOperator.ts');
const {weaponMuzzleOffset}=require(root+'components/weaponParts.ts');
const names=[...new Set(OPERATORS.flatMap(o=>o.firearms))],distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const unit={id:'qa',callSign:'MAGPIE',side:'공격',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,alive:true,action:'aim',locomotion:'walk'};
(async()=>{
 const asset=await require('./load-weapon-sprites.cjs')(),rows=[];
 for(const name of names){
  const m=weaponMountPose(name);
  assert.equal(weaponMuzzleOffset(name).y,7.5,'기존 시뮬레이션 원점 유지');
  if(m.kind!=='pistol'){
   assert.deepEqual(m.stock,m.shoulderPocket,'개머리판과 어깨 포켓 일치');
   assert(Math.abs(m.muzzle.y)<4,'총열 중심선은 몸 안쪽');
   assert(m.triggerHand.x<14,'방아쇠손은 몸 가까이');
  }else{assert.equal(m.muzzle.y,0);assert(distance(m.triggerHand,m.supportHand)<2);}
  for(const [shoulder,target,a,b,bend] of [[m.triggerShoulder,m.triggerHand,8,9,1],[m.supportShoulder,m.supportHand,12,12,-1]]){
   for(const kick of [0,.6,1.2]){
    const arm=solveArm(shoulder,{x:target.x-kick,y:target.y},a,b,bend);
    assert(Math.abs(distance(shoulder,arm.elbow)-a)<1e-6,name+' 위팔 길이');
    assert(Math.abs(distance(arm.elbow,arm.hand)-b)<1e-6,name+' 아래팔 길이');
   }
  }
  const before=JSON.stringify(unit);
  for(let i=0;i<8;i++){
   const u={...unit,weaponName:name,facing:i*Math.PI/4,position:{x:64,y:64}};
   const c=createCanvas(128,128);assert(paintModularOperator(c.getContext('2d'),u,1.07,1,asset));
   const p=modularMuzzlePosition(u,1.07,1),dx=p.x-64,dy=p.y-64;
   assert(Math.abs(dx*Math.cos(u.facing)+dy*Math.sin(u.facing)-(m.muzzle.x-1.2))<1e-6,'반동 총구 표시');
  }
  assert.equal(JSON.stringify(unit),before);
  rows.push({weapon:name,kind:m.kind,stock:m.stock,trigger:m.triggerHand,support:m.supportHand,torsoDegrees:m.torsoYaw*180/Math.PI});
 }
 assert.notEqual(weaponMountPose('C14').torsoYaw,weaponMountPose('L119').torsoYaw);
 assert(weaponMountPose('C14').supportHand.x-weaponMountPose('C14').triggerHand.x<7);
 const render=(u,time,reduced,motion)=>{
  const c=createCanvas(128,128),ctx=c.getContext('2d');ctx.translate(40,64);
  const before=JSON.stringify(u);paintModularOperator(ctx,u,time,undefined,asset,reduced,motion);
  assert.equal(JSON.stringify(u),before,'렌더링은 입력 상태를 변경하지 않음');
  return c.toBuffer('image/png');
 };
 const reload=duration=>render({...unit,weaponName:'MPX',action:'reload',reloadRemaining:duration/2},duration/2,false,{reloadStartedAt:0});
 assert.deepEqual(reload(1.9),reload(2.8),'실제 장전 길이에 비례한 같은 중간 자세');
 const throwing=time=>render({...unit,weaponName:'L119A2'},time,true,{thrown:{thrownAt:0}});
 assert.deepEqual(throwing(.1),throwing(.3),'동작 축소에서 투척 팔과 총을 함께 고정');
 const selected=['L119A2','MP5SD','MPX','타보르 X95','FN P90','HK417','C14','글록 17'];
 const sheet=createCanvas(1024,400),ctx=sheet.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1024,400);
 for(const [i,name] of selected.entries()){
  ctx.fillStyle='#E5ECE9';ctx.font='14px sans-serif';ctx.fillText(name,i*128+8,26);
  for(const [size,y] of [[64,52],[128,162]]){
   const tile=createCanvas(size,size),tc=tile.getContext('2d');
   // 전신과 C14까지 같은 축척으로 표시하고 픽셀 밀도만 바꿉니다.
   tc.translate(size*.33,size*.5);tc.scale(size/80,size/80);
   paintModularOperator(tc,{...unit,weaponName:name},1,undefined,asset,true);
   ctx.drawImage(tile,i*128+(128-size)/2,y);
   ctx.fillStyle='#ACBCB8';ctx.fillText(size+'px',i*128+40,y+size+20);
  }
 }
 const out=path.resolve(__dirname,'../validation');
 fs.writeFileSync(out+'/operator-shouldering-64-128.png',sheet.toBuffer('image/png'));
 fs.writeFileSync(out+'/operator-shouldering.json',JSON.stringify({scope:'Node Canvas; no browser; visual approval separate',weapons:names.length,directions:names.length*8,rows},null,2)+'\n');
 console.log('PASS shoulder pocket, central axis, '+names.length+' weapons, '+names.length*8+' directions, recoil reach, isolated gameplay origin, 64/128 render');
})().catch(e=>{console.error(e);process.exitCode=1;});
