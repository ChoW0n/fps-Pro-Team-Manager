// 실제 엔진 스냅샷을 앱의 SVG 컴포넌트로 정적 렌더합니다. 브라우저 플레이 검사가 아닙니다.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{execFileSync}=require('node:child_process');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const compile=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const React=require(app+'/node_modules/react'),{renderToStaticMarkup}=require(app+'/node_modules/react-dom/server');
const {TacticalBattlefield}=require(app+'/src/components/TacticalBattlefield.tsx');
const {TacticalRealtimeSimulation,realtimeUnitId}=require(app+'/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {BREACHLINE_MAP:map}=require(app+'/src/domain/tacticalMaps.ts');
const {OPERATORS}=require(app+'/src/domain/Operator.ts'),{Player}=require(app+'/src/domain/Player.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('검증 선수 '+index,'검증',operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));
const input={attackers:side('공격'),defenders:side('수비'),seed:41,maxSeconds:180};
const result=new TacticalRealtimeSimulation().run(input),shot=result.events.find(event=>event.type==='shot'&&event.time>10&&/MAGPIE|COLLIER|해동/.test(event.actor));
const snapshot=result.snapshots.find(s=>s.time>=shot.time+.1),focus=snapshot.units.find(unit=>unit.id===shot.actor);
const operators=new Map([...input.attackers,...input.defenders].map((unit,index)=>[realtimeUnitId(unit,index),unit.operator]));
const css=(fs.readFileSync(app+'/src/components/tacticalBroadcast.css','utf8').match(/\.battle-(?:soldier\.is-out|label|room|door-label)\s*\{[^}]*\}/g)??[]).join('\n').replaceAll('var(--display)',"'Noto Sans CJK KR',sans-serif");
for(const mode of ['full','zoom']) {
  const width=mode==='full'?map.width:620,height=mode==='full'?map.height:420;
  const x=mode==='full'?0:Math.max(0,Math.min(map.width-width,focus.position.x-width/2));
  const y=mode==='full'?0:Math.max(0,Math.min(map.height-height,focus.position.y-height/2));
  let svg=renderToStaticMarkup(React.createElement(TacticalBattlefield,{map,units:snapshot.units,operators,events:result.events,time:snapshot.time,objective:snapshot.objective,selectedId:focus.id,onSelect:()=>{},viewBox:`${x} ${y} ${width} ${height}`}));
  svg=svg.slice(svg.indexOf('<svg ')).replace('<svg ',`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="${Math.round(1600*height/width)}" `);
  svg=svg.replace(/href="\/draft-order-player-generator\/operators\/([^"]+)"/g,(_,file)=>{
    const usePng=process.env.DRAFT_REVIEW_PNG==='1';
    const bytes=usePng?execFileSync('convert',[app+'/public/operators/'+file,'png:-']):fs.readFileSync(app+'/public/operators/'+file);
    return `xlink:href="data:image/${usePng?'png':'webp'};base64,${bytes.toString('base64')}"`;
  });
  svg=svg.replaceAll('fill="transparent"','fill="none"');
  svg=svg.replace(/(<svg[^>]+>)/,`$1<style>${css}</style>`);
  fs.writeFileSync(path.join(__dirname,`../validation/tactical-render-${mode}.svg`),svg);
}
fs.writeFileSync(path.join(__dirname,'../validation/tactical-render-source.json'),JSON.stringify({kind:'React server render of actual simulation snapshot; not browser play',seed:41,time:snapshot.time,focus:focus.id,map:map.id},null,2)+'\n');
console.log({time:snapshot.time,focus:focus.callSign});
