import type { RealtimeUnitState } from './TacticalRealtimeSimulation';
import type { TacticalPoint } from '../tacticalMaps';

/** 게임용 초기 규칙입니다. 의학 수치나 레식 최신 규칙의 정확한 복제값이 아닙니다. */
export const INJURY_RULES = { downHealth: 20, bleedSeconds: 30, reviveSeconds: 4, reviveHealth: 20, reviveRange: 42 } as const;
export interface DownedState { remaining: number; mode: 'crawl' | 'stabilize'; progress: number }
export interface ReviveState { targetId: string; startedAt: number; actorPosition: TacticalPoint; targetPosition: TacticalPoint }

/** 40월드 단위/미터의 게임용 높이입니다. 실제 인체 측정이나 실사 탄도 재현값은 아닙니다. */
export function hitHeights(target: Pick<RealtimeUnitState,'locomotion'|'downed'>): {head:number;body:number} {
  if(target.downed||target.locomotion==='crawl')return {head:14,body:8};
  return target.locomotion==='crouch'?{head:44,body:28}:{head:64,body:42};
}

/** 탄착 높이가 현재 자세의 머리·몸 범위 안에 있어야 명중하며, 정면 사격을 자동 헤드샷으로 만들지 않습니다. */
export function hitRegion(height: number, target: Pick<RealtimeUnitState,'locomotion'|'downed'>): 'head'|'body'|undefined {
  const head=hitHeights(target).head;
  if(!Number.isFinite(height)||height<0||height>head+6)return;
  return Math.abs(height-head)<=6?'head':'body';
}

/** 사망은 한 번만 확정하고 진행 중인 소생·장전·통과 행동을 해제합니다. */
export function killUnit(unit: RealtimeUnitState): void {
  unit.alive=false;unit.hp=0;unit.action='dead';unit.velocity={x:0,y:0};
  unit.downed=undefined;unit.reviving=undefined;unit.reloadRemaining=0;unit.traversal=undefined;unit.shieldRaised=false;
}

/** 실제 탄착·폭발 피해만 받으며 첫 비헤드 치명상은 다운, 재다운·추가 치명상은 사망입니다. */
export function injure(unit: RealtimeUnitState, damage: number, headshot: boolean, now: number): 'downed'|'death'|undefined {
  if(!unit.alive||!Number.isFinite(damage)||damage<=0)return;
  unit.lastDamageAt=now;
  unit.reviving=undefined;
  unit.hp=Math.max(0,unit.hp-damage);
  if(headshot){killUnit(unit);return 'death';}
  if(unit.hp>0)return;
  if(unit.downed||unit.hasBeenDowned){killUnit(unit);return 'death';}
  unit.hasBeenDowned=true;unit.hp=INJURY_RULES.downHealth;unit.action='downed';unit.locomotion='crawl';
  unit.velocity={x:0,y:0};unit.reloadRemaining=0;unit.traversal=undefined;unit.shieldRaised=false;
  unit.downed={remaining:INJURY_RULES.bleedSeconds,mode:'stabilize',progress:0};
  return 'downed';
}

/** 정지 지혈은 출혈을 늦출 뿐 무한 생존을 만들지 않습니다. 경기 틱만 소비합니다. */
export function bleed(unit: RealtimeUnitState, seconds: number): boolean {
  if(!unit.alive||!unit.downed)return false;
  unit.downed.remaining=Math.max(0,unit.downed.remaining-seconds*(unit.downed.mode==='stabilize'?.5:1));
  if(unit.downed.remaining>1e-7)return false;
  killUnit(unit);return true;
}

/** 안전 판단·거리·정지·최근 피격 조건을 매 틱 재검사하고 중단 시 진행을 초기화합니다. */
export function revive(helper: RealtimeUnitState, target: RealtimeUnitState, now: number, safe: boolean): boolean {
  const distance=Math.hypot(helper.position.x-target.position.x,helper.position.y-target.position.y);
  const valid=safe&&helper.alive&&!helper.downed&&target.alive&&Boolean(target.downed)&&helper.side===target.side
    &&helper.id!==target.id&&distance<=INJURY_RULES.reviveRange&&now-(helper.lastDamageAt??-Infinity)>.3&&now-(target.lastDamageAt??-Infinity)>.3;
  if(!valid){helper.reviving=undefined;if(helper.action==='revive')helper.action='hold';if(target.downed)target.downed.progress=0;return false;}
  const previous=helper.reviving;
  if(!previous||previous.targetId!==target.id||Math.hypot(helper.position.x-previous.actorPosition.x,helper.position.y-previous.actorPosition.y)>1
    ||Math.hypot(target.position.x-previous.targetPosition.x,target.position.y-previous.targetPosition.y)>1){
    helper.reviving={targetId:target.id,startedAt:now,actorPosition:{...helper.position},targetPosition:{...target.position}};
  }
  helper.action='revive';helper.velocity={x:0,y:0};helper.reloadRemaining=0;
  target.downed!.progress=Math.min(1,(now-helper.reviving!.startedAt)/INJURY_RULES.reviveSeconds);
  if(target.downed!.progress<1-1e-7)return false;
  target.downed=undefined;target.hp=INJURY_RULES.reviveHealth;target.action='hold';target.locomotion='crouch';
  helper.reviving=undefined;helper.action='hold';return true;
}
