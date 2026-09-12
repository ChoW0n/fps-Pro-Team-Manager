import type { OperatorSide } from '../Operator';
import type { RealtimeAction } from './TacticalRealtimeSimulation';

/** 한 틱의 전투·이동 판단에 필요한 사실만 전달하며 규칙 순서가 우선순위입니다. */
export interface UnitActionContext {
  side:OperatorSide;
  shouldReposition:boolean; shouldFire:boolean; movementBlocked:boolean;
  forcedHold:boolean; forcedPush:boolean; seen:boolean;
  guarding:boolean; hasUnresolvedLead:boolean;
  operationGoal:boolean; operationMoving:boolean; openingScout:boolean;
  needsObjectiveMove:boolean; openingSearch:boolean; shouldSearch:boolean;
  defenderSet:boolean; roamer:boolean;
}

export interface UnitActionRule { id:string; when:(context:UnitActionContext)=>boolean; action:(context:UnitActionContext)=>RealtimeAction }

export const UNIT_ACTION_RULES:readonly UnitActionRule[]=[
  {id:'reposition',when:context=>context.shouldReposition,action:()=> 'reposition'},
  {id:'fire',when:context=>context.shouldFire,action:()=> 'fire'},
  {id:'traffic-hold',when:context=>context.movementBlocked,action:()=> 'hold'},
  {id:'director-hold',when:context=>context.forcedHold,action:()=> 'hold'},
  {id:'director-push',when:context=>context.forcedPush,action:()=> 'approach'},
  {id:'visible-target',when:context=>context.seen,action:()=> 'aim'},
  {id:'postplant-guard',when:context=>context.guarding&&!context.hasUnresolvedLead,action:()=> 'hold'},
  {id:'opening-operation',when:context=>context.operationGoal,action:context=>context.operationMoving?(context.openingScout?'search':'approach'):'hold'},
  {id:'objective-move',when:context=>context.needsObjectiveMove&&!context.openingSearch,action:()=> 'approach'},
  {id:'search',when:context=>context.shouldSearch,action:()=> 'search'},
  {id:'opening-wait',when:context=>context.openingSearch&&context.side==='공격'&&!context.forcedPush,action:()=> 'hold'},
  {id:'defender-anchor',when:context=>context.side==='수비'&&context.defenderSet&&!context.roamer,action:()=> 'hold'},
  {id:'advance',when:()=>true,action:()=> 'approach'},
] as const;

export function resolveUnitAction(context:UnitActionContext):RealtimeAction {
  const rule=UNIT_ACTION_RULES.find(candidate=>candidate.when(context));
  if(!rule)throw new Error('유닛 행동 규칙이 결정을 반환하지 않았습니다.');
  return rule.action(context);
}
