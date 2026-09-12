// 실제 틱에서 고유 장비의 소유권·수량·독립 소비와 과거 스냅샷 보존을 검사합니다.
const assert=require('node:assert/strict');
const {fixture}=require('./qa-preparation-batch.cjs');
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts');
const engine=new TacticalRealtimeSimulation();
const input=fixture(1,0,0);input.defensePreparation='camera';
const result=engine.run(input),first=result.snapshots[0];
for(const unit of first.units){
 assert.equal(unit.utility.smoke,unit.callSign==='ARBEL'?1:0);
 assert.equal(unit.utility.breach,unit.callSign==='MEDVED'?1:0);
 assert.equal(unit.utility.camera,unit.callSign==='MARCHAND'?1:0);
 assert.equal(unit.utility.grenade,unit.side==='공격'?1:0);
}
for(const event of result.events.filter(e=>e.type==='utility')){
 const actor=first.units.find(u=>u.id===event.actor);if(!actor)continue;
 if(event.goal==='camera-deployed')assert.equal(actor.callSign,'MARCHAND');
 if(event.goal==='smoke-thrown')assert.equal(actor.callSign,'ARBEL');
 if(event.goal==='breach-started')assert.equal(actor.callSign,'MEDVED');
}
assert(result.events.some(e=>e.goal==='camera-deployed'),'소유권 검사가 빈 사건 목록을 통과하지 않아야 합니다');
const fallback=fixture(1,0,0);fallback.defensePreparation='camera';
fallback.defenders=fallback.defenders.filter(u=>u.operator.callSign!=='MARCHAND');
const fallbackResult=engine.run(fallback),cameras=fallbackResult.events.filter(e=>e.goal==='camera-deployed');
assert.equal(cameras.length,1,'MARCHAND 부재 시 공용 카메라는 한 명에게만 지급');
assert.equal(cameras[0].actor,fallbackResult.snapshots[0].units.at(-1).id);
// 짧은 교전에서 전멸하기 전에 연막과 수류탄을 모두 쓰는 고정 편성입니다.
const {Player}=require(root+'Player.ts'),{NAMSAN_MAP}=require(root+'tacticalMaps.ts');
function member(name){const operator=OPERATORS.find(o=>o.callSign===name);return {operator,side:operator.side,teamName:operator.side,player:new Player(name,name,operator.role,20,5,70,70,70,70,[operator],10,5,90,5,70,70,70)};}
class Arena extends TacticalRealtimeSimulation{
 startPosition(unit){return unit.side==='공격'?{x:1000,y:1000}:{x:1350,y:1000};}
 startFacing(unit){return unit.side==='공격'?0:Math.PI;}
}
const encounter={attackers:[member('ARBEL')],defenders:[member('BRANDT')],map:{...NAMSAN_MAP,walls:[],covers:[],portals:[]},maxSeconds:30,seed:1};
const duel=new Arena().run(encounter);
const throws=duel.events.filter(e=>e.goal==='smoke-thrown'||e.goal==='grenade-thrown');
assert(throws.some(e=>e.goal==='smoke-thrown'),'실제 연막 투척');
assert(throws.some(e=>e.goal==='grenade-thrown'),'연막을 쓴 뒤에도 실제 수류탄 투척');
const initial=duel.snapshots[0].units[0],last=duel.snapshots.at(-1).units[0];
assert.equal(initial.utility.smoke,1,'과거 스냅샷 잔량 보존');assert.equal(initial.utility.grenade,1);
assert.equal(last.utility.smoke,0);assert.equal(last.utility.grenade,0);
console.log('PASS ownership, camera fallback, smoke + grenade, immutable inventory snapshots');
