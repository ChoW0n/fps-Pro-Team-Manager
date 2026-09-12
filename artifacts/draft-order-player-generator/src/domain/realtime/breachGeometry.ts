import type { TacticalMapDefinition, TacticalPoint } from '../tacticalMaps';
/** 엔진과 화면이 동일한 벽 절단 좌표를 사용합니다. 원래 지도는 변경하지 않습니다. */
export function breachWalls(walls:TacticalMapDefinition['walls'],wallId:string,position:TacticalPoint,width:number,hard=false):TacticalMapDefinition['walls'] {
  const wall=walls.find(candidate=>candidate.id===wallId);
  if(!wall||wall.reinforced&&!hard)return walls;
  const length=Math.hypot(wall.to.x-wall.from.x,wall.to.y-wall.from.y);
  const dx=(wall.to.x-wall.from.x)/length,dy=(wall.to.y-wall.from.y)/length;
  return walls.flatMap(candidate=>candidate.id!==wallId?[candidate]:[
    {...wall,id:wall.id+'-left',to:{x:position.x-dx*width/2,y:position.y-dy*width/2}},
    {...wall,id:wall.id+'-right',from:{x:position.x+dx*width/2,y:position.y+dy*width/2}},
  ]);
}
