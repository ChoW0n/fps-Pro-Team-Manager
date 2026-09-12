import type { RealtimeEvent, RealtimeGadget } from './TacticalRealtimeSimulation';
import type { TacticalPoint } from '../tacticalMaps';

export const GADGET_LABELS:Record<RealtimeGadget['kind'],string>={smoke:'연막',grenade:'수류탄',camera:'카메라',probe:'반향 표식',power:'전력 노드',interceptor:'요격기',emp:'EMP'};
export const electronic=(gadget:RealtimeGadget):boolean=>['camera','probe','power','interceptor'].includes(gadget.kind);
export const gadgetActive=(gadget:RealtimeGadget,time:number):boolean=>time>=gadget.activeAt&&time<gadget.until&&time>=(gadget.disabledUntil??0);
const distance=(a:TacticalPoint,b:TacticalPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

/** 판정과 두 지도 렌더러가 같은 투척 궤적을 사용합니다. */
export function gadgetPosition(gadget:RealtimeGadget,time:number):TacticalPoint {
  if(!gadget.from||gadget.thrownAt===undefined||gadget.landedAt===undefined||time>=gadget.landedAt)return gadget.position;
  const amount=Math.max(0,Math.min(1,(time-gadget.thrownAt)/(gadget.landedAt-gadget.thrownAt)));
  return {...(gadget.floor?{floor:gadget.floor}:{}),x:gadget.from.x+(gadget.position.x-gadget.from.x)*amount,y:gadget.from.y+(gadget.position.y-gadget.from.y)*amount};
}

/** 두 발 요격 → EMP 착지 → 8초 전자장비 정지 순서입니다. 연막 자체는 소거하지 않습니다. */
export function resolveElectronicCounters(gadgets:RealtimeGadget[],time:number,clearLine:(a:TacticalPoint,b:TacticalPoint)=>boolean):RealtimeEvent[] {
  const events:RealtimeEvent[]=[];
  for(const projectile of [...gadgets]){
    if(!['smoke','grenade','emp'].includes(projectile.kind)||time>=projectile.activeAt||time>=(projectile.landedAt??projectile.activeAt))continue;
    const point=gadgetPosition(projectile,time);
    const interceptor=gadgets.find(gadget=>gadget.kind==='interceptor'&&(gadget.floor??gadget.position.floor??0)===(projectile.floor??projectile.position.floor??0)&&gadget.side!==projectile.side&&gadgetActive(gadget,time)&&(gadget.charges??0)>0
      &&distance(gadget.position,point)<=gadget.radius&&clearLine(gadget.position,point));
    if(!interceptor)continue;
    interceptor.charges!--;gadgets.splice(gadgets.indexOf(projectile),1);
    events.push({time,type:'utility',actor:interceptor.owner,position:{...point},goal:'projectile-intercepted',message:`${GADGET_LABELS[projectile.kind]} 요격 · 잔여 ${interceptor.charges}발`,side:interceptor.side});
  }
  for(const pulse of [...gadgets].filter(gadget=>gadget.kind==='emp'&&gadgetActive(gadget,time))){
    // EMP는 벽을 통과하지만 반경 안의 아군 전자장비도 정지합니다. 적 위치는 공개하지 않습니다.
    for(const device of gadgets.filter(electronic))if((device.floor??device.position.floor??0)===(pulse.floor??pulse.position.floor??0)&&distance(device.position,pulse.position)<=pulse.radius)device.disabledUntil=Math.max(device.disabledUntil??0,time+8);
    gadgets.splice(gadgets.indexOf(pulse),1);
    events.push({time,type:'utility',actor:pulse.owner,position:{...pulse.position},goal:'emp-pulse',message:'EMP 방출 · 반경 내 전자장비 8초 정지',side:pulse.side});
  }
  return events;
}

export function poweredWall(gadgets:readonly RealtimeGadget[],wallId:string,time:number):boolean {
  return gadgets.some(gadget=>gadget.kind==='power'&&gadget.wallId===wallId&&gadgetActive(gadget,time));
}
