import { FOCUS_HALF_ANGLE, PERIPHERAL_HALF_ANGLE, angleDifference, sightRange } from './perception';
import type { OperatorSide } from '../Operator';
import { layer, type TacticalMapDefinition, type TacticalPoint } from '../tacticalMaps';
import type { RealtimeEvent, RealtimeGadget, RealtimeUnitState } from './TacticalRealtimeSimulation';

export type ObservedContact = { position: TacticalPoint; seenAt: number };
/** 보인 적의 좌표 사본만 갱신하고, 사라진 적은 추적하지 않은 채 1초 뒤 지웁니다. */
export function rememberContacts(contacts: Map<string, ObservedContact>, observed: readonly RealtimeUnitState[], observedAt: number, time: number): void {
  for(const unit of observed) contacts.set(unit.id,{position:{...unit.position},seenAt:observedAt});
  for(const [id,contact] of contacts) if(time-contact.seenAt>1) contacts.delete(id);
}

/** 카메라는 우리 선수와 현재 관측된 상대를 함께 담고, 정보 밖 상대를 따라가지 않습니다. */
export function combatCamera(units: readonly RealtimeUnitState[], events: readonly RealtimeEvent[], side: OperatorSide, time: number, selectedId: string | null, follow=false, preferredId?:string|null) {
  const friends=units.filter(unit=>unit.side===side&&unit.alive);
  const fallen=units.filter(unit=>unit.side===side&&!unit.alive);
  const shots=[...events].reverse().filter(event=>event.type==='shot'&&time>=event.time&&time-event.time<2.5
    && units.some(unit=>unit.id===event.actor&&unit.side===side || unit.id===event.target&&unit.side===side));
  // 진행 중인 교전은 유지하되, 비전투 선수의 홀드 때문에 새 교전을 버리지 않습니다.
  const recent=shots.find(event=>event.actor===preferredId||event.target===preferredId)??shots[0];
  const actor=units.find(unit=>unit.id===recent?.actor&&unit.alive),target=units.find(unit=>unit.id===recent?.target&&unit.alive);
  const selected=friends.find(unit=>unit.id===selectedId);
  const fallenSelected=fallen.find(unit=>unit.id===selectedId);
  const objectiveActor=friends.find(unit=>unit.action==='plant'||unit.action==='disable');
  const aiming=friends.find(unit=>['aim','fire'].includes(unit.action)&&unit.knowledge.source==='self-visual'&&time-(unit.knowledge.lastKnownAt??-Infinity)<.3&&unit.knowledge.lastKnownPosition);
  const focus=follow?selected??friends[0]??fallenSelected??fallen.at(-1):actor?.side===side?actor:target?.side===side?target:aiming??objectiveActor??friends.find(unit=>unit.id===preferredId)??selected??friends[0]??fallenSelected??fallen.at(-1);
  const other=follow?undefined:actor?.id===focus?.id?target:actor;
  const lastKnown=[...events].reverse().find(event=>event.position&&time-event.time<8);
  const a=focus?.position??lastKnown?.position??{x:1800,y:1200};
  const observedAim=focus?.knowledge.source==='self-visual'&&time-(focus.knowledge.lastKnownAt??-Infinity)<.3?focus.knowledge.lastKnownPosition:undefined;
  const b=other?.position??(!follow?observedAim:undefined)??a;
  // 최소 두세 개 방을 함께 보여 선수 한 명이 화면을 뒤덮거나 교전 상대가 프레임 밖으로 빠지지 않게 합니다.
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.max(900,Math.abs(a.x-b.x)*1.45+260,Math.abs(a.y-b.y)*1.65+260),focusId:focus?.id??null};
}
/** 전체 지도는 실제 종횡비를 보존하고 교전 확대는 지도 경계 안에 맞춥니다. */
export function cameraViewport(map: Pick<TacticalMapDefinition, 'width' | 'height'>, framing: { x: number; y: number; width: number }, full: boolean) {
  if (full) return { x: 0, y: 0, width: map.width, height: map.height };
  const width = Math.min(map.width, map.height * 1.65, framing.width);
  const height = width / 1.65;
  return {
    x: Math.max(0, Math.min(map.width - width, framing.x - width / 2)),
    y: Math.max(0, Math.min(map.height - height, framing.y - height / 2)),
    width, height,
  };
}

/** 시야 마스크의 광선은 벽·엄폐물 앞에서 끝납니다. 관측 범위는 AI와 같은 전방·주변 식별 범위를 사용합니다. */
export function visionPolygon(unit: RealtimeUnitState, map: TacticalMapDefinition, smokes:readonly RealtimeGadget[]=[]): string {
  map=layer(map,unit.floor??unit.position.floor??0);
  smokes=smokes.filter(smoke=>(smoke.floor??smoke.position.floor??0)===(unit.floor??unit.position.floor??0));
  const segments=map.walls.filter(wall=>wall.kind!=='door-gap').map(wall=>[wall.from,wall.to]);
  for(const cover of map.covers) {
    const r=cover.rect,p=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
    p.forEach((point,index)=>segments.push([point,p[(index+1)%4]]));
  }
  const origin=unit.position,points:TacticalPoint[]=[origin];
  // 일정 간격 광선에 모서리 양옆과 식별 거리 경계를 추가해 틈으로 면이 새지 않게 합니다.
  const angles=new Set<number>();
  for(let i=0;i<=24;i++)angles.add(-PERIPHERAL_HALF_ANGLE+i/24*PERIPHERAL_HALF_ANGLE*2);
  for(const angle of [-FOCUS_HALF_ANGLE,FOCUS_HALF_ANGLE,...segments.flatMap(segment=>segment.map(point=>angleDifference(Math.atan2(point.y-origin.y,point.x-origin.x),unit.facing)))]) {
    for(const offset of [-.00001,0,.00001])if(Math.abs(angle+offset)<=PERIPHERAL_HALF_ANGLE)angles.add(angle+offset);
  }
  for(const relative of [...angles].sort((a,b)=>a-b)) {
    const angle=unit.facing+relative,dx=Math.cos(angle),dy=Math.sin(angle);
    let limit=sightRange(relative);
    for(const [a,b] of segments) {
      const sx=b.x-a.x,sy=b.y-a.y,den=dx*sy-dy*sx;if(Math.abs(den)<1e-8)continue;
      const ax=a.x-origin.x,ay=a.y-origin.y,t=(ax*sy-ay*sx)/den,u=(ax*dy-ay*dx)/den;
      if(t>=0&&u>=0&&u<=1)limit=Math.min(limit,t);
    }
    for(const smoke of smokes) {
      const ox=origin.x-smoke.position.x,oy=origin.y-smoke.position.y,projection=ox*dx+oy*dy;
      const discriminant=projection*projection-(ox*ox+oy*oy-smoke.radius*smoke.radius);
      if(ox*ox+oy*oy<smoke.radius*smoke.radius)limit=0;
      else if(discriminant>=0){const near=-projection-Math.sqrt(discriminant);if(near>=0)limit=Math.min(limit,near);}
    }
    points.push({x:origin.x+dx*limit,y:origin.y+dy*limit});
  }
  return points.map(point=>`${point.x},${point.y}`).join(' ');
}

/** 운반·설치와 무력화 진행도는 해당 팀 또는 실제 관측자에게만 공개합니다. */
export function directorObjective(state:import('./BombObjective').BombState|undefined,side:OperatorSide,visibleIds:readonly string[],deviceVisible=false):import('./BombObjective').BombState|undefined {
  if(!state||state.phase==='resolved')return state;
  const active=state.phase==='active'||state.phase==='disabling';
  if(side==='수비'&&!active&&!visibleIds.includes(state.interactingId??'')&&!deviceVisible)return {phase:'carried',progress:0};
  if(side==='공격'&&state.phase==='disabling'&&!visibleIds.includes(state.interactingId??''))return {...state,phase:'active',interactingId:undefined,interactionStartedAt:undefined,progress:0};
  return side==='수비'?{...state,carrierId:undefined}:state;
}
