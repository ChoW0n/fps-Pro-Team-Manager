// 실제 Canvas 중계 컴포넌트를 로컬 Skia에 그립니다. 브라우저·아이폰 플레이가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const compile=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const {createCanvas,Image}=require('@napi-rs/canvas'),React=require(app+'/node_modules/react');
const {TacticalRealtimeSimulation,realtimeUnitId}=require(app+'/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {NAMSAN_MAP:map}=require(app+'/src/domain/tacticalMaps.ts');const {OPERATORS}=require(app+'/src/domain/Operator.ts'),{Player}=require(app+'/src/domain/Player.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('검사'+index,'선수'+index,operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));
const input={attackers:side('공격'),defenders:side('수비'),seed:41,maxSeconds:180,scoutPlan:{indices:[],seconds:25,entryRoute:0}};
const result=new TacticalRealtimeSimulation().run(input);
// 이전 교착 수정 뒤 달라진 실제 경기에서 자세별 사건을 찾습니다. 상태를 조작하지 않습니다.
const injuryFixtures=[result];
const shot=result.events.filter(event=>event.type==='shot'&&event.side==='공격').sort((a,b)=>Math.hypot(a.targetPosition.x-a.position.x,a.targetPosition.y-a.position.y)-Math.hypot(b.targetPosition.x-b.position.x,b.targetPosition.y-b.position.y))[0];
if(!shot)throw Error('실제 발사 없음');const tick={time:shot.time,snapshot:result.snapshots.find(snapshot=>snapshot.time===shot.time),events:[]};
const output=process.env.DRAFT_REVIEW_DIR??path.resolve(__dirname,'../validation');fs.mkdirSync(output,{recursive:true});
const decoded=path.join(output,'.canvas-decoded');fs.mkdirSync(decoded,{recursive:true});
// Skia 바인딩이 일부 정상 PNG/WebP를 거부해 테스트에서만 재인코딩합니다. 배포 원본은 수정하지 않습니다.
execFileSync('python3',['-c',`from PIL import Image\nfrom pathlib import Path\ns=Path(${JSON.stringify(app+'/public/operators')});d=Path(${JSON.stringify(decoded)})\nfor p in s.glob('minimal-*.png'):\n Image.open(p).verify()\n Image.open(p).save(d/(p.stem+'.png'))`]);
// 디코드한 파일명도 기록하여 새 자세의 실제 drawImage 호출을 검증합니다.
class LocalImage extends Image {set src(url){const name=url.split('/').at(-1),png=path.join(decoded,name.replace(/\.webp$/,'.png'));this.assetName=name;super.src=url.includes('/effects/')?app+'/public/effects/'+name:fs.existsSync(png)?png:app+'/public/operators/'+(url.includes('/weapons/top/')?'weapons/top/':url.includes('/weapons/')?'weapons/':'')+name;}}
global.Image=LocalImage;global.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};global.document={createElement:()=>createCanvas(1,1)};
let callback;global.requestAnimationFrame=fn=>{callback=fn;return 1;};global.cancelAnimationFrame=()=>{};
const weaponRenderer=require(app+'/src/components/weaponParts.ts'),paintWeapon=weaponRenderer.paintWeaponPart;let weaponDraws=0;weaponRenderer.paintWeaponPart=(...args)=>{const drawn=paintWeapon(...args);if(drawn)weaponDraws++;return drawn;};
const minimal=require(app+'/src/components/minimalOperator.ts'),paintOperator=minimal.paintMinimalOperator;let recordOperator=()=>{};minimal.paintMinimalOperator=(...args)=>{const result=paintOperator(...args);recordOperator(args[0],args[1]);return result;};
const {BroadcastCanvas,canvasSize}=require(app+'/src/components/BroadcastCanvas.tsx');const rows=[];
const {operatorStateVisual}=require(app+'/src/domain/operatorVisuals.ts');
// Skia의 이미지 디코드 콜백이 끝난 뒤 실제 인물 픽셀까지 포함해 프레임 시간을 잽니다.
(async()=>{for(const [name,width,height,ratio=1] of [['desktop',1280,720],['phone',390,844],['phone-landscape',844,390],['downed',1280,720],['collier-downed',1280,720],['collier-crawl',1280,720],['walk',1280,720],['crouch',1280,720],['team-visibility',1280,720],['tactical',1280,720],['phone-touch',390,844,3],['phone-small',360,800,2],['phone-large',430,932,3],['phone-android',412,915,2.625],['phone-retina-landscape',844,390,3],['tablet',1024,1366,2]]){
 weaponDraws=0;
 const touch=name.startsWith('phone');global.window={devicePixelRatio:ratio,matchMedia:query=>({matches:touch&&query.includes('pointer: coarse')})};let pointer;const centers=[];let selected=null;
 let rectWidth=width,rectHeight=height;const canvas=createCanvas(width,height);canvas.getBoundingClientRect=()=>({width:rectWidth,height:rectHeight,left:0,top:0});canvas.addEventListener=(type,fn)=>{if(type==='pointerup')pointer=fn;};canvas.removeEventListener=()=>{};
 const context=canvas.getContext('2d');let operatorDraws=0;const drawnIds=new Set();
 recordOperator=(ctx,unit)=>{operatorDraws++;drawnIds.add(unit.id);const t=ctx.getTransform();centers.push({x:(t.a*unit.position.x+t.c*unit.position.y+t.e)*width/canvas.width,y:(t.b*unit.position.x+t.d*unit.position.y+t.f)*height/canvas.height});};
 const effects=[],refs=[];let index=0;
 React.useRef=value=>{const ref={current:index++===0?canvas:value};refs.push(ref);return ref;};React.useEffect=fn=>effects.push(fn);
 const casualty=u=>u.side==='공격'&&u.downed&&(!name.startsWith('collier-')||u.callSign==='COLLIER')
   &&(name!=='collier-downed'||u.downed.mode==='stabilize')
   &&(name!=='collier-crawl'||u.downed.mode==='crawl'&&Math.hypot(u.velocity.x,u.velocity.y)>.01);
 const needsInjury=name==='downed'||name.startsWith('collier-');
 let injuryResult=result,injurySnapshot=needsInjury?result.snapshots.find(s=>s.units.some(casualty)):undefined;
 if(needsInjury&&!injurySnapshot){for(let index=0;index<40&&!injurySnapshot;index++){injuryFixtures[index]??=new TacticalRealtimeSimulation().run({...input,seed:41+index});injuryResult=injuryFixtures[index];injurySnapshot=injuryResult.snapshots.find(s=>s.units.some(casualty));}}
 if(needsInjury)assert(injurySnapshot,'실제 다운/기어가는 장면 필요: '+name);
 const walking=(unit,time)=>unit.side==='공격'&&operatorStateVisual(unit,time)?.sprite.endsWith(name==='crouch'?'-crouch-v1.webp':'-walk-v1.webp');
 const walkSnapshot=name==='walk'||name==='crouch'?result.snapshots.find(s=>s.units.some(u=>walking(u,s.time))):undefined;
 if(name==='walk'||name==='crouch')assert(walkSnapshot,'실제 전진 보행 장면 필요: '+name);
 const selectedSnapshot=name==='team-visibility'?result.snapshots[0]:walkSnapshot??injurySnapshot;
 const renderedTick=selectedSnapshot?{time:selectedSnapshot.time,snapshot:selectedSnapshot,events:[]}:tick;
 const viewed=name==='team-visibility'?result.snapshots[0].units[0].id:walkSnapshot?.units.find(u=>walking(u,walkSnapshot.time))?.id??injurySnapshot?.units.find(casualty)?.id??shot.actor;
 BroadcastCanvas({tick:renderedTick,events:needsInjury?injuryResult.events:result.events,map,side:'공격',selectedId:viewed,mode:name==='tactical'?'full':'follow',speed:1,paused:true,onSelect:id=>{selected=id;}});
 const cleanup=effects.map(fn=>fn());const times=[];let stamp=performance.now();
 // 첫 프레임에서 이미지 요청이 시작됩니다. 그 전에 기다리면 빈 스프라이트를 검사하게 됩니다.
 callback(stamp+=16.67);await new Promise(resolve=>setTimeout(resolve,50));
 for(let frame=0;frame<45;frame++){const started=performance.now();callback(stamp+=16.67);if(frame>=15)times.push(performance.now()-started);}
 assert.equal(canvas.width,canvasSize(width,height,ratio).width);assert.equal(canvas.height,canvasSize(width,height,ratio).height);assert(canvas.width*canvas.height<=4_000_000);if(ratio>1)assert(canvas.width>width,'고밀도 화면을 DPR 1로 열화시키지 않음');
 const armedVisible=renderedTick.snapshot.units.some(unit=>drawnIds.has(unit.id)&&unit.alive&&!unit.downed);
 if(armedVisible)assert(weaponDraws>0,`${name}: 새 PNG 총기가 실제로 그려져야 합니다`);
 else assert.equal(weaponDraws,0,`${name}: 다운 선수에게 파지 총기를 표시하지 않음`);
 assert(operatorDraws>0,`${name}: 실제 인물 합성기가 호출되어야 합니다`);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;assert(new Set(pixels).size>20,'비어 있는 지도나 단색 화면을 통과시키지 않습니다');
 if(name==='team-visibility'){assert(operatorDraws>=45*5,'아군 다섯 명이 매 프레임 표시되어야 합니다');for(const unit of renderedTick.snapshot.units.filter(u=>u.side==='공격'))assert(drawnIds.has(unit.id));}
 if(touch){
  // 실제 pointerup 경로를 검사합니다. DPR=3이어도 빈 곳 60~100 CSS px 바깥은 선택하지 않습니다.
  let blank;
  for(let x=10;x<width&&!blank;x+=10)for(let y=10;y<height;y+=10){const distance=Math.min(...centers.map(p=>Math.hypot(x-p.x,y-p.y)));if(distance>60&&distance<100){blank={x,y};break;}}
  assert(blank,'선수 주변의 빈 터치 지점 필요');pointer({clientX:blank.x,clientY:blank.y});assert.equal(selected,null,'DPR 때문에 멀리 있는 선수를 선택하면 안 됩니다');
  const center=centers.find(p=>p.x>0&&p.x<width&&p.y>0&&p.y<height);assert(center);pointer({clientX:center.x,clientY:center.y});assert(selected,'선수 중심 터치로 선택해야 합니다');
 }
 const file=path.join(output,`broadcast-canvas-${name}.png`);fs.writeFileSync(file,canvas.toBuffer('image/png'));const backingWidth=canvas.width,backingHeight=canvas.height;
 if(name==='phone-touch'){
  // 동일 컴포넌트를 유지한 채 주소창 높이·회전·모니터 DPR 변경을 반영합니다.
  for(const [rw,rh,dpr] of [[844,390,3],[390,780,3],[390,844,2]]){
   rectWidth=rw;rectHeight=rh;window.devicePixelRatio=dpr;callback(stamp+=16.67);
   assert.equal(canvas.width,rw*dpr);assert.equal(canvas.height,rh*dpr);
   assert(new Set(context.getImageData(0,0,canvas.width,canvas.height).data).size>20,'회전 뒤 빈 화면 금지');
  }
 }
 cleanup.forEach(fn=>fn?.());times.sort((a,b)=>a-b);
 rows.push({name,width,height,dpr:ratio,backingWidth,backingHeight,medianMs:+times[Math.floor(times.length/2)].toFixed(2),p95Ms:+times[Math.floor(times.length*.95)].toFixed(2),file:path.basename(file)});
}
fs.writeFileSync(path.join(output,'broadcast-canvas-review.json'),JSON.stringify({kind:'Actual Canvas renderer in local Skia; not browser or iPhone performance validation',seed:41,time:shot.time,rows},null,2)+'\n');console.log(rows);
for(const file of fs.readdirSync(decoded))fs.unlinkSync(path.join(decoded,file));fs.rmdirSync(decoded);
})().catch(error=>{console.error(error);process.exitCode=1;});
