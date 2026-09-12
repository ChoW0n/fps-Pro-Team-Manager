import { useMemo, useState } from 'react';
import type { Team } from '../domain/Team';
import type { OperatorSide } from '../domain/Operator';
import { automaticLineup, assignLineup, confirmOperatorDraft } from '../domain/operatorDraft';
import { unlockMatchAudio } from './matchAudio';
import { OPERATORS } from '../domain/Operator';
import { opponentDraft, planOpponent, type RoundObservation } from '../domain/opponentAdaptation';
import { NAMSAN_MAP, layer } from '../domain/tacticalMaps';
import type { TacticalRealtimeSimulationInput } from '../domain/realtime/TacticalRealtimeSimulation';
import { TacticalBattlefield } from './TacticalBattlefield';
import './operatorPreparation.css';

const ATTACK_STYLES=[
  {id:'balanced',title:'교차 엄호',summary:'접촉한 선수를 뒤가 받치며 진입합니다.',gain:'확인된 사선을 나눠 봅니다.',risk:'첫 교전 뒤 속도가 늦어질 수 있습니다.'},
  {id:'smoke',title:'차단 후 진입',summary:'긴 사선을 끊고 내부 공간을 확보합니다.',gain:'첫 진입의 노출을 줄입니다.',risk:'우리 시야도 짧아집니다.'},
  {id:'breach',title:'변수 만들기',summary:'파쇄로 수비의 고정 각을 흔듭니다.',gain:'새 통로를 열 수 있습니다.',risk:'장약 설치 중 엄호가 필요합니다.'},
] as const;
const DEFENSE_STYLES=[
  {id:'crossfire',title:'교차 방어',summary:'두 사이트의 앵커가 서로 지원합니다.',gain:'먼저 본 선수가 팀에 알립니다.',risk:'외곽 회전은 늦을 수 있습니다.'},
  {id:'roam',title:'순환 탐지',summary:'로머가 접근 방향을 먼저 확인합니다.',gain:'진입 전에 위치를 잡을 수 있습니다.',risk:'로머가 고립될 수 있습니다.'},
  {id:'anchor',title:'거점 사수',summary:'사이트 주변에 인원을 남깁니다.',gain:'설치 저지 거리가 짧습니다.',risk:'외곽 정보가 줄어듭니다.'},
] as const;
const INTEL=[
  {id:'direct',title:'빠른 개시',summary:'양 팀 준비 뒤 바로 진입합니다.'},
  {id:'recon',title:'짧은 탐문',summary:'한 명이 반향 표식과 외곽 관측을 마친 뒤 합류합니다.'},
  {id:'careful',title:'두 명 탐문',summary:'두 명이 외곽 정보를 모아 팀에 합류합니다.'},
] as const;
const DEFENSE_PREP=[
  {id:'reinforce',title:'보강 우선',summary:'진입 벽·해치를 보강하고 전력 노드에 연결합니다.'},
  {id:'camera',title:'관측 우선',summary:'카메라와 반향 단서를 먼저 확보합니다.'},
  {id:'shield',title:'차폐 우선',summary:'거점 진입 각에 설치형 방패를 배치합니다.'},
] as const;
type Intel=typeof INTEL[number]['id'];

/** 경기는 준비에서 세 가지를 정하고, 시작 뒤에는 선수 판단과 관전에 맡깁니다. */
export function OperatorPreparation({homeTeam,awayTeam,onStart,onBack,homeSide='공격',seed=20260910,history=[]}: {
  homeTeam:Team;awayTeam:Team;homeSide?:OperatorSide;seed?:number;history?:RoundObservation[];
  onStart:(input:TacticalRealtimeSimulationInput)=>void;onBack:()=>void;
}) {
  const awaySide:OperatorSide=homeSide==='공격'?'수비':'공격';
  const [entryRoute,setEntryRoute]=useState(0),[style,setStyle]=useState<'balanced'|'smoke'|'breach'|'crossfire'|'roam'|'anchor'>(homeSide==='공격'?'balanced':'crossfire');
  const [intel,setIntel]=useState<Intel>('direct'),[defensePreparation,setDefensePreparation]=useState<'reinforce'|'camera'|'shield'>('reinforce'),[viewFloor,setViewFloor]=useState(0),[error,setError]=useState('');
  const [lineup,setLineup]=useState<string[]>(()=>automaticLineup(homeTeam,homeSide));
  const opponent=useMemo(()=>planOpponent(history,awaySide,seed),[history,awaySide,seed]);
  const draft=useMemo(()=>{try{return {away:opponentDraft(awayTeam,awaySide,opponent),error:''};}catch(cause){return {away:[],error:cause instanceof Error?cause.message:'상대 자동 편성을 만들지 못했습니다.'};}},[awayTeam,awaySide,opponent]);
  const route=NAMSAN_MAP.attackerRoutes[entryRoute],plans=homeSide==='공격'?ATTACK_STYLES:DEFENSE_STYLES;
  const selected=plans.find(plan=>plan.id===style)??plans[0];
  const site=(entryRoute===2||entryRoute===4||entryRoute===6)?'B':'A';
  function start():void {try {
    unlockMatchAudio();
    const home=assignLineup(homeTeam,homeSide,lineup),away=confirmOperatorDraft(awayTeam,awaySide,draft.away);
    const attackers=homeSide==='공격'?home:away;
    const requestedScouts=intel==='direct'?0:intel==='recon'?1:2;
    const scoutIndices=attackers.map((member,index)=>({member,index})).filter(({member})=>member.operator.role==='SEARCH').map(({index})=>index).slice(0,requestedScouts);
    for(let index=0;scoutIndices.length<requestedScouts&&index<attackers.length;index++)if(!scoutIndices.includes(index))scoutIndices.push(index);
    const scoutPlan={indices:scoutIndices,seconds:intel==='recon'?25 as const:40 as const};
    const automatedDefense=opponent.defenseStyle==='anchor'?'shield':opponent.defenseStyle==='roam'?'camera':'reinforce';
    const activeDefensePreparation=homeSide==='수비'?defensePreparation:automatedDefense;
    const reinforcements=activeDefensePreparation==='reinforce'?[entryRoute===6?'hatch-b':'hatch-a']:undefined;
    onStart({attackers:homeSide==='공격'?home:away,defenders:homeSide==='수비'?home:away,seed,maxSeconds:150,targetSite:homeSide==='공격'?site:opponent.site,
      attackStyle:homeSide==='공격'?style as 'balanced'|'smoke'|'breach':opponent.attackStyle,
      defenseStyle:homeSide==='수비'?style as 'crossfire'|'roam'|'anchor':opponent.defenseStyle,
      anticipatedEntry:homeSide==='수비'?entryRoute:opponent.anticipatedEntry,
      defensePreparation:activeDefensePreparation,
      reinforcementIds:homeSide==='수비'?reinforcements:undefined,
      scoutPlan:homeSide==='공격'?{...scoutPlan,entryRoute}:{indices:[],seconds:25,entryRoute:opponent.entry}});
  }catch(cause){setError(cause instanceof Error?cause.message:'작전을 확정하지 못했습니다.');}}
  return <section className="operator-preparation command-room" aria-label="라운드 작전 준비">
    <header className="op-prep-heading"><div><h1>라인업과 작전의 큰 방향을 고르세요.</h1><p>선수에게 오퍼레이터를 고정하지 않고, 선택한 팀 라인업을 선수 역할에 맞춰 배정합니다.</p></div><span>{homeTeam.name}<br/><b>{homeSide} · 남산 중계관</b></span></header>
    <figure className="namsan-location"><img src={`${import.meta.env.BASE_URL}maps/namsan-pavilion.png`} alt="남산 전망탑 아래 관광·방송 중계관과 산책로"/><figcaption>남산 중계관 · 서·동 계단 · 송출·배전 해치</figcaption></figure>
    <div className="simple-prep">
      <section className="simple-map"><div className="command-map"><TacticalBattlefield map={layer(NAMSAN_MAP,viewFloor)} units={[]} operators={new Map()} events={[]} time={0} selectedId={null} onSelect={()=>{}} miniature/>
        <svg className="command-route" viewBox={`0 0 ${NAMSAN_MAP.width} ${NAMSAN_MAP.height}`} aria-label="선택한 진입 경로"><polyline points={route.points.filter(point=>(point.floor??0)===viewFloor).map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="#2FD4C4" strokeWidth="16" strokeDasharray="24 14"/></svg></div>
        <div className="floor-switch">{NAMSAN_MAP.floors?.map(floor=><button key={floor.id} aria-pressed={viewFloor===floor.id} onClick={()=>setViewFloor(floor.id)}>{floor.label}</button>)}</div></section>
      <section className="choice-axis"><h2>방향</h2><p>어느 길로 장면을 시작할지 정합니다.</p><div>{NAMSAN_MAP.attackerRoutes.map((item,index)=><button key={item.id} aria-pressed={entryRoute===index} onClick={()=>setEntryRoute(index)}>{item.label}</button>)}</div><output>{route.label} · {site} 사이트 우선</output></section>
      <section className="choice-axis"><h2>교전 태도</h2><p>선수들이 교전에서 우선할 판단입니다.</p><div>{plans.map(plan=><button key={plan.id} aria-pressed={style===plan.id} onClick={()=>setStyle(plan.id)}>{plan.title}</button>)}</div><strong>{selected.title}</strong><output>{selected.summary} {selected.gain} {selected.risk}</output></section>
      {homeSide==='공격'?<section className="choice-axis"><h2>정보 우선순위</h2><p>양 팀 준비 뒤 빠르게 개시할지, 외곽 탐문을 거칠지 정합니다.</p><div>{INTEL.map(option=><button key={option.id} aria-pressed={intel===option.id} onClick={()=>setIntel(option.id)}>{option.title}</button>)}</div><output>{INTEL.find(option=>option.id===intel)?.summary}</output></section>:<section className="choice-axis"><h2>방어 준비</h2><p>같은 준비 시간에 실제로 설치할 방어 자산을 정합니다.</p><div>{DEFENSE_PREP.map(option=><button key={option.id} aria-pressed={defensePreparation===option.id} onClick={()=>setDefensePreparation(option.id)}>{option.title}</button>)}</div><output>{DEFENSE_PREP.find(option=>option.id===defensePreparation)?.summary}</output></section>}
      <section className="choice-axis lineup-axis"><h2>전술 라인업</h2><p>선수–오퍼레이터를 1:1로 묶지 않습니다. 선택한 다섯 자리를 선수 역할·능력에 맞춰 자동 배정합니다.</p><div>{OPERATORS.filter(operator=>operator.side===homeSide).map(operator=><button key={operator.callSign} aria-pressed={lineup.includes(operator.callSign)} onClick={()=>setLineup(current=>current.includes(operator.callSign)?current.filter(name=>name!==operator.callSign):current.length<5?[...current,operator.callSign]:current)}>{operator.callSign}</button>)}</div><output>{lineup.length}/5 선택 · <button onClick={()=>setLineup(automaticLineup(homeTeam,homeSide))}>자동 추천 복원</button></output></section>
    </div>
    {error||draft.error||lineup.length!==5?<p role="alert" className="op-prep-error">{error||draft.error||(lineup.length<5?'라인업 다섯 자리를 선택해 주세요.':'')}</p>:null}
    <footer><button onClick={onBack}>작전실로</button><p>양 팀 준비 → 공격 개시 → 관전 → 복기</p><button className="op-prep-start" disabled={Boolean(draft.error)||lineup.length!==5} onClick={start}>이 작전으로 출전</button></footer>
  </section>;
}
