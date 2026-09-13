// 같은 렌더러의 수정 전후를 비교합니다. 외형 수정으로 파지·장비 변환이 움직이면 실패합니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{execFileSync}=require('node:child_process'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const {createCanvas}=require('@napi-rs/canvas'),file=path.resolve(__dirname,'../artifacts/draft-order-player-generator/src/components/modularOperator.ts');
const current=require(file),old=new Module(file,module);old.filename=file;old.paths=module.paths;
old._compile(compile(execFileSync('git',['show','10b87fe:artifacts/draft-order-player-generator/src/components/modularOperator.ts'],{encoding:'utf8'})),file);
const base={id:'crouch',callSign:'REUSS',side:'수비',weaponName:'HK417',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,alive:true,action:'aim',locomotion:'walk'};
(async()=>{
 const asset=await require('./load-weapon-sprites.cjs')();
 const paint=(ctx,u,renderer,frame)=>renderer.paintModularOperator(ctx,u,1,undefined,asset,true,{frame});
 const {OPERATORS}=require('../artifacts/draft-order-player-generator/src/domain/Operator.ts');
 let cases=0;
 for(const weaponName of new Set(OPERATORS.flatMap(o=>o.firearms)))for(const crouchAmount of [0,.5,1])for(const facing of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const u=Object.freeze({...base,weaponName,facing,locomotion:crouchAmount?'crouch':'walk',shieldRaised:current.equipmentMountPose({...base,weaponName}).kind==='pistol'});
  const capture=renderer=>{const ctx=createCanvas(160,160).getContext('2d'),marks=[];const proxy=new Proxy(ctx,{get(t,k){const v=t[k];if(typeof v!=='function')return v;return(...a)=>{if(k==='drawImage'||k==='roundRect'&&a[2]===4&&a[3]===3){const m=t.getTransform();marks.push([k,m.a,m.b,m.c,m.d,m.e,m.f,...(k==='drawImage'?a.slice(1):a)]);}return v.apply(t,a);};},set(t,k,v){t[k]=v;return true;}});paint(proxy,u,renderer,{lowerFacing:facing,crouchAmount,step:0,reloadReach:0});return marks;};
  assert.deepEqual(capture(current),capture(old.exports),'손·총기·방패 변환 보존');cases++;
 }
 const c=createCanvas(1080,560),ctx=c.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,c.width,c.height);
 const samples=[['STANDING',{}],['CROUCH / HK417',{locomotion:'crouch'}],['CROUCH / SHIELD + USP',{locomotion:'crouch',shieldRaised:true,weaponName:'HK USP'}]];
 for(const [row,renderer] of [[0,old.exports],[1,current]])for(const [i,[label,extra]] of samples.entries()){
  ctx.fillStyle='#E5ECE9';ctx.font='17px sans-serif';ctx.fillText((row?'AFTER':'BEFORE')+' · '+label,i*360+18,row*280+28);
  ctx.save();ctx.translate(i*360+125,row*280+145);ctx.scale(5,5);paint(ctx,{...base,...extra},renderer);ctx.restore();
 }
 fs.writeFileSync('validation/operator-crouch-before-after.png',c.toBuffer('image/png'));
 console.log('PASS '+cases+' before/after hand, weapon, shield transforms; standing/crouch preview; no browser');
})().catch(e=>{console.error(e);process.exitCode=1;});
