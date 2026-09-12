// 실제 사격으로 다운된 동료를 엄폐 뒤 지원자가 구조하는 재현 입력입니다.
exports.rescueUnderCover = function rescueUnderCover(seed=41) {
  const root='../../artifacts/draft-order-player-generator/src/domain/';
  const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
  const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts'),{BREACHLINE_MAP:map}=require(root+'tacticalMaps.ts');
  const side=name=>OPERATORS.filter(operator=>operator.side===name).slice(0,2).map((operator,index)=>({operator,side:name,teamName:name,
    player:new Player('구조'+index,'구조'+index,operator.role,20,name==='공격'?(index?95:30):70,75,75,75,75,[operator],20,75,50,70,70,70,70)}));
  class RescueArena extends TacticalRealtimeSimulation {
    // 앞선 선수·엄폐 뒤 지원자·접촉 수비·먼 생존자를 고정해 라운드 조기 종료를 피합니다.
    startPosition(unit,index,count){return unit.side==='공격'?(index?{x:930,y:1130}:{x:1000,y:1000}):index===count?{x:1500,y:1000}:{x:3500,y:2200};}
    startFacing(unit){return unit.side==='공격'?0:Math.PI;}
  }
  return new RescueArena().run({attackers:side('공격'),defenders:side('수비'),seed,maxSeconds:50,
    map:{...map,walls:[],covers:[{id:'rescue-cover',label:'구조 엄폐',rect:{x:1050,y:1030,width:30,height:170}}],portals:[]}});
};
