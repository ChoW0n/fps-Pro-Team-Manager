import type { Team } from '../domain/Team';
import { completeOperatorDraft } from '../domain/operatorDraft';
import { OperatorArt } from './TacticalBattlefield';
import './gameExperience.css';

/** 작전실부터 출전까지 동일한 게임 공간 안에서 연결합니다. */
export function GameLobby({team,onStart}:{team:Team;onStart:(quick:boolean)=>void}) {
  const operators=completeOperatorDraft(team,'공격',[null,null,null,null,null]);
  return <section className="game-lobby" aria-label="DRAFT ORDER 작전실">
    <div className="lobby-title"><small>TACTICAL TEAM MANAGEMENT</small><h1>DRAFT<br/><span>ORDER</span></h1><p>당신의 준비.<br/>다섯 선수의 판단.</p></div>
    <div className="lobby-mission"><small>AVAILABLE OPERATION / 01</small><h2>남산 중계관</h2><p>좁은 출입구, 두 개의 폭탄 사이트.<br/>진입을 준비하고, 상대의 대응을 읽으세요.</p><div className="lobby-modes"><button className="lobby-deploy" data-testid="button-start-draft" onClick={()=>onStart(true)}><span>빠른 매치</span><b>작전 준비 →</b><small>2승 선착 · 매 라운드 공수 교대</small></button><button onClick={()=>onStart(false)}><b>정규 매치</b><small>7승 선착 · 6라운드 후 공수 교대</small></button></div><p className="lobby-brief">오퍼레이터와 진입 방식을 고릅니다.<br/>출전 후에는 선수들이 판단하고, 감독은 우리 팀 시야로 관전합니다.</p></div>
    <div className="lobby-squad"><header><small>YOUR SQUAD / {team.name}</small><b>5 OPERATIVES READY</b></header><div>{team.players.map((player,index)=><article key={index}><OperatorArt callSign={operators[index]??''}/><span><small>{String(index+1).padStart(2,'0')}</small><strong>{player.nickname}</strong><b>{operators[index]}</b></span></article>)}</div></div>
  </section>;
}
