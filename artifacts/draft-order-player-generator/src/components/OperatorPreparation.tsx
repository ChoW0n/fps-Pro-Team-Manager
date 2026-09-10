import { useMemo, useState } from 'react';
import type { Team } from '../domain/Team';
import { OPERATOR_ROLE_LABELS, type OperatorSide } from '../domain/Operator';
import { availableOperators, completeOperatorDraft, confirmOperatorDraft, type OperatorSelection } from '../domain/operatorDraft';
import { opponentDraft, planOpponent, type RoundObservation } from '../domain/opponentAdaptation';
import { BREACHLINE_MAP } from '../domain/tacticalMaps';
import type { TacticalRealtimeSimulationInput } from '../domain/realtime/TacticalRealtimeSimulation';
import type { ScoutPlan } from '../domain/realtime/ScoutOperation';
import { OperatorArt, TacticalBattlefield } from './TacticalBattlefield';
import './operatorPreparation.css';

const ATTACK_PLANS=[
  {id:'balanced',title:'교차 엄호',summary:'선두가 접촉하면 뒤의 선수가 다른 각을 확보합니다.',gain:'기본 진입과 확인된 엄폐에 수류탄 압박',risk:'긴 사선에서는 멈춰 조준하는 시간이 필요합니다.'},
  {id:'smoke',title:'차단 후 진입',summary:'길게 막힌 사선을 연막으로 끊고 목표에 접근합니다.',gain:'장거리 교전 회피 · 설치 접근 보조',risk:'우리 팀 시야도 가려집니다. 연막은 총알을 막지 않습니다.'},
  {id:'breach',title:'변수 만들기',summary:'진입 담당이 가까운 파괴 가능 내벽에 통로를 냅니다.',gain:'새 출입구 · 수비의 고정 각 흔들기',risk:'장약 설치 중 무방비 · 폭음으로 위치 노출'},
] as const;
const DEFENSE_PLANS=[
  {id:'crossfire',title:'교차 방어',summary:'A/B 앵커를 남기고 접근 방향의 교차각을 준비합니다.',gain:'한 명이 접촉하면 다른 선수가 보고를 받아 대응',risk:'다른 방향으로 돌아오는 상대의 발견이 늦을 수 있습니다.'},
  {id:'roam',title:'로머 순환',summary:'거점 두 명을 남기고 두 명이 순환하며 진입을 탐지합니다.',gain:'카메라·관측 보고를 통한 측면 압박',risk:'로머가 고립되면 사이트 지원이 늦어집니다.'},
  {id:'anchor',title:'거점 사수',summary:'사이트 주변 인원과 관측 카메라를 유지합니다.',gain:'설치 저지 · 짧은 지원 거리',risk:'외곽 공간을 내주므로 연막·파쇄 진입에 주의하세요.'},
] as const;

/** 실제 연결된 행동만 설명해 선택 전 예상 장면을 알려 드립니다. */
function equipmentBrief(callSign:string,role:string):string {
  if(callSign==='REUSS')return '전방 방패 · 정면 피해 완화, 측면 노출';
  if(callSign==='MEDVED')return '파쇄 장약 · 내벽 통로 개방';
  if(role==='DEFENSIVE_SETUP'||role==='BLOCKING')return '관측 카메라 · 접근 보고';
  if(role==='SEARCH')return '공격 시 연막 · 사선 차단';
  if(['BRANDT','SAVELLI'].includes(callSign))return '정밀 사선 · 관측 보고에 재배치';
  return '공격 시 수류탄 · 확인한 엄폐 압박';
}

/** 편성 화면의 선택과 설명을 동일한 실제 경기 입력으로 확정합니다. */
export function OperatorPreparation({homeTeam,awayTeam,onStart,onBack,homeSide='공격',seed=20260910,history=[]}: {
  homeTeam:Team;awayTeam:Team;homeSide?:OperatorSide;seed?:number;history?:RoundObservation[];
  onStart:(input:TacticalRealtimeSimulationInput)=>void;onBack:()=>void;
}) {
  const awaySide:OperatorSide=homeSide==='공격'?'수비':'공격';
  const [selectedPlayer,setSelectedPlayer]=useState(0),[manual,setManual]=useState<OperatorSelection>([null,null,null,null,null]);
  const [scouts,setScouts]=useState<number[]>([]),[seconds,setSeconds]=useState<ScoutPlan['seconds']>(25);
  const [entryRoute,setEntryRoute]=useState(0),[site,setSite]=useState<'A'|'B'>('A');
  const [attackStyle,setAttackStyle]=useState<'balanced'|'smoke'|'breach'>('balanced');
  const [defenseStyle,setDefenseStyle]=useState<'crossfire'|'roam'|'anchor'>('crossfire');
  const [error,setError]=useState('');
  const opponent=useMemo(()=>planOpponent(history,awaySide,seed),[history,awaySide,seed]);
  const draft=useMemo(()=>{
    try{return {home:completeOperatorDraft(homeTeam,homeSide,manual),away:opponentDraft(awayTeam,awaySide,opponent),error:''};}
    catch(cause){return {home:[...manual],away:[] as OperatorSelection,error:cause instanceof Error?cause.message:'편성을 확인해 주세요.'};}
  },[homeTeam,awayTeam,homeSide,awaySide,manual,opponent]);
  const choices=availableOperators(homeTeam,selectedPlayer,homeSide),player=homeTeam.players[selectedPlayer];
  const route=BREACHLINE_MAP.attackerRoutes[entryRoute];
  const plans=homeSide==='공격'?ATTACK_PLANS:DEFENSE_PLANS;
  const strategy=plans.find(plan=>plan.id===(homeSide==='공격'?attackStyle:defenseStyle))!;
  const prior=history.at(-1);
  /** 중복과 미습득 선택을 즉시 막고 다른 선수의 수동 편성을 보존합니다. */
  function choose(callSign:string):void {
    const next=manual.map((value,index)=>index===selectedPlayer?callSign:value);
    try{completeOperatorDraft(homeTeam,homeSide,next);setManual(next);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'선택할 수 없습니다.');}
  }
  /** 선발조는 최대 세 명이며 진압조도 출입구 대기선까지 전진합니다. */
  function toggleScout(index:number):void {setScouts(current=>current.includes(index)?current.filter(value=>value!==index):current.length<3?[...current,index]:current);}
  /** 상대 대응은 과거 관측으로 미리 준비하며 현재 수동 선택을 읽지 않습니다. */
  function start():void {
    try {
      const home=confirmOperatorDraft(homeTeam,homeSide,draft.home),away=confirmOperatorDraft(awayTeam,awaySide,draft.away);
      onStart({attackers:homeSide==='공격'?home:away,defenders:homeSide==='수비'?home:away,seed,maxSeconds:180,
        targetSite:homeSide==='공격'?site:opponent.site,attackStyle:homeSide==='공격'?attackStyle:opponent.attackStyle,
        defenseStyle:homeSide==='수비'?defenseStyle:opponent.defenseStyle,anticipatedEntry:homeSide==='수비'?entryRoute:opponent.anticipatedEntry,
        scoutPlan:homeSide==='공격'?{indices:[...scouts],seconds,entryRoute}:{indices:[],seconds:25,entryRoute:opponent.entry}});
    }catch(cause){setError(cause instanceof Error?cause.message:'편성을 확정하지 못했습니다.');}
  }
  return <section className="operator-preparation command-room" aria-label="오퍼레이터 편성과 작전 준비">
    <header className="op-prep-heading"><div><small>PREPARE / {homeSide==='공격'?'ATTACK':'DEFEND'}</small><h1>이번 라운드, 어떻게 풀어갈까요?</h1><p>작전은 여기서 정하고, 경기에서는 선수의 판단을 지켜봅니다.</p></div><span>{homeTeam.name}<br/><b>{homeSide} · 북부 연구동</b></span></header>
    <div className="command-layout">
      <section className="command-map-panel" aria-label="작전 지도 미리보기"><div className="command-map"><TacticalBattlefield map={BREACHLINE_MAP} units={[]} operators={new Map()} events={[]} time={0} selectedId={null} onSelect={()=>{}} miniature/>
        <svg className="command-route" viewBox={`0 0 ${BREACHLINE_MAP.width} ${BREACHLINE_MAP.height}`} aria-label="선택한 진입 구간과 목표">
          <polyline points={route.points.slice(0,3).map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke={homeSide==='공격'?'#2FD4C4':'#F0873C'} strokeWidth="16" strokeDasharray="24 14"/>
          {route.points.slice(0,3).map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="34" fill="#0E1113" stroke="#2FD4C4" strokeWidth="7"/><text x={point.x} y={point.y+12} textAnchor="middle" fill="#fff" fontSize="34">{index+1}</text></g>)}
          {BREACHLINE_MAP.sites.map(target=><g key={target.id} opacity={homeSide==='수비'||site===target.id?1:.4}><circle cx={target.plantAnchors[0].x} cy={target.plantAnchors[0].y} r="80" fill="#FFC53D" fillOpacity=".2" stroke="#FFC53D" strokeWidth="6"/><text x={target.plantAnchors[0].x} y={target.plantAnchors[0].y+20} textAnchor="middle" fill="#FFC53D" fontSize="65">{target.id}</text></g>)}
        </svg></div><div className="command-map-caption"><b>{homeSide==='공격'?'진입 구간':'예상 적 접근'} / {route.label}</b><span>번호 순서로 접근 · 내부 이동은 현장 상황에 따라 판단</span></div>
        <div className="command-routes">{BREACHLINE_MAP.attackerRoutes.slice(0,5).map((route,index)=><button key={route.id} aria-pressed={entryRoute===index} onClick={()=>setEntryRoute(index)}>{route.label.replace(' 진입','')}</button>)}</div>
      </section>
      <section className="command-strategy" aria-label="작전 선택과 예상 효과"><small>01 / {homeSide==='공격'?'진입 방식':'방어 방식'}</small><div className="strategy-tabs">{plans.map(plan=><button key={plan.id} aria-pressed={strategy.id===plan.id} onClick={()=>homeSide==='공격'?setAttackStyle(plan.id as typeof attackStyle):setDefenseStyle(plan.id as typeof defenseStyle)}>{plan.title}</button>)}</div>
        <h2>{strategy.title}</h2><p>{strategy.summary}</p><dl><dt>기대하는 장면</dt><dd>{strategy.gain}</dd><dt>감수할 위험</dt><dd>{strategy.risk}</dd></dl>
        {homeSide==='공격'&&<><div className="command-site"><b>02 / 설치 목표</b>{BREACHLINE_MAP.sites.map(target=><button key={target.id} aria-pressed={site===target.id} onClick={()=>setSite(target.id)}>{target.label}</button>)}</div><div className="command-scout"><label>03 / 선발조 {scouts.length}명 · 진압조 {5-scouts.length}명<select value={seconds} disabled={!scouts.length} onChange={event=>setSeconds(Number(event.target.value) as ScoutPlan['seconds'])}>{[25,40,55,70].map(value=><option key={value} value={value}>{value}초 수색</option>)}</select></label><p>{scouts.length?`선발조는 ${seconds}초 관측 후 복귀합니다. 진압조는 입구까지 따라간 뒤 합류하여 함께 들어갑니다. 수색을 늘리면 관측 기회와 노출 위험이 함께 늘고, 설치할 시간이 줄어듭니다.`:'아래 선수 카드에서 선발조를 고를 수 있습니다. 0명은 정보를 기다리지 않고 다섯 명이 즉시 진입합니다.'}</p></div></>}
        <p className="command-intel">{prior?'상대도 지난 라운드에서 확인한 진입·가젯·설치 위치를 복기합니다. 같은 경로를 반복했다면 방향이나 진입 방식을 바꿔 보세요.':'첫 라운드입니다. 상대의 숨겨진 편성과 위치는 아직 알 수 없습니다.'}</p>
      </section>
    </div>
    <div className="command-lineup" aria-label="선수별 오퍼레이터 편성">{homeTeam.players.map((member,index)=><div key={index} className={`command-player ${selectedPlayer===index?'is-selected':''}`}><button onClick={()=>setSelectedPlayer(index)} aria-pressed={selectedPlayer===index}><OperatorArt callSign={draft.home[index]??''}/><span><small>{String(index+1).padStart(2,'0')} / {OPERATOR_ROLE_LABELS[member.role]}</small><strong>{member.nickname}</strong><b>{draft.home[index]??'선택 필요'}</b></span></button>{homeSide==='공격'&&<label><input type="checkbox" checked={scouts.includes(index)} disabled={!scouts.includes(index)&&scouts.length===3} onChange={()=>toggleScout(index)}/>선발조 배정</label>}</div>)}</div>
    <section className="command-picks" aria-label="습득 오퍼레이터 선택"><header><div><small>{player.nickname} / 출전 장비</small><h2>누구와 출전할까요?</h2></div><button onClick={()=>setManual(current=>current.map((value,index)=>index===selectedPlayer?null:value))}>이 선수 자동 배정</button></header><div className="command-pick-options">{choices.map(operator=><button key={operator.callSign} aria-pressed={draft.home[selectedPlayer]===operator.callSign} onClick={()=>choose(operator.callSign)}><OperatorArt callSign={operator.callSign}/><span><strong>{operator.callSign}</strong><small>{operator.firearms[0]}</small><b>{OPERATOR_ROLE_LABELS[operator.role]}</b><small>{equipmentBrief(operator.callSign,operator.role)}</small></span></button>)}</div><p className="op-prep-help">{player.nickname} · 조준 {player.aim} / 숙련 {player.mastery} / 공격성 {player.aggression} — 조준·숙련은 점사와 재조준을, 공격성은 위험을 감수할 타이밍을 바꿉니다.</p></section>
    {(error||draft.error)&&<p role="alert" className="op-prep-error">{error||draft.error}</p>}
    <footer><button onClick={onBack}>작전실로</button><p>준비 → 관전 → 복기 → 다음 작전 · 기본 중계 2×</p><button className="op-prep-start" disabled={Boolean(draft.error)} onClick={start}>편성 확정 · 출전 →</button></footer>
  </section>;
}
