import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { OperatorSide } from '../domain/Operator';
import { TacticalRealtimeSimulation, realtimeUnitId, type RealtimeEvent, type RealtimeTick, type TacticalRealtimeSimulationInput, type TacticalRealtimeResult } from '../domain/realtime/TacticalRealtimeSimulation';
import { startRoundPlayback } from '../domain/realtime/roundPlayback';
import { BOMB_RESULT_LABELS } from '../domain/realtime/BombObjective';
import { BREACHLINE_MAP, type TacticalMapDefinition } from '../domain/tacticalMaps';
import { BroadcastCanvas } from './BroadcastCanvas';
import { OperatorEmblem } from './OperatorEmblem';
import { OperatorArt } from './TacticalBattlefield';
import './matchBroadcast.css';

export interface TacticalRoundLiveProps { input:TacticalRealtimeSimulationInput; map?:TacticalMapDefinition; roundNumber?:number; directorSide?:OperatorSide; score?:[number,number]; onComplete?:(result:TacticalRealtimeResult)=>void }
/** 방송 시간은 실제 경기 시각에서 계산합니다. */
function clock(seconds:number):string { const n=Math.max(0,Math.ceil(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }

/** 감독은 하나의 경기 중계를 보며 선수 선택·관전 속도만 바꿉니다. */
export function TacticalRoundLive({input,map=BREACHLINE_MAP,roundNumber=1,directorSide='공격',score=[0,0],onComplete}:TacticalRoundLiveProps):ReactElement {
  const complete=useRef(onComplete);complete.current=onComplete;
  const [tick,setTick]=useState<RealtimeTick|null>(null),[events,setEvents]=useState<RealtimeEvent[]>([]),[result,setResult]=useState<TacticalRealtimeResult|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null),[mode,setMode]=useState<'broadcast'|'follow'|'full'>('broadcast');
  const [focusedId,setFocusedId]=useState<string|null>(null);
  const [paused,setPaused]=useState(false),[speed,setSpeed]=useState(1),[error,setError]=useState('');
  const workerRef=useRef<Worker|null>(null),controls=useRef({paused,speed});controls.current={paused,speed};
  const participants=useMemo(()=>new Map([...input.attackers,...input.defenders].map((unit,index)=>[realtimeUnitId(unit,index),unit])),[input]);
  useEffect(()=>{
    let stopped=false,reported=false,fallbackStop:(()=>void)|undefined;
    const first=[...participants].find(([,unit])=>unit.side===directorSide);
    setSelectedId(first?.[0]??null);setTick(null);setEvents([]);setResult(null);setError('');setPaused(false);controls.current.paused=false;
    /** 실시간 틱과 최종 통지를 분리해 라운드 점수를 한 번만 기록합니다. */
    const receiveTick=(next:RealtimeTick):void=>{if(stopped)return;setTick(next);setEvents(previous=>[...previous,...next.events].slice(-240));};
    const receiveResult=(value:TacticalRealtimeResult):void=>{if(stopped||reported)return;reported=true;setResult(value);complete.current?.(value);};
    if(typeof Worker!=='undefined'){
      const worker=new Worker(new URL('../domain/realtime/tactical.worker.ts',import.meta.url),{type:'module'});workerRef.current=worker;
      worker.onmessage=event=>{if(event.data.type==='tick')receiveTick(event.data.tick);else if(event.data.type==='complete')receiveResult(event.data.result);else if(event.data.type==='error')setError('경기를 계속할 수 없습니다. 작전실에서 다시 시작해 주세요.');};
      worker.onerror=()=>setError('경기 계산을 불러오지 못했습니다. 새로고침 후 다시 시작해 주세요.');
      worker.postMessage({type:'start',input,map,controls:controls.current});
    }else fallbackStop=startRoundPlayback(new TacticalRealtimeSimulation(map).createSession(input),()=>controls.current,receiveTick,receiveResult);
    return()=>{stopped=true;fallbackStop?.();workerRef.current?.terminate();workerRef.current=null;};
  },[input,map,directorSide,participants]);
  useEffect(()=>{workerRef.current?.postMessage({type:'controls',controls:{paused,speed}});},[paused,speed]);
  const units=tick?.snapshot.units??[],time=tick?.time??0,own=units.filter(unit=>unit.side===directorSide);
  // 자동 중계 카드도 실제 카메라 선수의 이름·체력·탄약을 표시합니다.
  const viewedId=mode==='broadcast'?focusedId??selectedId:selectedId;
  const selected=own.find(unit=>unit.id===viewedId),source=viewedId?participants.get(viewedId):undefined;
  const known=events.filter(event=>event.seenBy?.includes(directorSide));
  const kills=known.filter(event=>event.type==='death'&&time-event.time<6).slice(-4);
  const objective=tick?.snapshot.objective,active=objective?.phase==='active'||objective?.phase==='disabling';
  const left=(active?objective?.activeUntil:input.maxSeconds??180)??180;
  const outcome=result?.objective.reason?BOMB_RESULT_LABELS[result.objective.reason]:'';
  /** 실제 참가자 이름을 사용하며 확인하지 못한 공격자의 신원은 숨깁니다. */
  const playerName=(id?:string):string=>participants.get(id??'')?.player.nickname??'미확인';
  /** 현재 시야 또는 관측한 발사 사건으로 확인한 공격자만 킬 피드에 표시합니다. */
  const killerName=(event:RealtimeEvent):string=>participants.get(event.actor??'')?.side===directorSide||tick?.snapshot.visibleTo?.[directorSide].includes(event.actor??'')||known.some(shot=>shot.type==='shot'&&shot.actor===event.actor&&Math.abs(event.time-shot.time)<.5)?playerName(event.actor):'미확인';
  /** 번호나 인물 카드를 고르면 해당 선수 시야로 관전합니다. */
  function select(id:string):void{if(participants.get(id)?.side!==directorSide)return;setSelectedId(id);setMode('follow');}
  return <section className="match-broadcast" aria-label="DRAFT ORDER 경기 중계" data-version="personal-broadcast-20260911">
    <BroadcastCanvas tick={tick} events={events} map={map} side={directorSide} selectedId={selectedId} mode={mode} speed={speed} paused={paused} onSelect={select} onFocus={setFocusedId}/>
    <header className="cast-scorebar">
      {(['공격','수비'] as OperatorSide[]).map(side=><div key={side} className={`cast-team ${side==='공격'?'is-attack':'is-defense'}`}><span><small>{side==='공격'?'ATK':'DEF'}{side===directorSide?' / OUR TEAM':''}</small><strong>{(side==='공격'?input.attackers:input.defenders)[0]?.teamName}</strong></span><b>{score[side===directorSide?0:1]}</b><div className="cast-life" aria-label={side===directorSide?'우리 팀 생존 상태':'상대 생존 상태 미확인'}>{[0,1,2,3,4].map(index=><i key={index} className={side===directorSide?(own[index]?.alive?'is-alive':'is-out'):'is-unknown'}/>)}</div></div>)}
      <div className={`cast-clock ${active?'is-active':''}`}><small>ROUND {String(roundNumber).padStart(2,'0')}</small><b>{clock(left-time)}</b><span>{active?'장치 가동':paused?'PAUSED':'LIVE'}</span></div>
    </header>

    <div className="cast-intel" aria-label="확인한 상대 오퍼레이터"><small>ENEMY INTEL</small><div>{[0,1,2,3,4].map(index=>{const callSign=tick?.snapshot.identifiedTo?.[directorSide]?.[index];return <span key={index} className={callSign?'is-identified':''}><OperatorEmblem callSign={callSign} unknown={!callSign}/><b>{callSign??'미확인'}</b></span>;})}</div></div>
    <div className="cast-killfeed" aria-label="킬 피드">{kills.map((event,index)=><div key={`${event.time}-${index}`}><b>{killerName(event)}</b><svg viewBox="0 0 40 16" width="32" height="14" aria-label="처치"><path d="M2 6h7l4-3h15v3h10v2H26l-3 6h-4l1-6h-7l-3 3H2Z" fill="currentColor"/></svg><strong>{playerName(event.target)}</strong></div>)}</div>
    {active&&<div className="cast-objective"><span className="cast-device-icon">▣</span><strong>{objective?.siteId} · 해체 장치 가동</strong><progress max="45" value={Math.max(0,left-time)}/></div>}
    {(result||error)&&<div className="cast-outcome" role="status"><small>{error?'MATCH INTERRUPTED':'ROUND COMPLETE'}</small><h2>{error||`${result!.winner===directorSide?'라운드 승리':'라운드 패배'}`}</h2><p>{outcome}</p></div>}
    <div className="cast-player" aria-label="관전 선수"><div className="cast-portrait">{selected&&<OperatorArt callSign={selected.callSign}/>}</div><div><small>{source?.operator.unit.country} / {selected?.callSign}</small><strong>{source?.player.nickname??'입장 중'}</strong><span>{selected?.weaponName}</span><div className="cast-vitals"><b>{selected?Math.ceil(selected.hp):'—'}<small> HP</small></b><b>{selected?.ammo??'—'}<small> / {selected?.reserveAmmo??'—'}</small></b></div><progress max="100" value={selected?.hp??100}/>{selected?.reloadRemaining? <span className="cast-reload">장전 <progress max="3" value={3-selected.reloadRemaining}/></span>:null}</div></div>
    <nav className="cast-controls" aria-label="중계 조작"><button aria-pressed={mode==='broadcast'} onClick={()=>setMode('broadcast')}><span>자동 중계</span><b>CAST</b></button><button aria-pressed={mode==='full'} onClick={()=>setMode(mode==='full'?'broadcast':'full')}><span>전술 보기</span><b>MAP</b></button><button aria-label={paused?'재생':'일시 정지'} disabled={Boolean(result)} onClick={()=>setPaused(value=>!value)}>{paused?'▶':'Ⅱ'}</button><select aria-label="중계 속도" value={speed} onChange={event=>setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></nav>
    <nav className="cast-lineup" aria-label="우리 팀 선수 선택">{own.map((unit,index)=>{const participant=participants.get(unit.id);return <button key={unit.id} className={unit.alive?'':'is-out'} aria-pressed={selectedId===unit.id} onClick={()=>select(unit.id)}><OperatorEmblem callSign={unit.callSign}/><small>{index+1}</small><strong>{playerName(unit.id)}</strong><span>{unit.callSign}<em>{participant?.operator.equipment.name}</em></span><progress max="100" value={unit.hp}/></button>;})}</nav>
  </section>;
}
