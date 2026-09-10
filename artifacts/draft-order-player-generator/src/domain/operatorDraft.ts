import { OPERATORS, type Operator, type OperatorSide } from './Operator';
import type { Team } from './Team';
import type { RealtimeUnitInput } from './realtime/TacticalRealtimeSimulation';

export type OperatorSelection = Array<string | null>;

/** 현재 선수의 실제 습득 목록에서 해당 공수 오퍼레이터만 반환합니다. */
export function availableOperators(team: Team, playerIndex: number, side: OperatorSide): Operator[] {
  const player = team.players[playerIndex];
  if (!player) throw new Error('명단 밖 선수입니다.');
  return OPERATORS.filter(operator => operator.side === side && player.operatorPool.some(learned => learned.callSign === operator.callSign));
}

/** 수동 선택을 보존하면서 제한이 많은 선수부터 팀 내 중복 없는 편성을 찾습니다. */
export function completeOperatorDraft(team: Team, side: OperatorSide, selection: OperatorSelection): OperatorSelection {
  if (team.players.length !== 5 || selection.length !== 5) throw new Error('편성은 다섯 명의 선수로 구성합니다.');
  if (selection.some(value=>value!==null&&typeof value!=='string')) throw new Error('오퍼레이터 선택 값이 잘못됐습니다.');
  const result = [...selection], used = new Set<string>();
  for (let index = 0; index < 5; index++) if (result[index]) {
    if (used.has(result[index]!)) throw new Error('팀 안에서 같은 오퍼레이터를 중복 선택할 수 없습니다.');
    if (!availableOperators(team,index,side).some(operator=>operator.callSign===result[index])) throw new Error('해당 선수의 습득 목록 또는 공수에 맞지 않는 선택입니다.');
    used.add(result[index]!);
  }
  const pending = result.map((value,index)=>({value,index})).filter(slot=>slot.value===null)
    .sort((a,b)=>availableOperators(team,a.index,side).length-availableOperators(team,b.index,side).length);
  /** 앞선 선수가 양보해야 하는 조합도 탐색하되 원래 수동 선택은 바꾸지 않습니다. */
  function assign(cursor: number): boolean {
    if (cursor===pending.length) return true;
    const index=pending[cursor].index,player=team.players[index];
    const choices=availableOperators(team,index,side).sort((a,b)=>Number(b.role===player.role)-Number(a.role===player.role));
    for(const operator of choices) if(!used.has(operator.callSign)) {
      result[index]=operator.callSign;used.add(operator.callSign);
      if(assign(cursor+1)) return true;
      used.delete(operator.callSign);result[index]=null;
    }
    return false;
  }
  if(!assign(0)) throw new Error('현재 습득 목록으로는 다섯 명의 중복 없는 편성을 만들 수 없습니다.');
  return result;
}

/** 확정된 오퍼레이터를 실제 참가자 입력으로 만들며 챔피언 장비 점수를 사용하지 않습니다. */
export function confirmOperatorDraft(team: Team, side: OperatorSide, selection: OperatorSelection): RealtimeUnitInput[] {
  if(selection.some(value=>!value)) throw new Error('모든 선수의 오퍼레이터를 선택해 주세요.');
  const confirmed=completeOperatorDraft(team,side,selection);
  return confirmed.map((name,index)=>({player:team.players[index],operator:OPERATORS.find(operator=>operator.callSign===name)!,teamName:team.name,side}));
}
