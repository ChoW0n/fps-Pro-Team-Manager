import type { TacticalCover, TacticalMapDefinition } from '../tacticalMaps';
import { breachWalls } from './breachGeometry';

export interface Fortification {
  id: string;
  owner: string;
  deployedAt: number;
  kind: 'reinforcement' | 'shield';
  wallId?: string;
  cover?: TacticalCover;
}

/** 엔진과 두 렌더러가 기록된 보강·방패·파쇄를 같은 순서로 지형에 반영합니다. */
export function battlefieldMap(base: TacticalMapDefinition, breaches: readonly {wallId:string;position:{x:number;y:number};width:number;hard?:boolean}[] = [], fortifications: readonly Fortification[] = [], openedHatches:readonly string[]=[]): TacticalMapDefinition {
  const reinforced = new Set(fortifications.filter(item=>item.kind==='reinforcement').map(item=>item.wallId));
  const walls=base.walls.map(wall=>reinforced.has(wall.id)?{...wall,reinforced:true}:wall);
  return {...base,stairs:base.stairs?.map(h=>({...h,reinforced:reinforced.has(h.id)||h.reinforced,open:h.open||openedHatches.includes(h.id)})),walls:breaches.reduce((current,hole)=>breachWalls(current,hole.wallId,hole.position,hole.width,hole.hard),walls),
    covers:[...base.covers,...fortifications.flatMap(item=>item.cover?[item.cover]:[])]};
}
