// 앱의 실제 편성·선발조·엔진 경로를 사용합니다. 별도 데모 엔진을 만들지 않습니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {completeOperatorDraft,confirmOperatorDraft}=require(root+'operatorDraft.ts');
const {OPERATORS}=require(root+'Operator.ts'),{TeamGenerator}=require(root+'TeamGenerator.ts');
const {ScoutOperation}=require(root+'realtime/ScoutOperation.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {NAMSAN_MAP}=require(root+'tacticalMaps.ts');
// 선수 생성까지 고정해 테스트 실행마다 편성과 경로가 바뀌지 않게 합니다.
const originalRandom=Math.random;let rosterSeed=41;Math.random=()=>{rosterSeed=(Math.imul(rosterSeed,1664525)+1013904223)>>>0;return rosterSeed/4294967296;};
const teams=new TeamGenerator().generateTenTeams();Math.random=originalRandom;
const blank=[null,null,null,null,null],results=[];
/** 각 회귀 계약의 성공과 실패를 보고서에 남깁니다. */
function test(name,run){try{run();results.push({name,pass:true});console.log('PASS',name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL',name,error.message);}}
test('새로 생성한 10개 팀 모두 습득 목록 안에서 공수 5인 편성 가능',()=>{for(const team of teams)for(const side of ['공격','수비']){const selection=completeOperatorDraft(team,side,blank);assert.equal(new Set(selection).size,5);for(const [i,name]of selection.entries())assert(team.players[i].operatorPool.some(o=>o.callSign===name&&o.side===side));}});
test('수동 선택 보존·자동 빈자리 충원·입력 배열 불변',()=>{const initial=completeOperatorDraft(teams[0],'공격',blank),manual=[initial[0],null,null,null,null];const result=completeOperatorDraft(teams[0],'공격',manual);assert.equal(result[0],manual[0]);assert.deepEqual(manual,[initial[0],null,null,null,null]);});
test('팀 내 중복·공수 오류·미습득·미완성 편성 차단',()=>{const selected=completeOperatorDraft(teams[0],'공격',blank);assert.throws(()=>confirmOperatorDraft(teams[0],'공격',blank));assert.throws(()=>completeOperatorDraft(teams[0],'공격',[selected[0],selected[0],null,null,null]));assert.throws(()=>completeOperatorDraft(teams[0],'수비',selected));assert.throws(()=>completeOperatorDraft(teams[0],'공격',['존재하지않음',null,null,null,null]));});
test('편성 불가능한 기존 선수 목록을 임의로 확장하지 않음',()=>{const team={name:'검사',players:teams[0].players.map(player=>({...player,operatorPool:[OPERATORS[0]]}))};assert.throws(()=>completeOperatorDraft(team,'공격',blank));assert(team.players.every(player=>player.operatorPool.length===1));});
test('실제 경기 입력에는 확정 오퍼레이터가 연결되고 챔피언 장비 환산 없음',()=>{const selection=completeOperatorDraft(teams[0],'공격',blank),units=confirmOperatorDraft(teams[0],'공격',selection);assert.deepEqual(units.map(unit=>unit.operator.callSign),selection);assert(units.every(unit=>unit.loadout===undefined));});
const rally=new Map([['a',{x:0,y:0}],['b',{x:50,y:0}]]);
test('허용한 네 수색 시간은 각 경계에서 복귀로 전환',()=>{for(const seconds of [25,40,55,70]){const operation=new ScoutOperation(['a'],seconds,rally),actors=[{id:'a',alive:true,position:{x:100,y:100}}];operation.step(seconds-.1,actors);assert.equal(operation.snapshot().phase,'scouting');operation.step(seconds,actors);assert.equal(operation.snapshot().phase,'returning');}});
test('작전 중복 틱·역행과 네 명 선발조 차단',()=>{const operation=new ScoutOperation(['a'],25,rally);operation.step(25,[]);assert.equal(operation.step(25,[]),false);assert.throws(()=>operation.step(24,[]));assert.throws(()=>new ScoutOperation(['a','b','c','d'],25,rally));});
test('0명 선발조는 즉시 진입',()=>{assert.equal(new ScoutOperation([],25,rally).snapshot().phase,'entering');});
test('잘못된 인원·중복·명단 밖 선수·수색 시간 차단',()=>{assert.throws(()=>new ScoutOperation(['a','a'],25,rally));assert.throws(()=>new ScoutOperation(['x'],25,rally));assert.throws(()=>new ScoutOperation(['a'],12,rally));});
test('수색 → 실제 복귀 → 전원 합류 → 재진입',()=>{const operation=new ScoutOperation(['a'],25,rally),actors=[{id:'a',alive:true,position:{x:100,y:100}},{id:'b',alive:true,position:{x:100,y:100}}];operation.step(24.9,actors);assert.equal(operation.snapshot().phase,'scouting');operation.step(25,actors);assert.equal(operation.snapshot().phase,'returning');operation.step(30,actors);assert.equal(operation.snapshot().phase,'returning');actors[0].position={x:0,y:0};operation.step(31,actors);assert.equal(operation.snapshot().phase,'regrouping');operation.step(32,actors);assert.equal(operation.snapshot().phase,'regrouping');actors[1].position={x:50,y:0};operation.step(33,actors);assert.equal(operation.snapshot().phase,'entering');});
test('선발조 전사자는 합류 조건에서 제외되며 감독 복귀 지시도 적용',()=>{const operation=new ScoutOperation(['a'],70,rally),actors=[{id:'a',alive:true,position:{x:100,y:100}},{id:'b',alive:true,position:{x:50,y:0}}];operation.step(4,actors,true);assert.equal(operation.snapshot().phase,'returning');actors[0].alive=false;operation.step(5,actors);operation.step(6,actors);assert.equal(operation.snapshot().phase,'entering');});
test('실제 엔진에서 선발조 복귀·합류를 거쳐 재진입하며 순간이동 없음',()=>{
  const input={attackers:confirmOperatorDraft(teams[0],'공격',completeOperatorDraft(teams[0],'공격',blank)),defenders:confirmOperatorDraft(teams[1],'수비',completeOperatorDraft(teams[1],'수비',blank)).slice(0,1),seed:41,maxSeconds:100,scoutPlan:{indices:[0,1],seconds:25,entryRoute:0},map:{...NAMSAN_MAP,defenderSetups:[{id:'far',label:'외곽',position:{x:3500,y:2280},fallback:{x:3500,y:2200}}]}};
  for(const unit of [...input.attackers,...input.defenders]) unit.player={...unit.player,aim:75,entry:75,informationGathering:75,defensiveSetup:75,mastery:75,composure:70,aggression:65,teamSynergy:70};
  const engine=new TacticalRealtimeSimulation(),round=engine.run(input),phases=[...new Set(round.snapshots.map(snapshot=>snapshot.operation.phase))];
  assert.deepEqual(phases,['scouting','returning','regrouping','entering']);
  for(const scoutId of round.snapshots[0].operation.scoutIds){const states=round.snapshots.filter(snapshot=>snapshot.operation.phase==='scouting').map(snapshot=>snapshot.units.find(unit=>unit.id===scoutId));
    const interior=states.filter(unit=>unit.position.x>input.map.building.x&&unit.position.x<input.map.building.x+input.map.building.width&&unit.position.y>input.map.building.y&&unit.position.y<input.map.building.y+input.map.building.height);assert(states.some(unit=>unit.locomotion==='crouch'),'관측 지점 접근 중 저자세 수색 상태 발생');assert(interior.every(unit=>unit.locomotion!=='sprint'),'실내 수색은 달리지 않음');
    assert(new Set(states.map(unit=>unit.goal).filter(goal=>goal.includes('구역'))).size>=2,'선발조가 한 지점에서 끝나지 않고 다음 구역을 확인');}
  const session=new TacticalRealtimeSimulation().createSession(input);
  while(!session.isComplete)session.step();assert.deepEqual(session.getResult(),round);
  const start=round.snapshots[0];
  for(const [index,snapshot]of round.snapshots.entries())for(const unit of snapshot.units.filter(unit=>unit.side==='공격')){
    if(snapshot.operation.phase==='regrouping'&&snapshot.operation.scoutIds.includes(unit.id))assert(Math.hypot(unit.position.x-snapshot.operation.rally.find(v=>v.id===unit.id).position.x,unit.position.y-snapshot.operation.rally.find(v=>v.id===unit.id).position.y)<32);
    if(index){const previous=round.snapshots[index-1].units.find(v=>v.id===unit.id);assert(Math.hypot(unit.position.x-previous.position.x,unit.position.y-previous.position.y)<13);assert(engine.canTraverse(previous.position,unit.position,input.map));}
  }
});
// 승패/재진입까지 실제 5대5로 실행하여 기능 정합성 검사에서 빠진 교착을 잡습니다.
const {fixture,measure}=require('./qa-preparation-batch.cjs');
test('같은 진입로 선발조 2·3명의 합류 목표가 충돌하지 않음',()=>{
 for(const route of [0,1,2,3,4])for(const count of [1,2,3]){const session=new TacticalRealtimeSimulation().createSession(fixture(1,count,route));const tick=session.step();const positions=tick.snapshot.operation.rally;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert(Math.hypot(positions[i].position.x-positions[j].position.x,positions[i].position.y-positions[j].position.y)>=26.4,'같은 합류 목표는 충돌 회피 정체를 유발합니다');}
});
test('선발조 2명 실제 20경기: 재진입 80% 이상·공격 승리 발생',()=>{
 const rows=Array.from({length:20},(_,i)=>measure(fixture(i+1,2)));
 const entering=rows.filter(r=>r.entering).length,wins=rows.filter(r=>r.winner==='공격').length;
 fs.writeFileSync('validation/qa-scout-final.json',JSON.stringify({summary:{games:20,entering,attackWins:wins},rows},null,2)+'\n');
 assert(entering>=16,`재진입 ${entering}/20`);assert(wins>0,`공격 승리 ${wins}/20: 확정 패배 회귀`);
});
fs.writeFileSync(require('node:path').join(__dirname,'../validation/preparation-operation-results.json'),JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,tests:results},null,2)+'\n');
process.exitCode=results.every(result=>result.pass)?0:1;
