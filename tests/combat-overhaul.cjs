// 실제 엔진·준비·관전자 계약을 검사합니다. 화면 조작 검사와 구분합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation,realtimeUnitId}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{BREACHLINE_MAP:map}=require(root+'tacticalMaps.ts');
const {weaponHandling,shotCone,shotInterval}=require(root+'realtime/weaponHandling.ts');
const {combatCamera,directorObjective,visionPolygon}=require(root+'realtime/spectatorView.ts');
const {breachWalls}=require(root+'realtime/breachGeometry.ts');
const {observeRound,planOpponent,opponentDraft}=require(root+'opponentAdaptation.ts');
const {nextMatchRound,recordMatchRound}=require(root+'tacticalMatch.ts');
const {confirmOperatorDraft}=require(root+'operatorDraft.ts');
const results=[];function test(name,run){try{run();results.push({name,pass:true});console.log('PASS',name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL',name,error.message);}}
function side(name){return OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('선수'+index,'검사'+index,operator.role,20,75,75,75,75,75,OPERATORS,20,75,65,70,70,70,70)}));}
function input(seed=41){return {attackers:side('공격'),defenders:side('수비'),seed,maxSeconds:180,scoutPlan:{indices:[0,1],seconds:40,entryRoute:0},defenseStyle:'crossfire',anticipatedEntry:0};}
const utilitySample=require('./fixtures/utility-encounter.cjs').utilityEncounter();
const engine=new TacticalRealtimeSimulation(),originalMap=JSON.stringify(map),sample=engine.run(input());
const empty={...map,walls:[],covers:[]};
const observer={...sample.snapshots[0].units[0],position:{x:1000,y:1000},facing:0};
test('추가 가젯·개인 시야 포함 run/session 전체 결과 결정론',()=>{const session=engine.createSession(input());while(!session.isComplete)session.step();assert.deepEqual(session.getResult(),sample);});
test('선수 제어 기량과 정지 조준은 탄퍼짐·회복 간격에 영향을 줌',()=>{for(const name of ['HK416','MP5SD','HK417','C14 팀버울프']){const profile=weaponHandling(name);assert(shotCone(profile,.95,.08,.8)<shotCone(profile,.2,.08,.8));assert(shotCone(profile,.7,.08,.8)<shotCone(profile,.7,.08,.1));assert(shotCone(profile,.7,0,.8)<shotCone(profile,.7,.1,.8));assert(shotInterval(profile,900,.95,6)<shotInterval(profile,900,.2,6));}});
test('SMG·카빈·정밀·볼트액션이 서로 다른 제어 프로필 사용',()=>{assert.equal(weaponHandling('MP5SD').caliber,'9×19');assert.equal(weaponHandling('HK416').cyclicRpm,850);assert.equal(weaponHandling('HK417').caliber,'7.62×51');assert(shotInterval(weaponHandling('C14 팀버울프'),700,.8,1)>shotInterval(weaponHandling('HK416'),700,.8,1));});
test('빗나간 발사도 실제 분산 방향의 탄착 지점을 보존',()=>{const misses=sample.events.filter(event=>event.type==='shot'&&!event.hit);assert(misses.length);for(const shot of misses){const snapshot=sample.snapshots.find(s=>s.time===shot.time),target=snapshot.units.find(unit=>unit.id===shot.target);assert(Math.hypot(shot.targetPosition.x-target.position.x,shot.targetPosition.y-target.position.y)>1);}});
// 모서리 광선 추가로 배열 인덱스는 변합니다. 실제 정면 방향과 연막 경계의 교점을 검사합니다.
test('연막은 양 팀 시야를 차단하며 총알 지형 판정은 바꾸지 않음',()=>{const smoke={id:'smoke',kind:'smoke',position:{x:1200,y:1000},radius:95,activeAt:2,until:10};const point={x:1400,y:1000};assert(engine.canObserve(observer,point,empty,[smoke],1));assert(!engine.canObserve(observer,point,empty,[smoke],3));assert(engine.canObserve(observer,point,empty,[smoke],11));assert(engine.hasLineOfSight(observer.position,point,empty));const polygon=visionPolygon(observer,empty,[smoke]).split(' ').map(p=>p.split(',').map(Number));const forward=polygon.slice(1).find(([x,y])=>x>observer.position.x&&Math.abs(y-observer.position.y)<1e-6);assert(forward,'정면 광선 존재');assert(Math.abs(forward[0]-(smoke.position.x-smoke.radius))<1e-6,'정면 광선은 연막 앞 경계에서 종료');});
test('관전자 공개 목록은 실제 인지 완료와 벽·연막·방향을 함께 요구',()=>{for(const snapshot of sample.snapshots.filter((_,index)=>index%10===0)){const liveMap={...map,walls:(snapshot.breaches??[]).reduce((walls,b)=>breachWalls(walls,b.wallId,b.position,b.width),map.walls)};for(const team of ['공격','수비'])for(const unit of snapshot.units){const expected=unit.side===team||snapshot.units.some(friend=>friend.side===team&&snapshot.observedBy[friend.id]?.includes(unit.id)&&engine.canObserve(friend,unit.position,liveMap,snapshot.gadgets,snapshot.time));assert.equal(snapshot.visibleTo[team].includes(unit.id),expected);}}});
test('공수 교대 후 자동 카메라는 우리 팀을 중심으로 여러 방과 교전을 함께 담음',()=>{const units=[{...observer,id:'atk',side:'공격',position:{x:1000,y:1000}},{...observer,id:'def',side:'수비',position:{x:1500,y:1100}}],events=[{type:'shot',time:4,actor:'atk',target:'def'}];const camera=combatCamera(units,events,'수비',4.1,null);assert.equal(camera.focusId,'def');assert(camera.width>=900);assert.equal(camera.x,1250);const hidden=combatCamera([units[1]],events,'수비',4.1,null);assert.equal(hidden.x,1500);assert.equal(hidden.width,900);});
test('운반자·미관측 설치·적 무력화 진행도가 감독 HUD로 유출되지 않음',()=>{assert.deepEqual(directorObjective({phase:'planting',carrierId:'atk',interactingId:'atk',progress:.8,siteId:'B'},'수비',[]),{phase:'carried',progress:0});assert.equal(directorObjective({phase:'disabling',interactingId:'def',progress:.8,activeUntil:90},'공격',[]).phase,'active');assert.equal(directorObjective({phase:'disabling',interactingId:'def',progress:.8,activeUntil:90},'공격',['def']).progress,.8);});
test('실제 연막·카메라·수류탄 투척·폭발·회피가 엔진 사건에 존재',()=>{for(const goal of ['camera-deployed','smoke-thrown','grenade-thrown','grenade-exploded'])assert([...sample.events,...utilitySample.events].some(event=>event.goal===goal),goal);assert(utilitySample.snapshots.some(snapshot=>snapshot.units.some(unit=>unit.goal.includes('수류탄 회피'))));});
test('사망자는 가젯 설치·투척을 새로 시작하지 않음',()=>{for(const death of sample.events.filter(e=>e.type==='death'))assert(!sample.events.some(event=>event.actor===death.target&&event.time>=death.time&&['camera-deployed','smoke-thrown','grenade-thrown','breach-started'].includes(event.goal)));});
test('전방 방패 상태가 실제 접촉·방향 스냅샷에 기록됨',()=>{const attacker=side('공격')[0],defender=side('수비')[0];defender.operator=OPERATORS.find(operator=>operator.callSign==='REUSS');
 class ShieldContact extends TacticalRealtimeSimulation{startPosition(unit){return unit.side==='공격'?{x:1000,y:1000}:{x:1320,y:1000};}startFacing(unit){return unit.side==='공격'?0:Math.PI;}}
 const contact=new ShieldContact().run({attackers:[attacker],defenders:[defender],map:empty,seed:41,maxSeconds:8,scoutPlan:{indices:[],seconds:25,entryRoute:0}});
 const states=contact.snapshots.flatMap(snapshot=>snapshot.units.filter(unit=>unit.shieldRaised));assert(states.length);assert(states.every(unit=>unit.callSign==='REUSS'));});
test('선발조를 기다리는 진압조도 출입구 대기선까지 실제 전진',()=>{const start=sample.snapshots[0],during=sample.snapshots.find(snapshot=>snapshot.time===15);const assault=during.units.filter(unit=>unit.side==='공격'&&!during.operation.scoutIds.includes(unit.id));assert(assault.some(unit=>Math.hypot(unit.position.x-start.units.find(v=>v.id===unit.id).position.x,unit.position.y-start.units.find(v=>v.id===unit.id).position.y)>100));assert(during.operation.phase==='scouting');
 const safeInput=input(61);safeInput.defenders=safeInput.defenders.slice(0,1);safeInput.map={...map,defenderSetups:[{id:'safe-far',label:'작전 전환 검사',position:{x:3500,y:2280},fallback:{x:3500,y:2200}}]};
 const safeRound=engine.run(safeInput);assert(safeRound.events.some(event=>event.goal==='operation:entering'),'안전한 고정 입력에서 복귀·합류·재진입 사건 필요');});
test('파쇄는 실제 엔진에서 벽 절단·경로 재탐색으로 연결되고 원본 지도 보존',()=>{
 const fixture=input(12);fixture.scoutPlan={indices:[],seconds:25,entryRoute:0};fixture.attackStyle='breach';fixture.defenders=fixture.defenders.slice(0,1);fixture.attackers=fixture.attackers.slice(0,1);fixture.attackers[0].operator=OPERATORS.find(o=>o.callSign==='MEDVED');fixture.map={...map,defenderSetups:[{id:'far',label:'외곽',position:{x:3500,y:2280},fallback:{x:3500,y:2200}}]};
 class BreachStart extends TacticalRealtimeSimulation{startPosition(unit,index,count,terrain){return unit.side==='공격'?{x:1000,y:480}:super.startPosition(unit,index,count,terrain);}}
 const breached=new BreachStart().run(fixture);assert(breached.events.some(e=>e.goal==='wall-breached'));const snapshot=breached.snapshots.find(s=>s.breaches.length),hole=snapshot.breaches[0],walls=breachWalls(map.walls,hole.wallId,hole.position,hole.width);assert(!engine.canStand(hole.position,map));assert(engine.canStand(hole.position,{...map,walls}));assert.equal(JSON.stringify(map),originalMap);
});
test('목격하지 못한 진입·오퍼레이터는 다음 라운드 학습에 들어가지 않음',()=>{const unknown={...sample,events:[],snapshots:sample.snapshots.map(snapshot=>({...snapshot,visibleTo:{공격:[],수비:[]}}))};const observation=observeRound(unknown,'수비');assert.equal(observation.entry,undefined);assert.deepEqual(observation.operators,[]);assert.equal(observation.site,undefined);});
test('이전 관측 경로·연막에 대응하며 현재 비공개 작전을 입력받지 않음',()=>{const history=[{observer:'수비',entry:3,operators:['MAGPIE'],smoke:false,won:false},{observer:'수비',entry:3,operators:[],smoke:true,won:false}];const plan=planOpponent(history,'수비',41);assert.equal(plan.anticipatedEntry,3);assert.equal(plan.defenseStyle,'roam');assert.equal(planOpponent(history.slice(0,1).map(round=>({...round,smoke:true})),'수비',41).defenseStyle,'anchor');assert.equal(planOpponent(history.map(round=>({...round,won:true})),'수비',41).defenseStyle,'crossfire');assert.deepEqual(planOpponent(history,'수비',41),plan);assert.equal(planOpponent([],'수비',41).anticipatedEntry,undefined);});
test('대응 편성은 습득·공수·5인 중복 금지를 지키며 조합을 바꿀 수 있음',()=>{const team={name:'상대',players:side('수비').map(unit=>unit.player)},selections=[];for(let revision=0;revision<3;revision++){const plan={...planOpponent([],'수비',41),revision},selection=opponentDraft(team,'수비',plan);confirmOperatorDraft(team,'수비',selection);assert.equal(new Set(selection).size,5);selections.push(selection.join(','));}assert(new Set(selections).size>1);});
test('예상 진입을 바꿔도 A/B 필수 앵커와 합법적·분리된 초기 배치 유지',()=>{for(let route=0;route<5;route++){const session=engine.createSession({...input(),anticipatedEntry:route}),first=session.step().snapshot;const defenders=first.units.filter(unit=>unit.side==='수비');for(const unit of defenders)assert(engine.canStand(unit.position,map));for(let a=0;a<defenders.length;a++)for(let b=a+1;b<defenders.length;b++)assert(Math.hypot(defenders[a].position.x-defenders[b].position.x,defenders[a].position.y-defenders[b].position.y)>=24);assert.equal(defenders[2].routeIndex,2);assert.equal(defenders[3].routeIndex,3);}});
test('빠른 매치는 2승 선착·매 라운드 교대하며 정규 매치와 독립',()=>{let state={seed:41,rounds:[],quick:true};assert.equal(nextMatchRound(state).homeSide,'공격');state=recordMatchRound(state,0,'공격');assert.equal(nextMatchRound(state).homeSide,'수비');state=recordMatchRound(state,1,'수비');assert(nextMatchRound(state).finished);assert.deepEqual(nextMatchRound(state).score,[2,0]);assert(!nextMatchRound({...state,quick:false}).finished);});
test('미관측 적 추가가 접촉 중인 선수의 인원 판단·첫 발사 시점을 바꾸지 않음',()=>{
 class KnowledgeArena extends TacticalRealtimeSimulation {
  startPosition(unit,index,count){return unit.side==='공격'?{x:1000,y:1000}:index===count?{x:1600,y:1000}:{x:3500,y:200+(index-count)*65};}
  startFacing(unit){return unit.side==='공격'?0:Math.PI;}
 }
 function fixture(count){const attackers=side('공격').slice(2,3),defenders=side('수비').slice(0,count);for(const unit of [...attackers,...defenders])unit.player={...unit.player,aggression:0,aim:50,mastery:50,composure:50};return {attackers,defenders,map:empty,seed:41,maxSeconds:3};}
 const one=new KnowledgeArena().run(fixture(1)),five=new KnowledgeArena().run(fixture(5));
 const first=result=>result.events.find(event=>event.type==='shot'&&event.side==='공격');assert(first(one));assert(first(five));assert.equal(first(one).time,first(five).time);
 for(const snapshot of one.snapshots.filter(snapshot=>snapshot.time<=Math.min(2.5,(one.events.find(event=>event.type==='death')?.time??one.executionTime)-.1)))assert.deepEqual(snapshot.units[0],five.snapshots.find(other=>other.time===snapshot.time).units[0]);
});
test('설치 후 4대1: 네 선수의 분담 엄호와 로머의 실제 재진입·피격 순서',()=>{
 const guards=map.sites[0].defendAnchors,plant=map.sites[0].plantAnchors[0];
 const routes=map.attackerRoutes.map((route,index)=>index<4?{...route,points:[index===1?plant:guards[index],index===1?plant:guards[index],plant]}:route);
 const terrain={...map,attackerRoutes:routes,defenderSetups:[{id:'late-retake',label:'외곽 로머',position:{x:3060,y:2240},fallback:{x:3100,y:2220}}]};
 const rows=[];
 for(const seed of [11,41,81,149]) {
  const result=engine.run({attackers:side('공격').slice(0,4),defenders:side('수비').slice(3,4),map:terrain,seed,maxSeconds:100});
  const planted=result.events.find(event=>event.goal==='planted');assert(planted);
  assert(result.snapshots.some(snapshot=>snapshot.units.filter(unit=>unit.side==='공격'&&unit.goal.includes('설치 후')).length===4));
  const defender=result.snapshots[0].units.find(unit=>unit.side==='수비');
  assert(result.snapshots.some(snapshot=>snapshot.time>planted.time&&snapshot.units.some(unit=>unit.id===defender.id&&Math.hypot(unit.position.x-defender.position.x,unit.position.y-defender.position.y)>100)));
  const deaths=result.events.filter(event=>event.type==='death'&&event.target!==defender.id);
  for(const death of deaths)assert(result.events.some(event=>event.type==='impact'&&event.hit&&event.target===death.target&&event.time<=death.time));
  rows.push({seed,winner:result.winner,reason:result.objective.reason,seconds:result.executionTime,attackerDeaths:deaths.length});
 }
 fs.writeFileSync(path.join(__dirname,'../validation/postplant-four-v-one.json'),JSON.stringify({note:'초기 배치가 고정된 4개 시드 검사. 모든 1대4 상황에 대한 보장이 아님.',rows},null,2)+'\n');
});
fs.writeFileSync(path.join(__dirname,'../validation/combat-overhaul-results.json'),JSON.stringify({passed:results.filter(test=>test.pass).length,total:results.length,tests:results},null,2)+'\n');process.exitCode=results.every(test=>test.pass)?0:1;
