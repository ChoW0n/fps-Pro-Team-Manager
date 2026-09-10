import { useMemo, useState } from 'react';
import type { Team } from '../domain/Team';
import { OPERATOR_ROLE_LABELS, type OperatorSide } from '../domain/Operator';
import { availableOperators, completeOperatorDraft, confirmOperatorDraft, type OperatorSelection } from '../domain/operatorDraft';
import { BREACHLINE_MAP } from '../domain/tacticalMaps';
import type { TacticalRealtimeSimulationInput } from '../domain/realtime/TacticalRealtimeSimulation';
import type { ScoutPlan } from '../domain/realtime/ScoutOperation';
import { portraitUrl } from './TacticalBattlefield';
import './operatorPreparation.css';

/** 편성과 작전을 실제 경기 입력으로 확정합니다. 저장 선수의 습득 목록은 변경하지 않습니다. */
export function OperatorPreparation({ homeTeam, awayTeam, onStart, onBack, homeSide = '공격', seed = 20260910 }: {
  homeTeam: Team; awayTeam: Team; homeSide?: OperatorSide; seed?: number; onStart: (input: TacticalRealtimeSimulationInput) => void; onBack: () => void;
}) {
  const awaySide: OperatorSide = homeSide === '공격' ? '수비' : '공격';
  const [selectedPlayer,setSelectedPlayer]=useState(0);
  const [manual,setManual]=useState<OperatorSelection>([null,null,null,null,null]);
  const [scouts,setScouts]=useState<number[]>([]);
  const [seconds,setSeconds]=useState<ScoutPlan['seconds']>(40);
  const [entryRoute,setEntryRoute]=useState(0);
  const [site,setSite]=useState<'A'|'B'>('A');
  const [error,setError]=useState('');
  const draft=useMemo(()=>{
    try { return {home:completeOperatorDraft(homeTeam,homeSide,manual),away:completeOperatorDraft(awayTeam,awaySide,[null,null,null,null,null]),error:''}; }
    catch(cause){return {home:[...manual],away:[] as OperatorSelection,error:cause instanceof Error?cause.message:'편성을 확인해 주세요.'};}
  },[homeTeam,awayTeam,manual,homeSide,awaySide]);
  const player=homeTeam.players[selectedPlayer];
  const choices=availableOperators(homeTeam,selectedPlayer,homeSide);

  /** 다른 선수의 수동 픽은 보존하고 나머지만 다시 자동 배정합니다. */
  function choose(callSign: string): void {
    const next=manual.map((value,index)=>index===selectedPlayer?callSign:value);
    try { completeOperatorDraft(homeTeam,homeSide,next);setManual(next);setError(''); }
    catch(cause){setError(cause instanceof Error?cause.message:'선택할 수 없습니다.');}
  }
  /** 네 번째 선발조 선택을 막고 나머지 선수는 진압조로 남깁니다. */
  function toggleScout(index: number): void { setScouts(current=>current.includes(index)?current.filter(value=>value!==index):current.length<3?[...current,index]:current); }
  /** 확정한 선수·오퍼레이터·작전만 넘기고 승패는 미리 계산하지 않습니다. */
  function start(): void {
    try {
      const home=confirmOperatorDraft(homeTeam,homeSide,draft.home);
      const away=confirmOperatorDraft(awayTeam,awaySide,draft.away);
      onStart({attackers:homeSide==='공격'?home:away,defenders:homeSide==='수비'?home:away,
        seed,maxSeconds:180,targetSite:homeSide==='공격'?site:'A',
        scoutPlan:homeSide==='공격'?{indices:[...scouts],seconds,entryRoute}:{indices:[],seconds:40,entryRoute:0}});
    } catch(cause){setError(cause instanceof Error?cause.message:'편성을 확정하지 못했습니다.');}
  }

  return <section className="operator-preparation" aria-label="오퍼레이터 편성과 작전 준비">
    <header className="op-prep-heading"><div><small>DRAFT ORDER / OPERATION ROOM</small><h1>다섯 명의 준비가 경기에서 드러납니다.</h1><p>{homeSide==='공격'?'습득한 오퍼레이터를 배정하고, 선발조와 진입 방향을 정해 주세요.':'수비 오퍼레이터를 편성하고 폭탄 사이트를 방어합니다.'}</p></div><span>BREACHLINE<br/><b>5 vs 5 · 폭탄전</b></span></header>
    <div className="op-prep-layout">
      <section className="op-prep-roster" aria-label={`${homeSide}팀 선수 편성`}><h2>{homeTeam.name}<small>{homeSide}팀 / 내 편성</small></h2>
        {homeTeam.players.map((member,index)=><div key={index} className={`op-prep-slot ${selectedPlayer===index?'is-selected':''}`}>
          <button onClick={()=>setSelectedPlayer(index)} aria-pressed={selectedPlayer===index}><small>{String(index+1).padStart(2,'0')} · {OPERATOR_ROLE_LABELS[member.role]}</small><strong>{member.nickname}</strong><span>{draft.home[index]??'선택 필요'} <em>{manual[index]?'수동':'자동'}</em></span></button>
          {homeSide==='공격'&&<label><input type="checkbox" checked={scouts.includes(index)} disabled={!scouts.includes(index)&&scouts.length===3} onChange={()=>toggleScout(index)}/>선발조</label>}
        </div>)}
      </section>
      <section className="op-prep-choices" aria-label="습득 오퍼레이터 선택"><div className="op-prep-choice-heading"><div><small>{player.realName} / {player.nickname}</small><h2>출전 오퍼레이터</h2></div><button onClick={()=>setManual(current=>current.map((value,index)=>index===selectedPlayer?null:value))}>자동 배정으로</button></div>
        <div className="op-prep-operator-grid">{choices.map(operator=>{const portrait=portraitUrl(operator.callSign);return <button key={operator.callSign} aria-pressed={draft.home[selectedPlayer]===operator.callSign} onClick={()=>choose(operator.callSign)}>
          {portrait?<img src={portrait} alt={`${operator.callSign} 초상`}/>:<div className="op-prep-placeholder">{operator.callSign}<small>고유 초상 준비 중</small></div>}
          <span><small>{OPERATOR_ROLE_LABELS[operator.role]}</small><strong>{operator.callSign}</strong><b>{operator.firearms[0]}</b></span>
        </button>;})}</div>
        <p className="op-prep-help">다른 선수의 수동 선택은 보존합니다. 자동 배정은 팀 내 중복 없이 남은 자리를 채웁니다.</p>
      </section>
      <section className="op-prep-plan" aria-label="감독 작전"><h2>경기 작전</h2>
        {homeSide==='공격'?<><label>목표 사이트<select value={site} onChange={event=>setSite(event.target.value as 'A'|'B')}>{BREACHLINE_MAP.sites.map(target=><option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
        <label>진입 방향<select value={entryRoute} onChange={event=>setEntryRoute(Number(event.target.value))}>{BREACHLINE_MAP.attackerRoutes.slice(0,5).map((route,index)=><option key={route.id} value={index}>{route.label}</option>)}</select></label>
        <label>선발조 수색 시간<select value={seconds} disabled={scouts.length===0} onChange={event=>setSeconds(Number(event.target.value) as ScoutPlan['seconds'])}>{[25,40,55,70].map(value=><option key={value} value={value}>{value}초</option>)}</select></label>
        <div className="op-prep-operation"><strong>{scouts.length}명 선발조 · {5-scouts.length}명 진압조</strong><p>{scouts.length?`${seconds}초 수색 → 실제 복귀 → 합류 → 재진입`:'선발조 없이 즉시 함께 진입합니다.'}</p><small>복귀 시간은 실제 이동 거리와 교전 상황에 따라 달라집니다.</small></div>
        </>:<p>사이트 거점을 유지하고, 공격팀이 설치한 해체 장치를 무력화합니다. 경기 중 감독 지시는 내 수비팀에 전달됩니다.</p>}
        <div className="op-prep-opponent"><small>{awaySide}팀 / {awayTeam.name}</small><p>{draft.away.filter(Boolean).join(' · ')}</p></div>
      </section>
    </div>
    {(error||draft.error)&&<p role="alert" className="op-prep-error">{error||draft.error}</p>}
    <footer><button onClick={onBack}>팀 검토로</button><p>부활 없음 · 라운드 경제 없음 · 제한 시간 3분</p><button className="op-prep-start" disabled={Boolean(draft.error)} onClick={start}>편성 확정 · 경기 시작 →</button></footer>
  </section>;
}
