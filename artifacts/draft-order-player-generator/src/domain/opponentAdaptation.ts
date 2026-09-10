import type { OperatorSide } from './Operator';
import type { Team } from './Team';
import { availableOperators, completeOperatorDraft, type OperatorSelection } from './operatorDraft';
import { BREACHLINE_MAP, type TacticalMapDefinition } from './tacticalMaps';
import type { TacticalRealtimeResult, TacticalRealtimeSimulationInput } from './realtime/TacticalRealtimeSimulation';

export interface RoundObservation { observer:OperatorSide; entry?:number; site?:'A'|'B'; operators:string[]; smoke:boolean; won:boolean }
export interface OpponentPlan { entry:number; site:'A'|'B'; attackStyle:NonNullable<TacticalRealtimeSimulationInput['attackStyle']>; defenseStyle:NonNullable<TacticalRealtimeSimulationInput['defenseStyle']>; anticipatedEntry?:number; revision:number }

/** 상대의 확정 작전을 읽지 않고 관측 스냅샷과 공개된 설치 사건만 복기합니다. */
export function observeRound(result:TacticalRealtimeResult, observer:OperatorSide, map:TacticalMapDefinition=BREACHLINE_MAP):RoundObservation {
  const operators=new Set<string>();let entry:number|undefined;
  for(const snapshot of result.snapshots) {
    const visible=new Set(snapshot.visibleTo?.[observer]??[]);
    for(const unit of snapshot.units.filter(unit=>unit.side!==observer&&visible.has(unit.id))) {
      operators.add(unit.callSign);
      if(observer==='수비'&&entry===undefined) {
        const routes=map.attackerRoutes.slice(0,5).map((route,index)=>({index,distance:Math.min(...route.points.slice(0,3).map(point=>Math.hypot(point.x-unit.position.x,point.y-unit.position.y)))})).sort((a,b)=>a.distance-b.distance);
        if(routes[0].distance<240) entry=routes[0].index;
      }
    }
  }
  const planted=result.events.some(event=>event.goal==='planted');
  return {observer,entry,site:planted?result.objective.siteId:undefined,operators:[...operators],
    smoke:result.events.some(event=>event.goal==='smoke-thrown'&&event.side!==observer&&event.seenBy?.includes(observer)),won:result.winner===observer};
}

/** 이전 관측에 대응하되 현재 플레이어가 고른 비공개 작전은 입력으로 받지 않습니다. */
export function planOpponent(history:readonly RoundObservation[], side:OperatorSide, seed:number):OpponentPlan {
  const past=history.filter(round=>round.observer===side).slice(-3),last=past.at(-1);
  const counts=new Map<number,number>();
  for(const round of past)if(round.entry!==undefined)counts.set(round.entry,(counts.get(round.entry)??0)+1);
  const repeated=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];
  const variation=((seed>>>0)%5+past.length)%5;
  return {entry:variation,site:last?.site==='A'?'B':variation%2?'B':'A',
    attackStyle:last?.won?'balanced':past.length?'breach':'smoke',
    defenseStyle:last?.smoke?'roam':repeated!==undefined?'crossfire':variation%2?'roam':'anchor',
    anticipatedEntry:repeated,revision:past.length};
}

/** 배운 오퍼레이터만 사용해 대응 역할을 우선 편성하고, 불가능한 조합은 되돌립니다. */
export function opponentDraft(team:Team,side:OperatorSide,plan:OpponentPlan):OperatorSelection {
  let draft:OperatorSelection=[null,null,null,null,null];
  const preferred=side==='공격'?(plan.attackStyle==='breach'?'ENTRY':'SEARCH'):(plan.defenseStyle==='roam'?'SEARCH':'BLOCKING');
  for(let index=0;index<5;index++) {
    const choices=availableOperators(team,index,side);
    const rotated=choices.map((operator,slot)=>({operator,rank:Number(operator.role===preferred)*100+(slot+plan.revision+index)%Math.max(1,choices.length)})).sort((a,b)=>b.rank-a.rank);
    for(const {operator} of rotated) {
      const next=draft.map((value,slot)=>slot===index?operator.callSign:value);
      try{completeOperatorDraft(team,side,next);draft=next;break;}catch{/* 다른 습득 조합을 시도합니다. */}
    }
  }
  return completeOperatorDraft(team,side,draft);
}
