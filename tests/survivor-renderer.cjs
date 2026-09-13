// 실제 원본 파츠 PNG와 활성 렌더러를 실행합니다. 브라우저는 사용하지 않습니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas');
const {paintModularOperator,modularMuzzlePosition,equipmentMountPose,OperatorAnimator}=require('../artifacts/draft-order-player-generator/src/components/modularOperator.ts');
const {weaponPart,weaponMuzzleOffset}=require('../artifacts/draft-order-player-generator/src/components/weaponParts.ts');
const {OPERATORS}=require('../artifacts/draft-order-player-generator/src/domain/Operator.ts');
const base={id:'survivor',callSign:'REUSS',side:'수비',weaponName:'HK417',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,alive:true,action:'aim',locomotion:'walk'};
(async()=>{
 const asset=await require('./load-weapon-sprites.cjs')(),names=[...new Set(OPERATORS.flatMap(o=>o.firearms))];let cases=0;
 for(const weaponName of names)for(const locomotion of ['walk','crouch','crawl'])for(let n=0;n<8;n++){
  const u=Object.freeze({...base,weaponName,locomotion,facing:n*Math.PI/4,shieldRaised:equipmentMountPose({...base,weaponName}).kind==='pistol',position:Object.freeze({x:0,y:0}),velocity:Object.freeze({x:0,y:0})});
  const c=createCanvas(160,160),ctx=c.getContext('2d');ctx.translate(80,80);const calls=[];
  const proxy=new Proxy(ctx,{get(t,k){const v=t[k];if(typeof v!=='function')return v;return(...a)=>{if(k==='drawImage')calls.push({im:a[0],args:a,m:t.getTransform()});return v.apply(t,a);};},set(t,k,v){t[k]=v;return true;}});
  assert(paintModularOperator(proxy,u,1.07,1,asset));
  assert(calls.some(x=>x.im===asset('survivor/torso.png')));assert(calls.some(x=>x.im===asset('survivor/arm.png')));
  const weapon=calls.filter(x=>x.args.length===5&&x.im!==asset('effects/handheld-shield-v3.png')).at(-1);assert(weapon,'총기 썸네일 그리기');
  const muzzle=modularMuzzlePosition(u,1.07,1);assert(Math.abs(weapon.m.e-muzzle.x-80)<1e-4);assert(Math.abs(weapon.m.f-muzzle.y-80)<1e-4);
  const hand=calls.find(x=>x.im===asset('survivor/hand_holding_gun.png'));const mount=equipmentMountPose(u),x=mount.triggerHand.x-1.2,y=mount.triggerHand.y;
  assert(Math.abs(hand.m.e-(80+x*Math.cos(u.facing)-y*Math.sin(u.facing)))<1e-4,'방아쇠손 접점');
  assert(calls.indexOf(hand)<calls.indexOf(weapon),'상부 레일 위 손 겹침 금지');
  const support=calls.find(x=>x.im===asset('survivor/hand_steadying_gun.png'));assert(support);
  const sx=mount.supportHand.x-(u.shieldRaised?0:1.2),sy=mount.supportHand.y;
  assert(Math.abs(support.m.e-(80+sx*Math.cos(u.facing)-sy*Math.sin(u.facing)))<1e-4,'지지손 접점');
  assert(Math.abs(support.m.f-(80+sx*Math.sin(u.facing)+sy*Math.cos(u.facing)))<1e-4,'지지손 접점 Y');
  if(u.shieldRaised){
   assert.deepEqual(weaponMuzzleOffset(weaponName),{x:15,y:7.5},'표시 변경과 시뮬레이션 발사 원점 분리');
   const shield=calls.find(x=>x.im===asset('effects/handheld-shield-v3.png'));assert(shield);
   const {HANDHELD_SHIELD:part}=require('../artifacts/draft-order-player-generator/src/components/shieldParts.ts');
   const [,dx,dy,w,h]=shield.args;assert(Math.abs(w/shield.im.width-h/shield.im.height)<1e-7);
   assert(Math.abs(dx+part.grip.x*w/shield.im.width-mount.supportHand.x)<1e-7);
   assert(Math.abs(dy+part.grip.y*h/shield.im.height-mount.supportHand.y)<1e-7);
   assert(mount.muzzle.y>dy+h,'방패 밖 발사 축');
  }
  cases++;
 }
 const animator=new OperatorAnimator();animator.sample(base,0);const frame=animator.sample({...base,position:{x:6,y:0},velocity:{x:30,y:0}},.2);assert.equal(frame.gaitPhase,.25);
 for(const state of [{alive:false},{downed:{mode:'crawl'}},{shieldRaised:true}]){
  const requested=[];paintModularOperator(createCanvas(160,160).getContext('2d'),{...base,...state},1,undefined,file=>{requested.push(file);return asset(file);});
  if(state.alive===false||state.downed)assert(!requested.some(p=>p.startsWith('weapons/')),'비활성 상태 총기 숨김');
  else assert(!requested.includes('effects/handheld-shield-v3.png'),'주무장 방패 금지');
 }
 const sheet=createCanvas(1200,800),ctx=sheet.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1200,800);
 const samples=[['RIFLE / L119',{weaponName:'L119A2 카빈',callSign:'MAGPIE'}],['SMG / MP5SD',{weaponName:'MP5SD',callSign:'COLLIER'}],['MARKSMAN / HK417',{}],['BOLT / C14',{weaponName:'C14',callSign:'HALLORAN'}],['PISTOL / USP',{weaponName:'HK USP'}],['SHIELD / USP',{weaponName:'HK USP',shieldRaised:true}],['CROUCH / HK417',{locomotion:'crouch'}],['CROUCH / SHIELD',{weaponName:'HK USP',shieldRaised:true,locomotion:'crouch'}],['RELOAD',{action:'reload',reloadRemaining:1.2}]];
 for(const [i,[label,extra]] of samples.entries()){
  const x=i%3*400,y=Math.floor(i/3)*260;ctx.fillStyle='#E5ECE9';ctx.font='18px sans-serif';ctx.fillText(label,x+20,y+30);
  ctx.save();ctx.translate(x+125,y+145);ctx.scale(4,4);paintModularOperator(ctx,{...base,...extra},1,undefined,asset,false,{reloadStartedAt:.3});ctx.restore();
 }
 fs.writeFileSync('validation/survivor-operator-sheet.png',sheet.toBuffer('image/png'));
 fs.writeFileSync('validation/survivor-renderer.json',JSON.stringify({scope:'Node Canvas; no browser',cases,checks:['source PNG assembly','weapon texture and muzzle alignment','trigger contact during recoil','hands below gun','readonly unit state','distance-driven feet','no primary shield','inactive unarmed']},null,2)+'\n');
 console.log('PASS '+cases+' survivor equipment/facing cases, source parts and simulation isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
