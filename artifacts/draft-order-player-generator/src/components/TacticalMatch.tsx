import { observeRound, type RoundObservation } from '../domain/opponentAdaptation';
import { useState } from 'react';
import type { Team } from '../domain/Team';
import { nextMatchRound, recordMatchRound, type TacticalMatchState } from '../domain/tacticalMatch';
import type { TacticalRealtimeSimulationInput } from '../domain/realtime/TacticalRealtimeSimulation';
import { OperatorPreparation } from './OperatorPreparation';
import { TacticalRoundLive } from './TacticalRoundLive';

/** 라운드 사이에는 편성만 준비하고, 결과가 도착한 경기만 점수에 반영합니다. */
export function TacticalMatch({ homeTeam, awayTeam, onBack, quick = true }: { homeTeam: Team; awayTeam: Team; onBack: () => void; quick?:boolean }) {
  const [match, setMatch] = useState<TacticalMatchState>(() => ({ seed: crypto.getRandomValues(new Uint32Array(1))[0], rounds: [], quick }));
  const [history,setHistory]=useState<RoundObservation[]>([]);
  const [active, setActive] = useState<{ input: TacticalRealtimeSimulationInput; round: ReturnType<typeof nextMatchRound> } | null>(null);
  const next = nextMatchRound(match);
  const round = active?.round ?? next;
  const completed = Boolean(active && match.rounds.length > active.round.attempt);

  return <section aria-label="전술 FPS 매치" className="tactical-match" data-version="combat-overhaul-20260910">
    {!active && <header className="match-progress">
      <div><small>남산 중계관 / {next.finished ? '경기 종료' : round.overtime ? '연장전' : '정규 라운드'}</small>
        <h2>{homeTeam.name} <b>{next.score[0]} : {next.score[1]}</b> {awayTeam.name}</h2>
        <p>{quick?'빠른 매치 · 2승 선착 · 매 라운드 공수 교대':'정규 매치 · 7승 선착 · 6라운드 후 교대 · 6:6 연장 8승 선착'}</p></div>
      <span>ROUND {String(round.round).padStart(2, '0')} · 내 팀 {round.homeSide}</span>
    </header>}
    {active ? <>
      <TacticalRoundLive score={next.score} input={active.input} roundNumber={active.round.round} directorSide={active.round.homeSide}
        onComplete={result => {
          if(match.rounds.length!==active.round.attempt)return;
          setHistory(previous=>[...previous,observeRound(result,active.round.homeSide==='공격'?'수비':'공격')]);
          setMatch(previous=>recordMatchRound(previous,active.round.attempt,result.winner));
        }}/>
      {completed && <div className="match-between-rounds">
        <strong>{next.finished ? `${next.score[0] > next.score[1] ? homeTeam.name : awayTeam.name} 최종 승리`
          : match.rounds.at(-1)?.winner === '무승부' ? '무승부 · 같은 라운드를 재경기합니다.'
          : next.homeSide !== active.round.homeSide ? `공수 교대 · 다음 라운드는 ${next.homeSide}입니다.` : '라운드 종료 · 다음 작전을 준비해 주세요.'}</strong>
        {next.finished ? <button onClick={onBack}>경기 종료 · 팀 검토로</button>
          : <button onClick={() => setActive(null)}>다음 라운드 편성 →</button>}
      </div>}
    </> : <OperatorPreparation key={next.attempt} homeTeam={homeTeam} awayTeam={awayTeam} homeSide={next.homeSide} seed={next.seed} history={history}
      onStart={input => setActive({ input, round: next })} onBack={onBack}/>}
  </section>;
}
