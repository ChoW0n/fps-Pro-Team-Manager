// 실제 엔진 스냅샷을 앱의 SVG 컴포넌트로 정적 렌더합니다. 브라우저 플레이 검사가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{execFileSync}=require('node:child_process');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const compile=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const React=require(app+'/node_modules/react'),{renderToStaticMarkup}=require(app+'/node_modules/react-dom/server');
const {combatCamera}=require(app+'/src/domain/realtime/spectatorView.ts');
const {TacticalBattlefield}=require(app+'/src/components/TacticalBattlefield.tsx');
const {TacticalRealtimeSimulation,realtimeUnitId}=require(app+'/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {NAMSAN_MAP:map}=require(app+'/src/domain/tacticalMaps.ts');
const {OPERATORS}=require(app+'/src/domain/Operator.ts'),{Player}=require(app+'/src/domain/Player.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('검증 선수 '+index,'검증',operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));
const input={attackers:side('공격'),defenders:side('수비'),seed:41,maxSeconds:180,scoutPlan:{indices:[0,1],seconds:40,entryRoute:0},defenseStyle:'crossfire',anticipatedEntry:0};
const result=new TacticalRealtimeSimulation().run(input),shot=result.events.filter(event=>event.type==='shot'&&event.side==='공격').sort((a,b)=>Math.hypot(a.targetPosition.x-a.position.x,a.targetPosition.y-a.position.y)-Math.hypot(b.targetPosition.x-b.position.x,b.targetPosition.y-b.position.y))[0]??result.events.find(event=>event.type==='shot');
const snapshot=result.snapshots.find(s=>s.time>=shot.time),focus=snapshot.units.find(unit=>unit.id===shot.actor);
const operators=new Map([...input.attackers,...input.defenders].map((unit,index)=>[realtimeUnitId(unit,index),unit.operator]));
const output=process.env.DRAFT_REVIEW_DIR??path.join(__dirname,'../validation');fs.mkdirSync(output,{recursive:true});
const embedded=new Map();
const css=(fs.readFileSync(app+'/src/components/tacticalBroadcast.css','utf8').match(/\.battle-(?:soldier\.is-out|label|room|door-label)\s*\{[^}]*\}/g)??[]).join('\n').replaceAll('var(--display)',"'Noto Sans CJK KR',sans-serif");
for(const mode of ['full','zoom']) {
  const framing=combatCamera(snapshot.units,result.events.filter(event=>event.time<=snapshot.time),'공격',snapshot.time,focus.id);
  const width=mode==='full'?map.width:framing.width,height=mode==='full'?map.height:framing.width/1.65;
  const x=mode==='full'?0:Math.max(0,Math.min(map.width-width,framing.x-width/2));
  const y=mode==='full'?0:Math.max(0,Math.min(map.height-height,framing.y-height/2));
  let svg=renderToStaticMarkup(React.createElement(TacticalBattlefield,{map,units:snapshot.units,operators,events:result.events,time:snapshot.time,objective:snapshot.objective,gadgets:snapshot.gadgets,breaches:snapshot.breaches,selectedId:focus.id,onSelect:()=>{},viewBox:`${x} ${y} ${width} ${height}`}));
  svg=svg.slice(svg.indexOf('<svg ')).replace('<svg ',`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="${Math.round(1600*height/width)}" `);
  svg=svg.replace(/href="\/draft-order-player-generator\/operators\/([^"]+)"/g,(_,file)=>{
    const usePng=process.env.DRAFT_REVIEW_PNG==='1';
    if(!usePng)return `xlink:href="../artifacts/draft-order-player-generator/public/operators/${file}"`;
    if(!embedded.has(file))embedded.set(file,execFileSync('convert',[app+'/public/operators/'+file,'png:-'],{maxBuffer:8*1024*1024}).toString('base64'));
    return `xlink:href="data:image/png;base64,${embedded.get(file)}"`;
  });
  svg=svg.replaceAll('fill="transparent"','fill="none"');
  svg=svg.replace(/(<svg[^>]+>)/,`$1<style>${css}</style>`);
  fs.writeFileSync(path.join(output,`tactical-render-${mode}.svg`),svg);
}
fs.writeFileSync(path.join(output,'tactical-render-source.json'),JSON.stringify({kind:'React server render of actual simulation snapshot; not browser play',seed:41,time:snapshot.time,focus:focus.id,map:map.id},null,2)+'\n');
console.log({time:snapshot.time,focus:focus.callSign,range:Math.hypot(shot.targetPosition.x-shot.position.x,shot.targetPosition.y-shot.position.y),result:result.winner});
