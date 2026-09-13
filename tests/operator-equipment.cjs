// 실제 PNG·그려진 팔 선분·표시 총구를 검사합니다. 브라우저를 실행하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas'),root='../artifacts/draft-order-player-generator/src/';
const {paintModularOperator,equipmentMountPose,modularMuzzlePosition}=require(root+'components/modularOperator.ts');
const {HANDHELD_SHIELD,paintDeployedShield}=require(root+'components/shieldParts.ts');
const {OPERATORS}=require(root+'domain/Operator.ts'),{weaponMuzzleOffset,weaponPart}=require(root+'components/weaponParts.ts');
const names=[...new Set(OPERATORS.flatMap(o=>o.firearms))],near=(a,b,message)=>assert(Math.abs(a-b)<1e-6,message+' '+a+' != '+b),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const base={id:'equipment',callSign:'REUSS',side:'수비',weaponName:'HK417',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,alive:true,action:'aim',locomotion:'walk'};
(async()=>{
 const asset=await require('./load-weapon-sprites.cjs')();let cases=0;
 for(const weaponName of names)for(const stance of ['crawl','shield'])for(let facing=0;facing<8;facing++){
  const u=Object.freeze({...base,weaponName,facing:facing*Math.PI/4,locomotion:stance==='crawl'?'crawl':'walk',shieldRaised:stance==='shield',position:Object.freeze({x:0,y:0}),velocity:Object.freeze({x:0,y:0})});
  const m=equipmentMountPose(u),canvas=createCanvas(160,160),native=canvas.getContext('2d');native.translate(80,80);
  const arms=[],drawn=[],hands=[];let points=[];
  const ctx=new Proxy(native,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return(...args)=>{
   if(key==='beginPath')points=[];
   if(key==='moveTo'||key==='lineTo')points.push({x:args[0],y:args[1]});
   if(key==='stroke'&&points.length===3&&Math.abs(target.lineWidth-4.8)<1e-5)arms.push(points.slice());
   if(key==='roundRect'&&args[2]===4&&args[3]===3)hands.push({drawCount:drawn.length,transform:target.getTransform()});
   if(key==='drawImage')drawn.push({image:args[0],transform:target.getTransform(),args});
   return value.apply(target,args);
  };},set(target,key,value){target[key]=value;return true;}});
  assert(paintModularOperator(ctx,u,1.07,1,asset));assert.equal(arms.length,2);
  for(const [index,a,b] of [[0,stance==='shield'?8:m.kind==='pistol'?7:12,stance==='shield'?10:m.kind==='pistol'?8:12],[1,8,9]]){near(distance(arms[index][0],arms[index][1]),a,weaponName+' '+stance+' upper');near(distance(arms[index][1],arms[index][2]),b,weaponName+' '+stance+' forearm');}
  near(distance(arms[1][2],{x:m.triggerHand.x-1.2,y:m.triggerHand.y}),0,'반동 방아쇠 접점');
  const lastGun=drawn.filter(d=>d.image!==asset(HANDHELD_SHIELD.file)).at(-1);
  const muzzle=modularMuzzlePosition(u,1.07,1);// Skia의 getTransform은 float32이므로 회전·평행이동 누적 1e-4px 반올림을 허용합니다. 관절 검사는 1e-6 그대로입니다.
  assert(Math.abs(lastGun.transform.e-muzzle.x-80)<1e-4,'실제 그린 총구 X');assert(Math.abs(lastGun.transform.f-muzzle.y-80)<1e-4,'실제 그린 총구 Y '+JSON.stringify({weaponName,stance,facing,actual:lastGun.transform.f,expected:muzzle.y+80}));
  if(weaponPart(weaponName).file.endsWith('-v2.png')){
   assert.equal(hands[0].drawCount,0,'권총 방아쇠손은 슬라이드보다 먼저 그림');
   if(stance!=='shield')assert.equal(hands[1].drawCount,0,'권총 지지손은 슬라이드보다 먼저 그림');
  }
  if(stance==='shield'){
   const palm=hands.at(-1).transform,forearm=Math.atan2(arms[0][2].y-arms[0][1].y,arms[0][2].x-arms[0][1].x)+u.facing;
   assert(Math.abs(Math.sin(Math.atan2(palm.b,palm.a)-forearm))<1e-5,'방패 손목과 아래팔 방향 일치');
   const shield=drawn.find(d=>d.image===asset(HANDHELD_SHIELD.file));assert(shield,'생성 방패 PNG 호출');
   const [,x,y,w,h]=shield.args,image=shield.image;
   near(w/image.naturalWidth,h/image.naturalHeight,'방패 등비 축소');
   near(x+HANDHELD_SHIELD.grip.x*w/image.naturalWidth,arms[0][2].x,'손잡이 X');near(y+HANDHELD_SHIELD.grip.y*h/image.naturalHeight,arms[0][2].y,'손잡이 Y');
   assert(m.muzzle.y>y+h,'발사 축은 방패 옆으로 통과');
  }
  if(weaponPart(weaponName).file.endsWith('-v2.png'))assert.deepEqual(weaponMuzzleOffset(weaponName),{x:15,y:7.5},'시뮬레이션 발사 원점 고정');
  cases++;
 }
 for(const state of [{downed:{mode:'crawl'},locomotion:'crawl'},{alive:false}]){
  const c=createCanvas(160,160);let requests=0;paintModularOperator(c.getContext('2d'),{...base,...state},1.07,1,()=>{requests++;return asset('weapons/top/hk417-v1.png');});assert.equal(requests,0,'다운/사망을 사격 포복으로 취급하지 않음');
 }
 const sheet=createCanvas(1400,720),ctx=sheet.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1400,720);
 const samples=[['G17','글록 17'],['G19','글록 19'],['P226','P226'],['K5','K5 권총'],['USP','HK USP'],['92FS','베레타 92FS'],['SR1','SR-1'],['MR73','MR73']];
 samples.forEach(([label,weaponName],i)=>{const x=(i%4)*350,y=Math.floor(i/4)*170;ctx.save();ctx.translate(x+90,y+92);ctx.scale(3,3);paintModularOperator(ctx,{...base,weaponName,shieldRaised:false},1,undefined,asset,true);ctx.restore();ctx.fillStyle='#E5ECE9';ctx.font='16px sans-serif';ctx.fillText(label,x+18,y+24);});
 for(const [i,label,extra] of [[0,'PRONE HK417',{locomotion:'crawl'}],[1,'PRONE MR73',{locomotion:'crawl',weaponName:'MR73'}],[2,'SHIELD HK417 (option off)',{shieldRaised:true}],[3,'SHIELD USP (default)',{shieldRaised:true,weaponName:'HK USP'}]]){
  ctx.save();ctx.translate(i*350+125,495);ctx.scale(3,3);paintModularOperator(ctx,{...base,...extra},1,undefined,asset,true);ctx.restore();ctx.fillStyle='#E5ECE9';ctx.fillText(label,i*350+18,385);
 }
 ctx.save();ctx.translate(650,653);ctx.rotate(Math.PI/2);assert(paintDeployedShield(ctx,asset,40,240));ctx.restore();ctx.fillText('DEPLOYED SHIELD — uniform scale',800,665);
 fs.writeFileSync('validation/operator-equipment.png',sheet.toBuffer('image/png'));
 fs.writeFileSync('validation/operator-equipment.json',JSON.stringify({scope:'Node Canvas; no browser',equipmentDirectionCases:cases,sidearmSprites:8,shieldSprites:2,checks:['rendered arm lengths','prone weapon retained','shield grip contact including recoil','display muzzle matches draw transform','shield uniform scale','shield clears muzzle axis','legacy sidearm simulation origin','frozen inputs','down/dead unarmed'],limits:['New art awaits user feedback','No full draw/holster animation','No real-device or performance gate claim']},null,2)+'\n');
 console.log('PASS '+cases+' equipment poses, grip/arm/muzzle isolation; down/dead; generated shield PNG');
})().catch(e=>{console.error(e);process.exitCode=1;});
