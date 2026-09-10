import type { OperatorSide } from '../Operator';
import type { TacticalMapDefinition, TacticalPoint } from '../tacticalMaps';
import type { RealtimeEvent, RealtimeGadget, RealtimeUnitState } from './TacticalRealtimeSimulation';

/** 카메라는 우리 선수와 현재 관측된 상대를 함께 담고, 정보 밖 상대를 따라가지 않습니다. */
export function combatCamera(units: readonly RealtimeUnitState[], events: readonly RealtimeEvent[], side: OperatorSide, time: number, selectedId: string | null, follow=false, preferredId?:string|null) {
  const friends=units.filter(unit=>unit.side===side&&unit.alive);
  const recent=[...events].reverse().find(event=>event.type==='shot'&&time-event.time<2.5&&(!preferredId||event.actor===preferredId||event.target===preferredId)
    && units.some(unit=>unit.id===event.actor&&unit.side===side || unit.id===event.target&&unit.side===side));
  const actor=units.find(unit=>unit.id===recent?.actor),target=units.find(unit=>unit.id===recent?.target);
  const selected=friends.find(unit=>unit.id===selectedId);
  const objectiveActor=friends.find(unit=>unit.action==='plant'||unit.action==='disable');
  const focus=follow?selected??friends[0]:actor?.side===side&&actor.alive?actor:target?.side===side&&target.alive?target:objectiveActor??friends.find(unit=>unit.id===preferredId)??selected??friends[0];
  const other=follow?undefined:actor?.id===focus?.id?target:actor;
  const a=focus?.position??{x:1800,y:1200},b=other?.position??a;
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.max(430,Math.abs(a.x-b.x)*1.45+210,Math.abs(a.y-b.y)*1.65+210),focusId:focus?.id??null};
}
/** 시야 마스크의 광선은 벽·엄폐물 앞에서 끝납니다. 관측 범위는 AI와 같은 전방 144도입니다. */
export function visionPolygon(unit: RealtimeUnitState, map: TacticalMapDefinition, smokes:readonly RealtimeGadget[]=[]): string {
  const segments=map.walls.filter(wall=>wall.kind!=='door-gap').map(wall=>[wall.from,wall.to]);
  for(const cover of map.covers) {
    const r=cover.rect,p=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
    p.forEach((point,index)=>segments.push([point,p[(index+1)%4]]));
  }
  const origin=unit.position,points:TacticalPoint[]=[origin];
  for(let i=0;i<=48;i++) {
    const angle=unit.facing-Math.PI*.4+i/48*Math.PI*.8,dx=Math.cos(angle),dy=Math.sin(angle);
    let limit=1200;
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
