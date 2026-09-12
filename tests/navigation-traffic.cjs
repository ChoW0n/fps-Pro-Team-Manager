// 두 방 사이 좁은 문에서 반대 방향으로 이동하는 실제 이동 함수를 검사합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation,UNIT_RADIUS}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {BREACHLINE_MAP}=require(root+'tacticalMaps.ts');
const map={...BREACHLINE_MAP,width:400,height:400,covers:[],searchPoints:[],defenderSetups:[],entrances:[],sites:[],
  attackerSpawn:{x:70,y:200},defenderSpawn:{x:330,y:200},returnPoint:{x:70,y:200},
  attackerRoutes:[{id:'door',label:'문 통과',points:[{x:70,y:200},{x:330,y:200}]}],
  walls:[{id:'top',kind:'interior',from:{x:200,y:0},to:{x:200,y:160}},{id:'bottom',kind:'interior',from:{x:200,y:240},to:{x:200,y:400}}],
  portals:[{id:'door',label:'문',center:{x:200,y:200},width:80,axis:'vertical',fromRoom:'left',toRoom:'right'}],
};
const engine=new TacticalRealtimeSimulation(map),nodes=engine.buildNavigationNodes(map);
const makeUnit=(id,x)=>({id,side:'공격',callSign:id,position:{x,y:200},velocity:{x:0,y:0},facing:0,alive:true,action:'approach',goal:'반대편 이동',routeIndex:id==='left'?0:1});
const me={operator:{stats:{entry:70}},player:{teamSynergy:70}};
const units=[makeUnit('left',70),makeUnit('right',330)],goals=[{x:330,y:200},{x:70,y:200}];
const plans=new Map(),yieldUntil=new Map(),blockedUntil=new Map(),reservations=new Map(),events=[];
let minimum=Infinity,finishedAt=null;
for(let tick=0;tick<600;tick++){
  for(let i=0;i<units.length;i++){
    const unit=units[i],previous={...unit.position};unit.velocity={x:0,y:0};
    if((yieldUntil.get(unit.id)??0)<=tick/10){unit.action='approach';engine.move(unit,goals[i],me,map,tick/10,units,nodes,plans,yieldUntil,blockedUntil,event=>events.push(event),reservations);}
    assert(engine.canTraverse(previous,unit.position,map),'문틀 통과 금지');
  }
  const separation=Math.hypot(units[0].position.x-units[1].position.x,units[0].position.y-units[1].position.y);minimum=Math.min(minimum,separation);
  assert(separation>=UNIT_RADIUS*2,'아군 몸 겹침 금지');
  if(units.every((unit,i)=>Math.hypot(unit.position.x-goals[i].x,unit.position.y-goals[i].y)<24)){finishedAt=tick/10;break;}
}
const report={finishedAt,minimum,positions:units.map(unit=>unit.position),reservations:events.filter(event=>event.goal.includes('문 통과')).length};
fs.writeFileSync(require('node:path').join(__dirname,'../validation/navigation-traffic-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);assert(finishedAt!==null,'양방향 통과가 60초 안에 끝나야 합니다');

// 통과 도중 다른 임무로 이탈해 경로가 끝나면 사격 금지 상태가 남지 않아야 합니다.
for(const downed of [undefined,{mode:'stabilize'}]){
 const unit={...makeUnit('interrupted',70),downed,traversal:{portalId:'door',kind:'window',until:1},locomotion:'vault'};
 engine.move(unit,unit.position,me,map,2,[unit],nodes,new Map(),new Map(),new Map(),()=>{});
 assert.equal(unit.traversal,undefined,'완료된 경로의 통과 상태 해제');
 assert.equal(unit.locomotion,downed?'crawl':'walk','다운 이동 제약 보존');
}
console.log('PASS interrupted traversal releases movement and firing lock');
