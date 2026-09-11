// 실제 Canvas 중계 컴포넌트를 로컬 Skia에 그립니다. 브라우저·아이폰 플레이가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const compile=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const {createCanvas,Image}=require('@napi-rs/canvas'),React=require(app+'/node_modules/react');
const {TacticalRealtimeSimulation,realtimeUnitId}=require(app+'/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {BREACHLINE_MAP:map}=require(app+'/src/domain/tacticalMaps.ts');const {OPERATORS}=require(app+'/src/domain/Operator.ts'),{Player}=require(app+'/src/domain/Player.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('검사'+index,'선수'+index,operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));
const input={attackers:side('공격'),defenders:side('수비'),seed:41,maxSeconds:180,scoutPlan:{indices:[],seconds:25,entryRoute:0}};
const result=new TacticalRealtimeSimulation().run(input);
const shot=result.events.filter(event=>event.type==='shot'&&event.side==='공격').sort((a,b)=>Math.hypot(a.targetPosition.x-a.position.x,a.targetPosition.y-a.position.y)-Math.hypot(b.targetPosition.x-b.position.x,b.targetPosition.y-b.position.y))[0];
if(!shot)throw Error('실제 발사 없음');const tick={time:shot.time,snapshot:result.snapshots.find(snapshot=>snapshot.time===shot.time),events:[]};
const output=process.env.DRAFT_REVIEW_DIR??path.resolve(__dirname,'../validation');fs.mkdirSync(output,{recursive:true});
const decoded=path.join(output,'.canvas-decoded');fs.mkdirSync(decoded,{recursive:true});
// Skia 바인딩이 일부 정상 PNG/WebP를 거부해 테스트에서만 재인코딩합니다. 배포 원본은 수정하지 않습니다.
execFileSync('python3',['-c',`from PIL import Image\nfrom pathlib import Path\ns=Path(${JSON.stringify(app+'/public/operators')});d=Path(${JSON.stringify(decoded)})\nfor p in s.iterdir():\n if p.suffix in ('.webp','.png'):\n  Image.open(p).verify()\n  Image.open(p).save(d/(p.stem+'.png'))`]);
// 디코드한 파일명도 기록하여 새 자세의 실제 drawImage 호출을 검증합니다.
class LocalImage extends Image {set src(url){const name=url.split('/').at(-1),png=path.join(decoded,name.replace(/\.webp$/,'.png'));this.assetName=name;super.src=fs.readFileSync(fs.existsSync(png)?png:app+'/public/operators/'+name);}}
global.Image=LocalImage;global.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};global.document={createElement:()=>createCanvas(1,1)};
let callback;global.requestAnimationFrame=fn=>{callback=fn;return 1;};global.cancelAnimationFrame=()=>{};
const {BroadcastCanvas}=require(app+'/src/components/BroadcastCanvas.tsx');const rows=[];
// Skia의 이미지 디코드 콜백이 끝난 뒤 실제 인물 픽셀까지 포함해 프레임 시간을 잽니다.
(async()=>{for(const [name,width,height] of [['desktop',1280,720],['phone',390,844],['phone-landscape',844,390],['downed',1280,720],['collier-downed',1280,720],['collier-crawl',1280,720]]){
 const canvas=createCanvas(width,height);canvas.getBoundingClientRect=()=>({width,height,left:0,top:0});canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};
 const context=canvas.getContext('2d'),originalDraw=context.drawImage.bind(context);let spriteDraws=0,downedPoseDraws=0,crawlPoseDraws=0;
 // 실제 인물 drawImage가 호출되지 않으면 빈 화면을 통과시키지 않습니다.
 context.drawImage=(source,...args)=>{if(source instanceof LocalImage){spriteDraws++;if(source.assetName==='collier-downed-v3.webp')downedPoseDraws++;if(source.assetName==='collier-downed-crawl-v1.webp')crawlPoseDraws++;const transform=context.getTransform();assert(Math.abs(Math.hypot(transform.a,transform.b)-Math.hypot(transform.c,transform.d))<1e-6,'전신 원화의 비균등 압축 금지');}return originalDraw(source,...args);};
 const effects=[],refs=[];let index=0;
 React.useRef=value=>{const ref={current:index++===0?canvas:value};refs.push(ref);return ref;};React.useEffect=fn=>effects.push(fn);
 const casualty=u=>u.side==='공격'&&u.downed&&(!name.startsWith('collier-')||u.callSign==='COLLIER')
   &&(name!=='collier-downed'||u.downed.mode==='stabilize')
   &&(name!=='collier-crawl'||u.downed.mode==='crawl'&&Math.hypot(u.velocity.x,u.velocity.y)>.01);
 const needsInjury=name==='downed'||name.startsWith('collier-');
 const injurySnapshot=needsInjury?result.snapshots.find(s=>s.units.some(casualty)):undefined;
 if(needsInjury)assert(injurySnapshot,'실제 다운/기어가는 장면 필요: '+name);
 const renderedTick=injurySnapshot?{time:injurySnapshot.time,snapshot:injurySnapshot,events:[]}:tick;
 const viewed=injurySnapshot?.units.find(casualty)?.id??shot.actor;
 BroadcastCanvas({tick:renderedTick,events:result.events,map,side:'공격',selectedId:viewed,mode:'follow',speed:1,paused:true,onSelect:()=>{}});
 const cleanup=effects.map(fn=>fn());const times=[];let stamp=performance.now();
 // 첫 프레임에서 이미지 요청이 시작됩니다. 그 전에 기다리면 빈 스프라이트를 검사하게 됩니다.
 callback(stamp+=16.67);await new Promise(resolve=>setTimeout(resolve,50));
 for(let frame=0;frame<45;frame++){const started=performance.now();callback(stamp+=16.67);if(frame>=15)times.push(performance.now()-started);}
 assert(spriteDraws>0,`${name}: 인물 이미지가 실제로 그려져야 합니다`);
 if(name==='collier-downed')assert(downedPoseDraws>0,'실제 다운 상태에서 검수한 다운 프레임을 그려야 합니다');
 if(name==='collier-crawl')assert(crawlPoseDraws>0,'실제 다운 이동 상태에서 행동 시트를 그려야 합니다');
 const file=path.join(output,`broadcast-canvas-${name}.png`);fs.writeFileSync(file,canvas.toBuffer('image/png'));cleanup.forEach(fn=>fn?.());times.sort((a,b)=>a-b);
 rows.push({name,width,height,medianMs:+times[Math.floor(times.length/2)].toFixed(2),p95Ms:+times[Math.floor(times.length*.95)].toFixed(2),file:path.basename(file)});
}
fs.writeFileSync(path.join(output,'broadcast-canvas-review.json'),JSON.stringify({kind:'Actual Canvas renderer in local Skia; not browser or iPhone performance validation',seed:41,time:shot.time,rows},null,2)+'\n');console.log(rows);
for(const file of fs.readdirSync(decoded))fs.unlinkSync(path.join(decoded,file));fs.rmdirSync(decoded);
})().catch(error=>{console.error(error);process.exitCode=1;});
