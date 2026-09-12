// 설치된 TypeScript만 사용해 실제 앱 엔진을 Node에서 재실행합니다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  });
  module._compile(output.outputText, filename);
};
const root = '../artifacts/draft-order-player-generator/src/';
const { TacticalRealtimeSimulation, realtimeUnitId, UNIT_RADIUS, updateIdentifiedOperators } = require(root + 'domain/realtime/TacticalRealtimeSimulation.ts');
const { Player } = require(root + 'domain/Player.ts');
const { OPERATORS } = require(root + 'domain/Operator.ts');
const { BREACHLINE_MAP } = require(root + 'domain/tacticalMaps.ts');
const { muzzlePosition, operatorVisual, OPERATOR_SCALE } = require(root + 'domain/operatorVisuals.ts');
const { angleDifference, turnTowards, TURN_SPEED, FOCUS_RANGE, PERIPHERAL_RANGE } = require(root + 'domain/realtime/perception.ts');
const results = [];
// 고정 선수 입력을 만들어 생성기 난수와 엔진 난수를 분리합니다.
function entry(operator, index, side = operator.side) {
  return { operator, side, teamName: side, player: new Player(`선수${index}`, `검사${index}`, operator.role, 20,
    75,75,75,75,75,[operator],20,75,65,70,70,70,70) };
}
function fixture(seed=41, seconds=90) {
  return { attackers: OPERATORS.filter(o=>o.side==='공격').slice(0,5).map((o,i)=>entry(o,i)),
    defenders: OPERATORS.filter(o=>o.side==='수비').slice(0,5).map((o,i)=>entry(o,i+5)), seed, maxSeconds:seconds };
}
function test(name, fn) {
  const started = performance.now();
  try { fn(); results.push({name, pass:true, ms:Math.round(performance.now()-started)}); console.log('PASS', name); }
  catch(error) { results.push({name, pass:false, error:error.message}); console.error('FAIL',name,error.message); }
}
const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let base;
test('실제 5대5 엔진 목표 판정으로 종료',()=>{base=new TacticalRealtimeSimulation().run(fixture());assert(base.snapshots.length>0); assert(base.executionTime<=142); assert.equal(base.objective.phase,'resolved');});
test('같은 시드: run / createSession 사건·스냅샷·결과 동일',()=>{
  const session=new TacticalRealtimeSimulation().createSession(fixture());
  for(let i=0;i<2000&&!session.isComplete;i++) session.step();
  assert.deepEqual(session.getResult(),base);
});
test('같은 명령 틱: generator / session 동일',()=>{
  const input=fixture(51,20), engine=new TacticalRealtimeSimulation();
  const runner=engine.runTicks(input), session=engine.createSession(input);
  let next=runner.next();session.step();
  for(let i=1;i<220&&!next.done;i++){
    const command=i===15?{side:'공격',mode:'retreat',label:'복귀 검사'}:undefined;
    next=runner.next(command);session.step(command);
  }
  assert.deepEqual(next.value,session.getResult());
  assert.equal(next.value.events.filter(e=>e.actor==='director'&&e.type==='objective').length,1);
});
test('모든 초기 배치와 이동 선분이 벽·엄폐 반경 밖',()=>{
  const engine=new TacticalRealtimeSimulation();
  for(let i=0;i<base.snapshots.length;i++)for(const u of base.snapshots[i].units){
    assert(engine.canStand(u.position,BREACHLINE_MAP),`illegal ${u.callSign} ${JSON.stringify(u.position)}`);
    if(i)assert(engine.canTraverse(base.snapshots[i-1].units.find(v=>v.id===u.id).position,u.position,BREACHLINE_MAP),`cross ${u.callSign}`);
  }
});
test('아군 몸 지름 24 이상 유지',()=>{
  for(const s of base.snapshots)for(let i=0;i<s.units.length;i++)for(let j=i+1;j<s.units.length;j++){
    const a=s.units[i],b=s.units[j];
    if(a.alive&&b.alive&&a.side===b.side) assert(distance(a.position,b.position)>=UNIT_RADIUS*2-1e-6,`overlap ${s.time}: ${a.callSign}/${b.callSign}`);
  }
});
test('사망자 이동·발사·장전 재개 금지',()=>{
  for(const event of base.events.filter(e=>e.type==='death')){
    const states=base.snapshots.filter(s=>s.time>=event.time).map(s=>s.units.find(u=>u.id===event.target));
    for(const u of states){assert.equal(u.action,'dead');assert.deepEqual(u.position,states[0].position);assert.equal(u.hp,0);}
    assert(!base.events.some(e=>e.actor===event.target&&e.time>=event.time&&['shot','reload'].includes(e.type)));
  }
});
test('탄창 소모·장전·탄약 보존 및 장전 중 사격 금지',()=>{
  let count=0;
  const input=fixture(81,45);
  [...input.attackers,...input.defenders].forEach(u=>{u.operator={...u.operator,firearms:['C14 팀버울프']};});
  for(const unit of [...input.attackers,...input.defenders])unit.player={...unit.player,aim:0,mastery:0,composure:0,aggression:40};
  input.map={...BREACHLINE_MAP,walls:[],covers:[]};input.maxSeconds=60;
  class ReloadArena extends TacticalRealtimeSimulation {
    startPosition(unit,index,count){return {x:1000+(unit.side==='공격'?index:index-count)*90,y:unit.side==='공격'?900:1600};}
    startFacing(unit){return unit.side==='공격'?Math.PI/2:-Math.PI/2;}
  }
  // 장전 검사만 무피해 사격장으로 고정합니다. 명중·부상은 별도 실제 피해 검사에서 확인합니다.
  const profile=require(root+'domain/realtime/weaponHandling.ts').weaponHandling('C14 팀버울프');
  const damage=profile.damage;let reloadRun;
  try{profile.damage=0;reloadRun=new ReloadArena().run(input);}finally{profile.damage=damage;}
  for(const [index, first] of reloadRun.snapshots[0].units.entries()){
    for(const snap of reloadRun.snapshots){const u=snap.units[index]; const shots=reloadRun.events.filter(e=>e.type==='shot'&&e.actor===u.id&&e.time<=snap.time).length;
      assert.equal(u.ammo+u.reserveAmmo+shots,first.magazineSize+first.reserveAmmo);assert(u.ammo>=0&&u.ammo<=u.magazineSize);
      if(u.reloadRemaining>0){count++;assert(!reloadRun.events.some(e=>e.type==='shot'&&e.actor===u.id&&e.time===snap.time));}
    }
  }
  assert(count>0,'장전 상황이 검증 입력에서 발생하지 않음');
});
test('발사 원점 = 동일 틱의 회전된 실제 총구',()=>{
  const engine=new TacticalRealtimeSimulation();
  for(const e of base.events.filter(e=>e.type==='shot')){
    const u=base.snapshots.find(s=>s.time===e.time).units.find(u=>u.id===e.actor);
    assert(distance(muzzlePosition(u.callSign,u.position,u.facing),e.position)<1e-6);
    assert(engine.hasLineOfSight(u.position,e.position,BREACHLINE_MAP));
    assert(engine.hasLineOfSight(e.position,e.targetPosition,BREACHLINE_MAP));
    assert.equal(e.blocked,false);
  }
});
test('탄착은 발사 당시 기록된 지점에만 발생',()=>{
  for(const impact of base.events.filter(e=>e.type==='impact')) assert(base.events.some(shot=>shot.type==='shot'&&shot.actor===impact.actor&&shot.target===impact.target&&shot.time<=impact.time&&distance(shot.targetPosition,impact.position)<1e-8));
});
test('관측 보고 시각·위치 보존과 아군 소리 오인 방지',()=>{
  let shared=0;
  for(const snap of base.snapshots)for(const unit of snap.units){
    if(!unit.alive)continue;
    const k=unit.knowledge;
    if(k.lastKnownAt!==undefined){assert(k.lastKnownAt<=snap.time);assert(snap.time-k.lastKnownAt<=6.1);}
    if(k.source?.startsWith('team-')){shared++;assert(k.reportedBy!==unit.id); assert(base.events.some(e=>e.type==='intel'&&e.actor===k.reportedBy&&e.time<=snap.time&&distance(e.position,k.lastKnownPosition)<1e-6));}
  }
  assert(shared>0,'팀 보고 사례 필요');
});
test('같은 콜사인도 별도 참가자·능력치·교전 기록',()=>{
  const a=entry(OPERATORS[0],0), d=entry(OPERATORS[0],1,'수비');
  assert.notEqual(realtimeUnitId(a,0),realtimeUnitId(d,1));
  const result=new TacticalRealtimeSimulation().run({attackers:[a],defenders:[d],seed:3,maxSeconds:15});
  assert.equal(new Set(result.snapshots[0].units.map(u=>u.id)).size,2);
  for(const e of result.engagements)assert.notEqual(e.attackerId,e.defenderId);
});
test('서로 떨어진 공선 선분은 시야를 막지 않음',()=>{
  const map={...BREACHLINE_MAP,covers:[],walls:[{id:'test',kind:'interior',from:{x:700,y:100},to:{x:800,y:100}}]};
  assert(new TacticalRealtimeSimulation().hasLineOfSight({x:100,y:100},{x:200,y:100},map));
});
test('설계 경유점·수비 초기 위치는 모두 통행 가능',()=>{
  const engine=new TacticalRealtimeSimulation();
  for(const route of BREACHLINE_MAP.attackerRoutes)for(const point of route.points)assert(engine.canStand(point,BREACHLINE_MAP),route.id);
  for(const setup of BREACHLINE_MAP.defenderSetups)assert(engine.canStand(setup.position,BREACHLINE_MAP),setup.id);
});
test('엄폐물 모서리 경로의 모든 선분 통행 가능',()=>{
  const engine=new TacticalRealtimeSimulation(), nodes=engine.buildNavigationNodes(BREACHLINE_MAP);
  for(const route of BREACHLINE_MAP.attackerRoutes){
    const path=engine.findPath(route.points[0],route.points.at(-1),BREACHLINE_MAP,nodes);
    assert(path.length>0,route.id);let prior=route.points[0];
    for(const point of path){assert(engine.canTraverse(prior,point,BREACHLINE_MAP));prior=point;}
  }
});
test('12명 원화·총구 메타데이터와 정적 파일 존재',()=>{
  for(const name of ['MAGPIE','COLLIER','해동']){const v=operatorVisual(name);assert(v);for(const f of [v.sprite,v.portrait])assert(fs.statSync(path.join(__dirname,'../artifacts/draft-order-player-generator/public/operators',f)).size>0);
    const p=muzzlePosition(name,{x:0,y:0},Math.PI/2);assert(Math.abs(p.y-(v.muzzle[0]-v.pivot[0])*OPERATOR_SCALE)<1e-8);
  }for(const operator of OPERATORS){const visual=operatorVisual(operator.callSign);assert(visual);assert(fs.existsSync(path.join(__dirname,'../artifacts/draft-order-player-generator/public/operators',visual.sprite)));}
});
test('모든 문·출입구·A/B 설치 위치가 물리 통행과 일치',()=>{
  const engine=new TacticalRealtimeSimulation(),map=BREACHLINE_MAP;
  assert.equal(new Set(map.portals.map(p=>p.id)).size,map.portals.length);
  for(const portal of map.portals)assert(engine.canStand(portal.center,map),portal.id);
  for(const entrance of map.entrances)assert(engine.canTraverse(entrance.outside,entrance.inside,map),entrance.id);
  // 문 바깥 기준점을 가까이 옮겨도 실제 스폰에서 그 지점까지 몸 반경을 지키며 도달해야 합니다.
  const nodes=engine.buildNavigationNodes(map);
  map.entrances.forEach((entrance,index)=>{const start=map.attackerRoutes[index].points[0],path=engine.findPath(start,entrance.outside,map,nodes);assert(path.length,entrance.id+' 외곽 접근');for(let i=0;i<path.length;i++)assert(engine.canTraverse(i?path[i-1]:start,path[i],map),entrance.id+' 접근 선분');assert(Math.hypot(path.at(-1).x-entrance.outside.x,path.at(-1).y-entrance.outside.y)<1e-6);});
  for(const site of map.sites)for(const point of [...site.plantAnchors,...site.defendAnchors])assert(engine.canStand(point,map),site.id);
});
test('양 사이트는 모든 공격 진입 지점에서 도달 가능',()=>{
  const engine=new TacticalRealtimeSimulation(),map=BREACHLINE_MAP,nodes=engine.buildNavigationNodes(map);
  for(const route of map.attackerRoutes.slice(0,5))for(const site of map.sites){
    const path=engine.findPath(route.points[0],site.plantAnchors[0],map,nodes);assert(path.length,route.id+' → '+site.id);
    assert(distance(path.at(-1),site.plantAnchors[0])<1e-6);
  }
});
test('개인 시야는 뒤쪽·범위 밖·벽 뒤의 실시간 좌표를 받지 않음',()=>{
  const engine=new TacticalRealtimeSimulation(),map={...BREACHLINE_MAP,walls:[],covers:[]};
  const observer={position:{x:1500,y:1200},facing:0};
  assert(engine.canSee(observer,{x:1800,y:1200},map));
  assert(!engine.canSee(observer,{x:1200,y:1200},map));
  assert(!engine.canSee(observer,{x:4000,y:1200},map));
  map.walls=[{id:'wall',kind:'interior',from:{x:1650,y:900},to:{x:1650,y:1500}}];
  assert(!engine.canSee(observer,{x:1800,y:1200},map));
});
test('정면·주변 시야 거리와 회전 속도는 후방 순간 회전을 만들지 않음',()=>{
  const engine=new TacticalRealtimeSimulation(),map={...BREACHLINE_MAP,walls:[],covers:[]},observer={position:{x:100,y:100},facing:0};
  assert(engine.canSee(observer,{x:100+FOCUS_RANGE,y:100},map));
  assert(!engine.canSee(observer,{x:100+FOCUS_RANGE+.01,y:100},map));
  const peripheralAngle=Math.PI*.45;
  assert(engine.canSee(observer,{x:100+Math.cos(peripheralAngle)*PERIPHERAL_RANGE,y:100+Math.sin(peripheralAngle)*PERIPHERAL_RANGE},map));
  assert(!engine.canSee(observer,{x:100+Math.cos(peripheralAngle)*(PERIPHERAL_RANGE+1),y:100+Math.sin(peripheralAngle)*(PERIPHERAL_RANGE+1)},map));
  const turned=turnTowards(Math.PI-.02,-Math.PI+.02,.1);
  assert(Math.abs(angleDifference(turned,Math.PI-.02))<=TURN_SPEED*.1+1e-9);
  for(let index=1;index<base.snapshots.length;index++)for(const unit of base.snapshots[index].units){
    const prior=base.snapshots[index-1].units.find(candidate=>candidate.id===unit.id);if(!prior?.alive||!unit.alive)continue;
    assert(Math.abs(angleDifference(unit.facing,prior.facing))<=TURN_SPEED*.1+1e-7,`${unit.callSign} ${base.snapshots[index].time}`);
  }
});
test('범용 가젯은 신원을 누설하지 않고 직접 목격·고유 브리칭만 식별',()=>{
  const ours={...base.snapshots[0].units[0],id:'ours',side:'공격',callSign:'MAGPIE'},enemy={...base.snapshots[0].units[5],id:'enemy',side:'수비',callSign:'REUSS'},known=new Set();
  const generic=['camera','smoke','grenade'].map(kind=>({id:kind,kind,side:'수비',owner:'enemy',position:{x:0,y:0},activeAt:0,until:5,radius:10}));
  updateIdentifiedOperators('공격',known,[ours,enemy],['ours'],generic,[],()=>true);assert.deepEqual([...known],[]);
  updateIdentifiedOperators('공격',known,[ours,enemy],['ours'],[],[{time:1,type:'utility',actor:'enemy',message:'파쇄',goal:'wall-breached',seenBy:['공격']}],()=>true);assert.deepEqual([...known],['REUSS']);
  const direct=new Set();updateIdentifiedOperators('공격',direct,[ours,enemy],['ours','enemy'],[],[],()=>false);assert.deepEqual([...direct],['REUSS']);
});
test('실제 틱의 설치와 무력화는 정지·생존·장전 종료 상태에서만 진행',()=>{
  const input=fixture(41,180);
  input.defenders=input.defenders.slice(0,1);
  input.map={...BREACHLINE_MAP,attackerRoutes:[{x:2380,y:1200},{x:2420,y:1160},{x:2480,y:1160},{x:2380,y:1280},{x:2420,y:1280}].map((point,index)=>({id:'plant-fixture-'+index,label:'5인 설치·엄호 검사',points:[point]})),defenderSetups:[{id:'far-guard',label:'외곽 수비',position:{x:3500,y:2280},fallback:{x:3500,y:2200}}]};
  const round=new TacticalRealtimeSimulation().run(input);
  const planted=round.events.find(e=>e.goal==='planted');assert(planted,'실제 경기 설치 사례 필요');
  for(const snap of round.snapshots)for(const unit of snap.units)if(['plant','disable'].includes(unit.action)){
    assert(unit.alive);assert.equal(unit.reloadRemaining,0);assert.deepEqual(unit.velocity,{x:0,y:0});
    assert(!round.events.some(e=>e.type==='shot'&&e.actor===unit.id&&e.time===snap.time));
  }
  assert(['bombs-defused','device-disabled','defenders-eliminated'].includes(round.objective.reason));
});
const report={generatedAt:new Date().toISOString(),passed:results.filter(r=>r.pass).length,total:results.length,tests:results,
  round:base&&{duration:base.executionTime,shots:base.validation.shots,impacts:base.validation.impacts,minSeparation:base.validation.minimumTeamSeparation,winner:base.winner}};
fs.writeFileSync(path.join(__dirname,'../validation/realtime-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.round));
if(process.env.DRAFT_ORDER_DIAGNOSTICS==='1') console.log(JSON.stringify(base.snapshots.at(-1).units.map(u=>({callSign:u.callSign,alive:u.alive,position:u.position,routeStep:u.routeStep,goal:u.goal})),null,2));
process.exitCode=report.passed===report.total?0:1;
