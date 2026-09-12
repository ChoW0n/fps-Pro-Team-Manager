// 합성 사건으로 실제 Canvas의 아틀라스 호출을 검사합니다. 경기 빈도·브라우저 청음 검사가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const {createCanvas,Image}=require('@napi-rs/canvas');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const React=require(app+'/node_modules/react');
const {fixture}=require('./qa-preparation-batch.cjs');
const {TacticalRealtimeSimulation}=require(app+'/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {NAMSAN_MAP:map}=require(app+'/src/domain/tacticalMaps.ts');
const session=new TacticalRealtimeSimulation(map).createSession(fixture(1,0,0));
const initial=session.step().snapshot,friend=initial.units.find(u=>u.side==='공격');
const {BroadcastCanvas,eventEffectDuration}=require(app+'/src/components/BroadcastCanvas.tsx');
let missingEffects=false;
class LocalImage extends Image {set src(url){this.file=url;if(missingEffects&&url.startsWith('/effects/'))return;super.src=app+'/public'+url;}}
global.Image=LocalImage;global.document={createElement:()=>createCanvas(1,1)};
global.window={devicePixelRatio:1,matchMedia:()=>({matches:true})};
let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};
const rows=[];
async function render(goal,age,seenBy=['공격'],floor=0,reducedMotion=true,missing=false){
 missingEffects=missing;
 global.window.matchMedia=()=>({matches:reducedMotion});
 const canvas=createCanvas(1000,700),ctx=canvas.getContext('2d'),calls=[];calls.rings=[];
 const arc=ctx.arc.bind(ctx);ctx.arc=(...args)=>{if(['#e89989','#9ecdb9','#e6c775','#d8b887'].includes(ctx.strokeStyle.toLowerCase()))calls.rings.push(args);return arc(...args);};
 canvas.getBoundingClientRect=()=>({width:1000,height:700,left:0,top:0});canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};
 const drawImage=ctx.drawImage.bind(ctx);ctx.drawImage=(image,...args)=>{if(image.file?.startsWith('/effects/'))calls.push({file:image.file,args});return drawImage(image,...args);};
 let ref=0;const effects=[];React.useRef=value=>({current:ref++===0?canvas:value});React.useEffect=fn=>effects.push(fn);
 const event={type:['death','downed','revive','objective'].includes(goal)?goal:'utility',goal,time:10,message:goal,actor:friend.id,side:'공격',seenBy,position:{...friend.position,floor}};
 const tick={time:10+age,snapshot:{...initial,time:10+age},events:[]};
 BroadcastCanvas({tick,events:[event],map,side:'공격',selectedId:friend.id,mode:'follow',speed:1,paused:true,onSelect:()=>{}});
 const cleanups=effects.map(fn=>fn());frame(performance.now());await new Promise(resolve=>setTimeout(resolve,30));calls.length=0;calls.rings.length=0;frame(performance.now());
 cleanups.forEach(fn=>fn?.());return calls;
}
(async()=>{
 for(const [goal,age] of [['emp-pulse',.8],['camera-deployed',1],['interceptor-deployed',1],['breach-started',2]]){
  const calls=await render(goal,age);assert(calls.length>0,goal+'가 0.65초 이후에도 실제 아틀라스를 그려야 합니다');
  assert.equal((await render(goal,eventEffectDuration({type:'utility',goal})+.001)).length,0,'수명 종료 뒤 제거');
  assert.equal((await render(goal,age,['수비'])).length,0,'미공개 사건 숨김');
  assert.equal((await render(goal,age,['공격'],1)).length,0,'다른 층 사건 숨김');
  assert.equal((await render(goal,-.1)).length,0,'미래 사건 숨김');rows.push({goal,age,draws:calls.length});
 }
 for(const type of ['death','downed','revive','objective']){
  assert((await render(type,.5)).rings.length>0,type+' 결과 표식');
  assert.equal((await render(type,.5,['수비'])).rings.length,0,'미공개 결과 숨김');
  assert.equal((await render(type,1.3)).rings.length,0,'결과 표식 만료');
 }
 for(const goal of ['grenade-exploded','wall-breached']){
  const missing=await render(goal,.2,['공격'],0,true,true);
  assert(missing.rings.length>0,'이미지 미로딩 폭발 대체 표시');
  assert.equal((await render(goal,.7,['공격'],0,true,true)).rings.length,0,'대체 표시도 수명 준수');
  assert.equal((await render(goal,.2,['수비'],0,true,true)).rings.length,0,'미공개 폭발 대체 표시 금지');
 }
 const staticEarly=await render('emp-pulse',.2),staticLate=await render('emp-pulse',.8);
 assert.deepEqual(staticEarly.map(c=>c.args),staticLate.map(c=>c.args),'동작 줄이기에서는 효과 크기 고정');
 const movingEarly=await render('emp-pulse',.2,['공격'],0,false),movingLate=await render('emp-pulse',.8,['공격'],0,false);
 assert.notDeepEqual(movingEarly.map(c=>c.args),movingLate.map(c=>c.args),'일반 모드의 효과 성장 유지');
 fs.writeFileSync('validation/presentation-effects.json',JSON.stringify({kind:'Synthetic events through actual Canvas renderer; not browser play',rows,lifecycleTypes:['death','downed','revive','objective'],guards:['expiry','unseen','other floor','future']},null,2)+'\n');
 console.log('PASS 실제 Canvas 효과 수명 4종·만료·미공개·층·미래 사건');
})().catch(e=>{console.error(e);process.exitCode=1});
