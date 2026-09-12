// 가젯을 선택하기 전에 전멸하지 않도록 배치한 실제 엔진 교전 입력입니다.
const root='../../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{NAMSAN_MAP}=require(root+'tacticalMaps.ts');
// 명중 높이 도입 후에도 투척 전 생존하는 고정 입력으로 회피까지 검사합니다.
exports.utilityEncounter=(seed=1)=>{
  const make=(name,side,index)=>{const operator=OPERATORS.find(o=>o.callSign===name);return {operator,side,teamName:side,player:new Player('utility'+index,'test',operator.role,20,5,70,70,70,70,[operator],10,5,90,5,70,70,70)};};
  class Arena extends TacticalRealtimeSimulation {
    startPosition(unit,index,count){return unit.side==='수비'?(index===count?{x:1350,y:1000}:{x:1420,y:1010}):index===0?{x:1000,y:1000}:{x:500,y:1800};}
    startFacing(unit){return unit.side==='수비'&&unit.player.nickname!=='utility3'?Math.PI:0;}
  }
  return new Arena().run({attackers:[make('해동','공격',0),make('ARBEL','공격',1)],defenders:[make('REUSS','수비',2),make('REUSS','수비',3)],map:{...NAMSAN_MAP,defenderSpawn:{x:1350,y:1000},defenderSetups:[{id:'contact-0',position:{x:1350,y:1000},fallback:{x:1350,y:1000}},{id:'contact-1',position:{x:1420,y:1010},fallback:{x:1420,y:1010}}],walls:[{id:'fixture-partition',kind:'interior',from:{x:800,y:1200},to:{x:800,y:2300}}],covers:[],portals:[]},maxSeconds:35,seed});
};
