const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation,operatorSpeedTier,operatorBaseSpeed,operatorMaxHp,entryRole,trailPoint,shouldTacticalReload}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {weaponHandling,shotCone,targetAcquisitionSeconds}=require(root+'realtime/weaponHandling.ts');
const {fixture}=require('./qa-preparation-batch.cjs');

const results=[];
function test(name,run){try{run();results.push({name,pass:true});console.log('PASS',name);}catch(error){results.push({name,pass:false,error:error.message});console.error('FAIL',name,error.message);}}

test('근거리 표적도 반응·노출·총구 정렬 시간을 거친다',()=>{
  assert.equal(targetAcquisitionSeconds(100,1,0),.4);
  assert(targetAcquisitionSeconds(45,.5,120)>targetAcquisitionSeconds(90,1,120));
  assert(targetAcquisitionSeconds(75,1,800)>targetAcquisitionSeconds(75,1,450));
});

test('이동 직후 추가 탄퍼짐은 무기 고유 탄퍼짐을 덮어쓰지 않는다',()=>{
  const profile=weaponHandling('HK416');
  const moving=shotCone(profile,.8,0,0,1,240),settled=shotCone(profile,.8,0,.3,1,240);
  assert(moving>settled);
  // 기존 0.45초 안정화 항과 새 0.3초 항이 함께 적용됩니다. 새 항의 기여분만 0.027입니다.
  assert(Math.abs((moving-settled)-(.3*.06+.3*.09))<1e-9);
  assert.equal(weaponHandling('HK416').damage,32);
});

test('오퍼레이터 속도·체력 계층이 명세값과 일치한다',()=>{
  for(const name of ['MEDVED','MAGPIE'])assert.deepEqual([operatorSpeedTier(name),operatorBaseSpeed(name),operatorMaxHp(name)],[3,62,80]);
  for(const name of ['해동','COLLIER','ARBEL','SAVELLI','MARCHAND','성곽'])assert.deepEqual([operatorSpeedTier(name),operatorBaseSpeed(name),operatorMaxHp(name)],[2,52,100]);
  for(const name of ['AUBERT','REUSS','HALLORAN','BRANDT'])assert.deepEqual([operatorSpeedTier(name),operatorBaseSpeed(name),operatorMaxHp(name)],[1,44,125]);
});

test('진입 순서가 선두·후속·엄호 역할과 좌우 대형을 결정한다',()=>{
  const team=Array.from({length:5},(_,formationIndex)=>({id:String(formationIndex),side:'공격',formationIndex,alive:true,position:{x:0,y:0},facing:0}));
  assert.deepEqual(team.map(unit=>entryRole(unit,team)),['point','follow','follow','cover','cover']);
  assert.deepEqual(trailPoint({position:{x:100,y:100,floor:0},facing:0},90,45),{x:10,y:145});
});

test('잔탄 재장전은 엄폐·비노출 상태에서만 허용한다',()=>{
  const unit={ammo:9,magazineSize:30,reserveAmmo:60,suppression:0};
  const safe={seen:false,knownDanger:false,exposedToEnemy:false,preparationLocked:false};
  assert.equal(shouldTacticalReload(unit,safe),true);
  assert.equal(shouldTacticalReload(unit,{...safe,exposedToEnemy:true}),false);
  assert.equal(shouldTacticalReload({...unit,ammo:10},safe),false);
  assert.equal(shouldTacticalReload({...unit,ammo:0},safe),false,'빈 탄창은 별도 강제 재장전 규칙이 담당한다');
});

test('엔진 스냅샷은 판단 공백을 억제하고 주요 판단 어휘를 실제로 사용한다',()=>{
  const result=new TacticalRealtimeSimulation().run(fixture(7,0,2));
  const liveTicks=result.snapshots.flatMap(snapshot=>snapshot.units.filter(unit=>unit.alive));
  const missing=liveTicks.filter(unit=>!unit.decision).length;
  const decisions=new Set(liveTicks.map(unit=>unit.decision).filter(Boolean));
  assert(missing/liveTicks.length<=.15,`판단 공백 ${(100*missing/liveTicks.length).toFixed(1)}%`);
  assert(decisions.size>=12,`판단 종류 ${decisions.size}: ${[...decisions].join(', ')}`);
  const count=goal=>result.events.filter(event=>event.goal===goal).length;
  assert(count('point-corner-check')>=8,`모서리 확인 ${count('point-corner-check')}회`);
  assert(count('intel-reroute')>=1&&count('intel-reroute')<=3,`재경로 ${count('intel-reroute')}회`);
  assert(count('wall-bang')>=1&&count('wall-bang')<=4,`월뱅 ${count('wall-bang')}회`);
  assert(liveTicks.some(unit=>unit.decision==='소리 추적 · 마지막 위치 확인'));
  assert(result.events.some(event=>event.goal==='danger-zone-avoided'));
});

process.exitCode=results.every(result=>result.pass)?0:1;
