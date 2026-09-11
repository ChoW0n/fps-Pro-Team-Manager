import { memo, useId, useMemo, type ReactElement } from 'react';
import { breachWalls } from '../domain/realtime/breachGeometry';
import { visionPolygon } from '../domain/realtime/spectatorView';
import type { BombState } from '../domain/realtime/BombObjective';
import type { Operator } from '../domain/Operator';
import type { RealtimeEvent, RealtimeSnapshot, RealtimeGadget, RealtimeBreach } from '../domain/realtime/TacticalRealtimeSimulation';
import type { TacticalMapDefinition } from '../domain/tacticalMaps';
import { operatorVisual, operatorStateVisual, OPERATOR_SCALE, TEMPORARY_OPERATOR_SCALE } from '../domain/operatorVisuals';

export const SIDE_COLOR = { 공격: '#2FD4C4', 수비: '#F0873C' };
const ASSET_ROOT = `${import.meta.env.BASE_URL}operators/`;
export type BattleUnit = RealtimeSnapshot['units'][number];

/** 배포 하위 경로에서도 같은 정적 인물 파일을 읽습니다. */
export function portraitUrl(callSign: string): string | undefined {
  const visual = operatorVisual(callSign);
  return visual?.portrait ? ASSET_ROOT + visual.portrait : undefined;
}

/** 편성과 선수 카드에서도 같은 고유 원화를 재사용합니다. */
export function OperatorArt({callSign}: {callSign:string}): ReactElement {
  const visual=operatorVisual(callSign),portrait=portraitUrl(callSign),clipId=useId().replaceAll(':','');
  return portrait?<img src={portrait} alt={`${callSign} 오퍼레이터`}/>:visual?.region?<svg viewBox={`0 0 ${visual.width} ${visual.height}`} role="img" aria-label={`${callSign} 장비 원화`}>
    <defs><clipPath id={clipId}><rect width={visual.width} height={visual.height}/></clipPath></defs>
    <g clipPath={`url(#${clipId})`}><image href={ASSET_ROOT+visual.sprite} x={-visual.region[0]} y={-visual.region[1]} width={visual.sheetWidth??1254} height={visual.sheetHeight??1254}/></g>
  </svg>:<span>{callSign}</span>;
}

/** 미제작 인물의 임시 몸체와 주무기 종류를 표현합니다. 제조사 도면은 아닙니다. */
function TemporaryOperator({ operator }: { operator: Operator }): ReactElement {
  const heavy = operator.role === 'DEFENSIVE_SETUP';
  const scout = operator.role === 'SEARCH';
  const bullpup = /P90|X95/.test(operator.firearms[0]);
  const precision = /PSG|C14/.test(operator.firearms[0]);
  return <g stroke="#101416" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M-11 -13 Q-20 -9 -16 0 Q-20 11 -8 16 L4 13 L9 -10 Z" fill={heavy ? '#687078' : '#656552'} />
    <path d="M-9 -12 L3 -11 L7 10 L-10 12 Z" fill="#303a3d" />
    <path d="M-7 -10 L-3 -10 L-3 -4 L-7 -4 Z M-7 0 L-3 0 L-3 7 L-7 7 Z" fill="#859087" />
    <path d="M0 -13 Q5 -20 12 -13 L24 -3 L20 2 L7 -6 M0 12 Q11 20 18 8 L23 2 L17 -2 L9 7" fill={scout ? '#988b73' : '#5d676b'} />
    <ellipse cx="0" cy="0" rx={heavy ? 10 : 8.5} ry={heavy ? 10.5 : 9} fill={scout ? '#605c50' : '#747e80'} />
    <path d="M3 -7 Q10 -6 10 1 L6 6" fill="#242c31" />
    {heavy && <path d="M7 -7 L12 -4 L12 5 L7 7 Z" fill="#9aaab0" />}
    <rect x="-4" y="-3" width="5" height="6" rx="1" fill="#414f58" />
    <g fill="#262c2d" stroke="#a0a4a0" strokeWidth=".55">
      <path d="M8 -2 L17 -2 L17 3 L9 3 Z" />
      <path d={bullpup ? 'M10 -3 L29 -3 L30 3 L10 3 Z' : 'M16 -3 L28 -3 L28 3 L15 3 Z'} />
      <path d={bullpup ? 'M12 3 L15 3 L15 8 L11 7 Z' : 'M20 3 L24 3 L23 9 L19 8 Z'} />
      <path d="M27 -2 L34 -2 L34 2 L27 2 Z" />
      <path d="M34 -1 L40 -1 L40 1 L34 1 Z" />
      {precision ? <rect x="18" y="-5" width="12" height="3" rx="1" /> : <rect x="21" y="-4" width="4" height="2" />}
      <path d="M28 -1 L32 -1 M28 1 L32 1" />
    </g>
  </g>;
}

/** Canvas와 같은 실제 자세·좌표를 사용하며 정지 원화로 없는 동작을 만들지 않습니다. */
function Soldier({ unit, operator, selected, onSelect, time }: {
  unit: BattleUnit; operator: Operator; selected: boolean; onSelect: (id: string) => void; time:number;
}): ReactElement {
  const visual = operatorStateVisual(unit, time);
  const scale = visual?.scale ?? OPERATOR_SCALE;
  const clipId=useId().replaceAll(':','');
  const color = SIDE_COLOR[unit.side];
  return <g role="button" tabIndex={0} aria-label={`${unit.callSign} 선수 선택`} aria-pressed={selected}
    data-unit-id={unit.id} className={`battle-soldier ${unit.alive ? '' : 'is-out'}`}
    onClick={() => onSelect(unit.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(unit.id); } }}>
    <title>{`${unit.callSign} · ${unit.weaponName} · ${unit.goal}${visual ? '' : ' · 임시 외형'}`}</title>
    <g transform={`translate(${unit.position.x} ${unit.position.y})`}>
      {(unit.alive||selected)&&<circle r="17" fill="transparent" stroke={selected ? '#FFC53D' : color} strokeWidth={selected ? 2.5 : 1.3} strokeDasharray={unit.side === '수비' ? '5 4' : undefined} />}
      <g transform={`rotate(${(unit.facing + (visual?.rotationOffset ?? 0)) * 180 / Math.PI})`}>
        {visual?.region ? <g>
          <defs><clipPath id={clipId}><rect x={-visual.pivot[0]*scale} y={-visual.pivot[1]*scale} width={visual.width*scale} height={visual.height*scale}/></clipPath></defs>
          <g clipPath={`url(#${clipId})`}><image href={ASSET_ROOT+visual.sprite} x={-(visual.region[0]+visual.pivot[0])*scale} y={-(visual.region[1]+visual.pivot[1])*scale} width={(visual.sheetWidth??1254)*scale} height={(visual.sheetHeight??1254)*scale}/></g>
        </g> : visual ? <image href={ASSET_ROOT + visual.sprite} x={-visual.pivot[0] * scale} y={-visual.pivot[1] * scale}
          width={visual.width * scale} height={visual.height * scale} /> : <g transform={`scale(${TEMPORARY_OPERATOR_SCALE})`}><TemporaryOperator operator={operator} /></g>}
        {unit.shieldRaised&&<g aria-label="실제 전방 방패 방어"><path d="M15 -19 L23 -16 L23 17 L15 20 Z" fill="#4F606B" stroke="#BCC6C9" strokeWidth="1.2"/><path d="M18 -10 L22 -9 L22 3 L18 4 Z" fill="#172C3B" stroke="#788E9A" strokeWidth=".6"/></g>}
        <path d="M-5 -15 L0 -15 L0 -12 L-5 -12 Z" fill={color} />
      </g>
      {!unit.alive && <path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#E5484D" strokeWidth="3" />}
      {unit.reloadRemaining > 0 && <text y="-29" textAnchor="middle" className="battle-label reload-label">장전 {unit.reloadRemaining.toFixed(1)}</text>}
       {unit.alive&&<text y="30" textAnchor="middle" className="battle-label">{unit.callSign}</text>}
    </g>
  </g>;
}

/** 투척 시작·착지 시각에 정의된 가젯 궤적만 그립니다. */
function gadgetPosition(gadget:RealtimeGadget,time:number):{x:number;y:number} {
  if(!gadget.from||gadget.thrownAt===undefined||gadget.landedAt===undefined||time>=gadget.landedAt)return gadget.position;
  const amount=Math.max(0,Math.min(1,(time-gadget.thrownAt)/(gadget.landedAt-gadget.thrownAt)));
  return {x:gadget.from.x+(gadget.position.x-gadget.from.x)*amount,y:gadget.from.y+(gadget.position.y-gadget.from.y)*amount};
}

/** 문 폭과 축을 시각 표식의 사각형으로 변환합니다. */
function portalRect(portal: TacticalMapDefinition['portals'][number]): { x: number; y: number; width: number; height: number } {
  return portal.axis === 'horizontal'
    ? { x: portal.center.x - portal.width / 2, y: portal.center.y - 10, width: portal.width, height: 20 }
    : { x: portal.center.x - 10, y: portal.center.y - portal.width / 2, width: 20, height: portal.width };
}

/** 충돌 데이터의 방·문·벽·엄폐 영역을 같은 지도 데이터로 그립니다. */
const Interior = memo(function Interior({ map, detail }: { map: TacticalMapDefinition; detail: boolean }): ReactElement {
  return <g>
    <defs><pattern id={`floor-${detail?'detail':'small'}`} width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#56636A"/><path d="M0 0 H80 V80" fill="none" stroke="#859296" strokeWidth="1" opacity=".3"/><path d="M4 4 H76" fill="none" stroke="#A3ACAA" strokeWidth="1" opacity=".15"/></pattern></defs>
    <rect width={map.width} height={map.height} fill="#202B30" />
    <rect {...map.building} fill="#535d61" />
    {map.rooms.map((room) => <g key={room.id}>
      <rect {...room.rect} fill={room.kind === 'yard' ? '#303D40' : room.kind === 'corridor' ? '#747A75' : `url(#floor-${detail?'detail':'small'})`} />
      {detail && room.kind !== 'yard' && <g stroke="#82908f" opacity=".16" strokeWidth="1">
        {Array.from({ length: Math.floor(room.rect.width / 80) }, (_, index) => <path key={index} d={`M${room.rect.x + (index + 1) * 80} ${room.rect.y} v${room.rect.height}`} />)}
      </g>}
      <text x={room.rect.x + 20} y={room.rect.y + 34} className="battle-room" style={{fontSize:detail?15:28}}>{room.label}</text>
    </g>)}
    <rect {...map.building} fill="none" stroke="#87918f" strokeWidth="4" />
    {map.sites.map((site) => <g key={site.id}>
      <rect {...site.bounds} fill="none" stroke="#FFC53D" strokeWidth="3" strokeDasharray="18 14" opacity=".8" />
      <text x={site.bounds.x + 16} y={site.bounds.y + 28} className="battle-room">{site.label}</text>
    </g>)}
    {map.portals.map((portal) => <g key={portal.id}>
      <rect {...portalRect(portal)} fill="#c7b27a" opacity=".5" stroke="#f4d88a" strokeWidth="3" />
      {detail && <text x={portal.center.x} y={portal.center.y - 24} textAnchor="middle" className="battle-door-label">{portal.label}</text>}
    </g>)}
    {map.entrances.map((entrance) => <g key={entrance.id}>
      <line x1={entrance.outside.x} y1={entrance.outside.y} x2={entrance.inside.x} y2={entrance.inside.y} stroke="#FFC53D" strokeWidth="4" strokeDasharray="14 10" />
      <text x={entrance.outside.x} y={entrance.outside.y - 18} textAnchor="middle" className="battle-room">{entrance.label}</text>
    </g>)}
    {map.walls.filter(wall => wall.kind !== 'door-gap').map(wall => <g key={wall.id}>
      <line x1={wall.from.x} y1={wall.from.y} x2={wall.to.x} y2={wall.to.y} stroke="#242c30" strokeWidth="18" />
      <line x1={wall.from.x} y1={wall.from.y} x2={wall.to.x} y2={wall.to.y} stroke="#a0aaa9" strokeWidth="9" />
      {[wall.from, wall.to].map((point, index) => <rect key={index} x={point.x - 6} y={point.y - 6} width="12" height="12" fill="#d1d3c9" />)}
    </g>)}
    {map.covers.map((cover, index) => <g key={cover.id}>
      <rect x={cover.rect.x+9} y={cover.rect.y+12} width={cover.rect.width} height={cover.rect.height} fill="#10181CB0"/><rect {...cover.rect} fill="#202a30" stroke="#a2aaa4" strokeWidth="2" />
      <rect x={cover.rect.x + 4} y={cover.rect.y + 4} width={cover.rect.width - 8} height={cover.rect.height - 8} fill={index === 3 ? '#93836c' : '#48545a'} />
      {Array.from({ length: Math.floor((cover.rect.width > cover.rect.height ? cover.rect.width : cover.rect.height) / 24) }, (_, n) => cover.rect.width > cover.rect.height
        ? <path key={n} d={`M${cover.rect.x + 12 + n * 24} ${cover.rect.y + 6} v${cover.rect.height - 12}`} stroke="#273237" strokeWidth="2" />
        : <path key={n} d={`M${cover.rect.x + 6} ${cover.rect.y + 12 + n * 24} h${cover.rect.width - 12}`} stroke="#273237" strokeWidth="3" />)}
      {detail && /console|desk|bench/.test(cover.id) && <g>
        <rect x={cover.rect.x+14} y={cover.rect.y+8} width={Math.min(45,cover.rect.width-25)} height={Math.min(18,cover.rect.height-14)} rx="2" fill="#152930" stroke="#92A7A9" strokeWidth="1"/>
        <path d={`M${cover.rect.x+19} ${cover.rect.y+14} h22 m-22 5 h15`} stroke="#538A90" strokeWidth="2"/>
        <rect x={cover.rect.x+72} y={cover.rect.y+12} width="23" height="14" rx="2" fill="#8C9998"/>
      </g>}
      {detail && /rack|cabinet/.test(cover.id) && <g>
        {Array.from({length:Math.max(1,Math.floor(cover.rect.height/24))},(_,row)=><g key={row}>
          <rect x={cover.rect.x+8} y={cover.rect.y+9+row*24} width="5" height="3" fill="#7FBDAD"/>
          <path d={`M${cover.rect.x+19} ${cover.rect.y+10+row*24} h14`} stroke="#8E9B9D" strokeWidth="2"/>
        </g>)}
      </g>}
      {detail && /crat|cargo|yard/.test(cover.id) && <path d={`M${cover.rect.x+8} ${cover.rect.y+8} L${cover.rect.x+cover.rect.width-8} ${cover.rect.y+cover.rect.height-8} M${cover.rect.x+cover.rect.width-8} ${cover.rect.y+8} L${cover.rect.x+8} ${cover.rect.y+cover.rect.height-8}`} stroke="#9C8D70" strokeWidth="3"/>}
      {detail && /core|pipes/.test(cover.id) && <g>
        <rect x={cover.rect.x+10} y={cover.rect.y+10} width={cover.rect.width-20} height={cover.rect.height-20} rx="10" fill="#607A80" stroke="#9EADAE" strokeWidth="2"/>
        <path d={`M${cover.rect.x+24} ${cover.rect.y+6} v${cover.rect.height-12} M${cover.rect.x+cover.rect.width-24} ${cover.rect.y+6} v${cover.rect.height-12}`} stroke="#BDCBC6" strokeWidth="3"/>
      </g>}
    </g>)}
  </g>;
});

/** 전체 지도와 확대 화면이 같은 스냅샷·사건 기록을 그립니다. */
export function TacticalBattlefield({ map:baseMap, units, operators, events, time, objective, selectedId, onSelect, viewBox, visionUnits, gadgets=[], breaches=[], miniature = false }: {
  map: TacticalMapDefinition; units: BattleUnit[]; operators: Map<string, Operator>; events: RealtimeEvent[];
  time: number; objective?: BombState; selectedId: string | null; onSelect: (id: string) => void; viewBox?: string; visionUnits?: BattleUnit[]; gadgets?:RealtimeGadget[];breaches?:RealtimeBreach[]; miniature?: boolean;
}): ReactElement {
  const maskId=useId().replaceAll(':','');
  const map=useMemo(()=>({...baseMap,walls:breaches.reduce((walls,breach)=>breachWalls(walls,breach.wallId,breach.position,breach.width),baseMap.walls)}),[baseMap,breaches]);
  const smokes=useMemo(()=>gadgets.filter(gadget=>gadget.kind==='smoke'&&time>=gadget.activeAt&&time<gadget.until),[gadgets,time]);
  const sight=useMemo(()=>visionUnits?.map(unit=>({id:unit.id,points:visionPolygon(unit,map,smokes),position:unit.position})),[visionUnits,map,smokes]);
  return <svg className={miniature ? 'battle-mini-map' : 'battlefield'} viewBox={viewBox ?? `0 0 ${map.width} ${map.height}`}
    aria-label={miniature ? '전체 전황 전략 보기' : '인물과 총기가 표시되는 실시간 경기'}>
    <Interior map={map} detail={!miniature && Boolean(viewBox && Number(viewBox.split(' ')[2]) < map.width / 2)} />
    {visionUnits&&<><defs><mask id={maskId}><rect width={map.width} height={map.height} fill="white"/>{sight!.map(unit=><g key={unit.id}><polygon points={unit.points} fill="black"/></g>)}</mask></defs><rect width={map.width} height={map.height} fill="#03080D" opacity=".86" mask={`url(#${maskId})`} pointerEvents="none"/></>}
    {objective?.devicePosition && <g transform={`translate(${objective.devicePosition.x} ${objective.devicePosition.y})`} aria-label="실제 해체 장치 위치">
      <rect x="-12" y="-9" width="24" height="18" rx="2" fill="#242d31" stroke="#FFC53D" strokeWidth="2" />
      <rect x="-7" y="-5" width="10" height="7" fill={objective.activeUntil ? '#2FD4C4' : '#8A959B'} />
      <path d="M-5 -9 v-4 h10 v4" fill="none" stroke="#c1c8c5" strokeWidth="2" />
      {!miniature && <text y="-20" textAnchor="middle" className="battle-label">{objective.phase === 'dropped' ? '유실 장치' : objective.phase === 'planting' ? '설치 중' : '해체 장치'}</text>}
    </g>}
    {gadgets.filter(gadget=>gadget.until>time).map(gadget=><g key={gadget.id} transform={`translate(${gadgetPosition(gadget,time).x} ${gadgetPosition(gadget,time).y})`} aria-label={gadget.kind==='smoke'?'실제 연막':gadget.kind==='camera'?'관측 카메라':'수류탄 신관'}>
      {gadget.kind==='smoke'&&time>=gadget.activeAt?<g fill="#A7B4B8" opacity=".94"><circle r={gadget.radius} fill="#7C919A"/>{[-1,0,1].map((n,index)=><ellipse key={n} cx={n*gadget.radius*.35} cy={index%2?20:-13} rx={gadget.radius*.65} ry={gadget.radius*.72} opacity=".65"/>)}</g>:gadget.kind==='camera'?<g><path d="M-12 -6 h20 v12 h-20 Z M8 -4 l6 -5 v18 l-6 -5 Z" fill="#53676F" stroke="#9CB0B9" strokeWidth="2"/><circle cx="0" cy="0" r="4" fill="#6EA8FF"/></g>:gadget.kind==='grenade'?<g><circle r="7" fill="#63724B" stroke="#FFC53D" strokeWidth="2"/><circle r="18" fill="none" stroke="#F0873C" strokeWidth="2" strokeDasharray={`${Math.max(0,(gadget.activeAt-time)*70)} 120`}/></g>:null}
    </g>)}
    {units.map(unit => {
      const operator = operators.get(unit.id);
      return miniature ? <circle key={unit.id} cx={unit.position.x} cy={unit.position.y} r={unit.id === selectedId ? 22 : 15}
        fill={unit.alive ? SIDE_COLOR[unit.side] : '#E5484D'} stroke={unit.id === selectedId ? '#fff' : '#101416'} strokeWidth="5" />
        : operator && <Soldier key={unit.id} unit={unit} operator={operator} selected={unit.id === selectedId} onSelect={onSelect} time={time} />;
    })}
    {!miniature && events.filter(event => event.type === 'shot' && event.position && event.targetPosition && time >= event.time && time - event.time <= Math.max(.1, event.travelSeconds ?? .1)).map((shot, index) => {
      const progress = Math.min(1, (time - shot.time) / Math.max(.1, shot.travelSeconds ?? .1));
      const start = Math.max(0, progress - .15);
      const dx = shot.targetPosition!.x - shot.position!.x, dy = shot.targetPosition!.y - shot.position!.y;
      return <g key={`${shot.time}-${index}`}>
        <line x1={shot.position!.x + dx * start} y1={shot.position!.y + dy * start} x2={shot.position!.x + dx * progress} y2={shot.position!.y + dy * progress} stroke="#ffe3a2" strokeWidth="1.7" />
        {time - shot.time < .11 && <circle cx={shot.position!.x} cy={shot.position!.y} r="3.5" fill="#fff1c4" />}
      </g>;
    })}
    {!miniature && events.filter(event => event.type === 'impact' && event.position && event.hit && time - event.time >= 0 && time - event.time < .3).map((event, index) => <circle key={index} cx={event.position!.x} cy={event.position!.y} r="6" stroke="#E5484D" fill="none" strokeWidth="2" />)}
  </svg>;
}
