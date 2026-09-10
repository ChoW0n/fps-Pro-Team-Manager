import type { OperatorSide } from './Operator';

export interface MatchRoundRecord {
  attempt: number;
  round: number;
  homeSide: OperatorSide;
  winner: OperatorSide | '무승부';
}
export interface TacticalMatchState {
  seed: number;
  rounds: MatchRoundRecord[];
}

/** 공수 이름 대신 고정된 홈·원정 팀에 실제 라운드 승점을 누적합니다. */
export function matchScore(state: TacticalMatchState): [number, number] {
  const score: [number, number] = [0, 0];
  for (const round of state.rounds) {
    if (round.winner !== '무승부') score[round.winner === round.homeSide ? 0 : 1] += 1;
  }
  return score;
}

/** 자체 경기 규칙: 6라운드 뒤 교대, 6:6부터 연장 8승 선착으로 진행합니다. */
export function nextMatchRound(state: TacticalMatchState) {
  const score = matchScore(state);
  const round = score[0] + score[1] + 1;
  const overtime = Math.min(...score) >= 6;
  const finished = Math.max(...score) >= (overtime ? 8 : 7);
  const homeSide: OperatorSide = round <= 6 || (round > 12 && round % 2 === 1) ? '공격' : '수비';
  // 무승부 재경기도 다른 시드를 가지며, 같은 경기 이력에서는 언제나 같은 입력입니다.
  const seed = (state.seed + Math.imul(state.rounds.length + 1, 2654435761)) >>> 0;
  return { round, homeSide, seed, score, finished, overtime, attempt: state.rounds.length };
}

/** 중복 종료 알림은 무시하고 끝난 경기에는 승점을 추가하지 않습니다. */
export function recordMatchRound(state: TacticalMatchState, attempt: number, winner: OperatorSide | '무승부'): TacticalMatchState {
  const current = nextMatchRound(state);
  if (current.finished || current.attempt !== attempt) return state;
  return { ...state, rounds: [...state.rounds, { attempt, round: current.round, homeSide: current.homeSide, winner }] };
}
