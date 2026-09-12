// 실제 전자장비 위치·시간·차폐와 엔진 편성 연결을 검사합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {resolveElectronicCounters,gadgetActive,poweredWall}=require(root+'realtime/gadgetRules.ts');
const {weaponHandling,shotCone,estimatedShotQuality}=require(root+'realtime/weaponHandling.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{NAMSAN_MAP:map}=require(root+'tacticalMaps.ts');
const rows=[];function check(name,fn){fn();rows.push({name,pass:true});console.log('PASS',name);}
const device=(id,kind,side='수비',x=0)=>({id,kind,side,owner:id,position:{x,y:0},activeAt:0,until:100,radius:220,charges:2,wallId:'wall'});
const thrown=(id,kind='smoke')=>({...device(id,kind,'공격'),activeAt:1,landedAt:1,thrownAt:0,from:{x:-100,y:0}});
check('두 발 요격은 차폐·적대 관계·비행 시간·잔량을 요구',()=>{
 const interceptor=device('i','interceptor'),a=thrown('a'),b=thrown('b'),c=thrown('c'),all=[interceptor,a,b,c];
 assert.equal(resolveElectronicCounters(all,.5,()=>false).length,0);assert.equal(all.length,4);
 assert.equal(resolveElectronicCounters(all,.5,()=>true).length,2);assert.equal(interceptor.charges,0);assert.equal(all.length,2);
 const smoke={...thrown('active'),activeAt:0,landedAt:0};assert.equal(resolveElectronicCounters([device('i','interceptor'),smoke],.5,()=>true).length,0);
});
check('EMP는 벽 너머 아군 포함 전자장비를 8초 정지하고 자동 복구',()=>{
 const power=device('p','power'),friendly=device('d','drone','공격'),emp={...thrown('e','emp'),radius:280};
 const all=[power,friendly,emp];assert(poweredWall(all,'wall',.5));resolveElectronicCounters(all,1,()=>false);
 assert(!poweredWall(all,'wall',8.9));assert(poweredWall(all,'wall',9));assert(!gadgetActive(friendly,5));assert(!all.includes(emp));
});
check('요격된 EMP는 전력 노드를 정지시키지 못함',()=>{
 const power=device('p','power'),all=[device('i','interceptor'),power,thrown('e','emp')];resolveElectronicCounters(all,.5,()=>true);resolveElectronicCounters(all,1,()=>true);assert(gadgetActive(power,1));
});
check('30m 고숙련 SMG의 예상 효율이 중숙련 DMR보다 낮으며 거리 낙차는 연속적',()=>{
 const quality=(name,skill,range)=>{const p=weaponHandling(name);return estimatedShotQuality(range,shotCone(p,skill,0,1,1,range),1);};
 assert(quality('MP5SD',.99,1200)<quality('PSG-1 정밀소총',.5,1200)*.25);
 assert(quality('HK416',.8,601)<=quality('HK416',.8,600));assert(Math.abs(quality('HK416',.8,601)-quality('HK416',.8,600))<.01);
});
function member(name){const operator=OPERATORS.find(o=>o.callSign===name);return {operator,side:operator.side,teamName:operator.side,player:new Player(name,name,operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)};}
class CounterArena extends TacticalRealtimeSimulation{
 startPosition(u){return u.operator.callSign==='MEDVED'?{x:1960,y:1560}:u.operator.callSign==='해동'?{x:2030,y:1510}:{x:1884,y:1560};}
}
const terrain={...map,walls:map.walls.map(w=>w.id==='outer-east-2'?{...w,reinforced:true}:w)};
check('실제 성곽 전력 설치는 MEDVED를 멈추고 해동 EMP 이후 보강 통로 개방',()=>{
 const input={attackers:[member('MEDVED')],defenders:[member('성곽')],map:terrain,seed:18,maxSeconds:12};
 const blocked=new CounterArena().run(input);assert(blocked.events.some(e=>e.goal==='power-deployed'));assert(blocked.events.some(e=>e.goal==='breach-blocked-power'));assert(!blocked.events.some(e=>e.goal==='wall-breached'));
 const supported={...input,attackers:[member('MEDVED'),member('해동')]},arena=new CounterArena(),result=arena.run(supported);
 const pulse=result.events.find(e=>e.goal==='emp-pulse'),breach=result.events.find(e=>e.goal==='wall-breached');assert(pulse&&breach,JSON.stringify(result.events.filter(e=>e.type==='utility').map(e=>({time:e.time,goal:e.goal,actor:e.actor,pos:e.position}))));assert(breach.time-pulse.time>=3.8&&breach.time-pulse.time<8);
 const session=arena.createSession(supported);while(!session.isComplete)session.step();assert.deepEqual(session.getResult(),result);
});
check('A/B 각각 세 개 실제 입구는 모든 외부 진입로에서 통행 가능',()=>{
 const arena=new TacticalRealtimeSimulation();const nodes=arena.buildNavigationNodes(map);
 for(const site of map.sites){assert.equal(site.approaches.length,3);assert.equal(new Set(site.approaches.map(a=>a.id)).size,3);
  for(const approach of site.approaches){assert(arena.canStand(approach.point,map));assert(arena.findPath(approach.point,site.plantAnchors[0],map,nodes).length,site.id+approach.id);
   for(const entrance of map.entrances)assert(arena.findPath(entrance.inside,approach.point,map,nodes).length,entrance.id+approach.id);
  }
 }
});
check('SAVELLI는 실제 2초 설치 후 두 발 요격기를 남김',()=>{
 class Arena extends TacticalRealtimeSimulation{startPosition(u){return u.side==='공격'?{x:2250,y:1750}:{x:800,y:450};}}
 const result=new Arena().run({attackers:[member('AUBERT')],defenders:[member('SAVELLI')],seed:7,maxSeconds:5});
 const deployed=result.events.find(e=>e.goal==='interceptor-deployed');assert(deployed);assert(deployed.time>=2);
 const device=result.snapshots.flatMap(s=>s.gadgets).find(g=>g.kind==='interceptor');assert(device);assert.equal(device.charges,2);assert.equal(device.radius,220);
});
check('이동 드론은 통행 가능한 지형만 이동하고 스냅샷 위치를 보존',()=>{
 class DroneArena extends TacticalRealtimeSimulation{startPosition(u){return u.side==='공격'?{x:2250,y:1750}:{x:800,y:450};}}
 const arena=new DroneArena(),result=arena.run({attackers:[member('AUBERT')],defenders:[member('BRANDT')],seed:7,maxSeconds:8});
 const drones=result.snapshots.flatMap(s=>s.gadgets.filter(g=>g.kind==='drone'));assert(drones.length);assert(new Set(drones.map(d=>d.position.x+':'+d.position.y)).size>10);
 for(let i=1;i<drones.length;i++)assert(arena.canTraverse(drones[i-1].position,drones[i].position,map));
 const deployed=result.events.find(e=>e.goal==='drone-deployed');assert(deployed);assert.deepEqual(drones[0].position,deployed.position);assert.notDeepEqual(drones.at(-1).position,drones[0].position);
});
fs.writeFileSync('validation/tactical-counters.json',JSON.stringify({tests:rows,passed:rows.length,limits:'Deterministic engine checks, not browser play or completed balance calibration.'},null,2)+'\n');
