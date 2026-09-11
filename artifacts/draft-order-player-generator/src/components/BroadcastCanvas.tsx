import { useEffect, useRef, type ReactElement } from 'react';
import type { OperatorSide } from '../domain/Operator';
import { operatorVisual, OPERATOR_SCALE } from '../domain/operatorVisuals';
import { TacticalRealtimeSimulation, type RealtimeEvent, type RealtimeTick, type RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { breachWalls } from '../domain/realtime/breachGeometry';
import { angleDifference } from '../domain/realtime/perception';
import { cameraViewport, combatCamera, visionPolygon } from '../domain/realtime/spectatorView';
import type { TacticalMapDefinition } from '../domain/tacticalMaps';

const COLORS = { 공격: '#2FD4C4', 수비: '#F0873C' };
const ROOT = `${import.meta.env.BASE_URL}operators/`;
type Props = { tick: RealtimeTick | null; events: RealtimeEvent[]; map: TacticalMapDefinition; side: OperatorSide; selectedId: string | null; mode: 'broadcast' | 'follow' | 'full'; speed: number; paused: boolean; onSelect: (id: string) => void };

/** 브라우저와 이미지 기반 렌더 검사에서 모두 디코딩 완료 여부를 같은 기준으로 판정합니다. */
function imageReady(image: HTMLImageElement): boolean {
  return image.complete === undefined ? image.width > 0 : image.complete && image.naturalWidth > 0;
}

/** 기록된 두 스냅샷 사이만 보간하며 사망·새 출현과 미래 위치를 외삽하지 않습니다. */
export function interpolateUnit(previous: RealtimeUnitState, next: RealtimeUnitState | undefined, amount: number): RealtimeUnitState {
  if (!next || previous.alive !== next.alive) return previous;
  return { ...previous, position: { x: previous.position.x + (next.position.x-previous.position.x)*amount, y: previous.position.y+(next.position.y-previous.position.y)*amount },
    facing: previous.facing + angleDifference(next.facing, previous.facing)*amount };
}

/** 정적인 실내 구조는 한 번 그려 캐시하며 파괴된 벽도 같은 지형 데이터를 사용합니다. */
export function paintBattleMap(ctx: CanvasRenderingContext2D, map: TacticalMapDefinition): void {
  ctx.fillStyle='#273237'; ctx.fillRect(0,0,map.width,map.height);
  ctx.fillStyle='#536268'; ctx.fillRect(map.building.x,map.building.y,map.building.width,map.building.height);
  for(const room of map.rooms) {
    const r=room.rect; ctx.fillStyle=room.kind==='yard'?'#364246':room.kind==='corridor'?'#7C817A':'#65737A';ctx.fillRect(r.x,r.y,r.width,r.height);
    if(room.kind!=='yard'){ctx.strokeStyle='#A7B3AD25';ctx.lineWidth=1;ctx.beginPath();for(let x=r.x;x<r.x+r.width;x+=80){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.height);}for(let y=r.y;y<r.y+r.height;y+=80){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.width,y);}ctx.stroke();}
    ctx.font='18px sans-serif';ctx.fillStyle='#CBD2CD99';ctx.fillText(room.label,r.x+20,r.y+34);
  }
  for(const site of map.sites){ctx.strokeStyle='#FFC53D';ctx.lineWidth=3;ctx.setLineDash([18,14]);ctx.strokeRect(site.bounds.x,site.bounds.y,site.bounds.width,site.bounds.height);ctx.setLineDash([]);ctx.fillStyle='#FFD66C';ctx.font='bold 30px sans-serif';ctx.fillText(site.id,site.bounds.x+20,site.bounds.y+42);}
  for(const wall of map.walls.filter(w=>w.kind!=='door-gap')){
    ctx.beginPath();ctx.moveTo(wall.from.x,wall.from.y);ctx.lineTo(wall.to.x,wall.to.y);ctx.strokeStyle='#1D282E';ctx.lineWidth=22;ctx.stroke();ctx.strokeStyle=wall.breachable?'#B7AA91':'#ADB9B8';ctx.lineWidth=10;ctx.stroke();
    if(wall.breachable){ctx.setLineDash([20,10]);ctx.strokeStyle='#6D6555';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
  }
  for(const cover of map.covers){const r=cover.rect;ctx.fillStyle='#16212699';ctx.fillRect(r.x+8,r.y+10,r.width,r.height);ctx.fillStyle='#374A52';ctx.fillRect(r.x,r.y,r.width,r.height);ctx.strokeStyle='#A5B3AF';ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.width,r.height);
    ctx.strokeStyle='#182F39';ctx.beginPath();if(r.width>r.height){for(let x=r.x+12;x<r.x+r.width;x+=24){ctx.moveTo(x,r.y+4);ctx.lineTo(x,r.y+r.height-4);}}else{for(let y=r.y+12;y<r.y+r.height;y+=24){ctx.moveTo(r.x+4,y);ctx.lineTo(r.x+r.width-4,y);}}ctx.stroke();
    if(/desk|bench|console/.test(cover.id)){ctx.fillStyle='#122D3B';ctx.fillRect(r.x+12,r.y+8,Math.min(48,r.width-20),Math.min(23,r.height-14));ctx.fillStyle='#74B6BB';ctx.fillRect(r.x+17,r.y+13,22,2);ctx.fillRect(r.x+17,r.y+18,14,2);}
    if(/rack|cabinet/.test(cover.id)){for(let y=r.y+9;y<r.y+r.height-5;y+=24){ctx.fillStyle='#82CDB8';ctx.fillRect(r.x+8,y,4,3);}}
  }
}

/** 한 개의 캔버스에서 기록된 이동과 사건을 재생합니다. 카메라 프레임은 React 상태를 갱신하지 않습니다. */
export function BroadcastCanvas(props: Props): ReactElement {
  const canvasRef=useRef<HTMLCanvasElement>(null),latest=useRef(props);latest.current=props;
  const timeline=useRef<{previous:RealtimeTick;next:RealtimeTick;received:number}|null>(null);
  useEffect(()=>{if(!props.tick)return;const prior=timeline.current?.next;timeline.current={previous:prior&&prior.time<props.tick.time?prior:props.tick,next:props.tick,received:performance.now()};},[props.tick]);
  useEffect(()=>{
    const canvas=canvasRef.current!; const ctx=canvas.getContext('2d',{alpha:false})!;
    const images=new Map<string,HTMLImageElement>();
    /** 인물과 동작 아틀라스는 한 번만 읽고 디코드된 이미지를 재사용합니다. */
    const asset=(file:string):HTMLImageElement=>{let image=images.get(file);if(!image){image=new Image();image.src=ROOT+file;images.set(file,image);}return image;};
    asset('movement-legs-atlas.webp');
    let frame=0,scene:HTMLCanvasElement|null=null,sceneKey='',visionKey='';
    let cachedVision:RealtimeUnitState[]=[];let cachedVisibleIds=new Set<string>();let cachedPolygons:string[]=[],camera={x:0,y:0,width:430,height:260};
    let focusId:string|null=null,holdUntil=0,lastStamp=0;
    let hitTargets:Array<{id:string;x:number;y:number}>=[];
    const observer=new TacticalRealtimeSimulation(props.map);
    /** 캔버스 좌표를 실제 월드 좌표로 되돌려 우리 선수만 선택합니다. */
    const select=(event:PointerEvent):void=>{const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*canvas.width,y=(event.clientY-rect.top)/rect.height*canvas.height;const nearest=hitTargets.map(target=>({...target,distance:Math.hypot(x-target.x,y-target.y)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<45*(window.devicePixelRatio||1))latest.current.onSelect(nearest.id);};
    canvas.addEventListener('pointerup',select);
    /** 실제 틱 사이의 이동만 표시하고 발사·탄착은 그 사건의 기록 위치와 시각으로 그립니다. */
    const draw=(stamp:number):void=>{
      frame=requestAnimationFrame(draw);const state=timeline.current,p=latest.current;if(!state)return;
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(rect.width<700?1:1.5,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const amount=p.paused?1:Math.min(1,Math.max(0,(stamp-state.received)/(100/p.speed)));
      const time=state.previous.time+(state.next.time-state.previous.time)*amount;
      const nextUnits=new Map(state.next.snapshot.units.map(unit=>[unit.id,unit]));
      const units=state.previous.snapshot.units.map(unit=>interpolateUnit(unit,nextUnits.get(unit.id),amount));
      const snapshot=state.previous.snapshot,breaches=snapshot.breaches??[];
      const map={...p.map,walls:breaches.reduce((walls,breach)=>breachWalls(walls,breach.wallId,breach.position,breach.width),p.map.walls)};
      const events=p.events.filter(event=>event.time<=time&&event.seenBy?.includes(p.side));
      const teamVisible=units.filter(unit=>unit.side===p.side||snapshot.visibleTo?.[p.side].includes(unit.id));
      const framing=combatCamera(teamVisible,events,p.side,time,p.selectedId,p.mode==='follow',time<holdUntil?focusId:undefined);
      if(framing.focusId!==focusId||time>=holdUntil){focusId=framing.focusId;holdUntil=time+2.5;}
      const focus=units.find(unit=>unit.id===focusId&&unit.side===p.side);
      const currentVision=p.mode==='full'?units.filter(unit=>unit.side===p.side&&unit.alive):focus?.alive?[focus]:[];
      const nextVisionKey=state.next.time+':'+p.mode+':'+(focus?.id??'none')+':'+breaches.length;
      if(nextVisionKey!==visionKey){visionKey=nextVisionKey;cachedVision=currentVision;cachedVisibleIds=new Set(units.filter(unit=>unit.id===focus?.id||p.mode==='full'&&unit.side===p.side||currentVision.some(friend=>observer.canObserve(friend,unit.position,map,snapshot.gadgets,state.next.time))).map(unit=>unit.id));cachedPolygons=currentVision.map(unit=>visionPolygon(unit,map,(snapshot.gadgets??[]).filter(g=>g.kind==='smoke'&&state.next.time>=g.activeAt&&state.next.time<g.until)));}
      const vision=cachedVision,visible=units.filter(unit=>cachedVisibleIds.has(unit.id));
      const actualFrame=combatCamera(visible,events,p.side,time,p.selectedId,p.mode==='follow',focusId);
      const noFriendAlive=!units.some(unit=>unit.side===p.side&&unit.alive);
      if(noFriendAlive&&snapshot.objective?.devicePosition){actualFrame.x=snapshot.objective.devicePosition.x;actualFrame.y=snapshot.objective.devicePosition.y;actualFrame.width=520;}
      const viewport=cameraViewport(map,actualFrame,p.mode==='full');
      // 기기 화면 비율을 반영해 넓은 화면의 교전과 세로 화면의 인물이 모두 잘리지 않게 합니다.
      if(p.mode!=='full'){viewport.height=Math.min(map.height,viewport.width*h/w);viewport.y=Math.max(0,Math.min(map.height-viewport.height,actualFrame.y-viewport.height/2));}
      const elapsed=Math.min(.05,(stamp-lastStamp)/1000||.016);lastStamp=stamp;
      const blend=window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:1-Math.exp(-elapsed*9);
      for(const key of ['x','y','width','height'] as const)camera[key]+=(viewport[key]-camera[key])*blend;
      const scale=Math.min(w/camera.width,h/camera.height),ox=(w-camera.width*scale)/2,oy=(h-camera.height*scale)/2;
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080E12';ctx.fillRect(0,0,w,h);ctx.setTransform(scale,0,0,scale,ox-camera.x*scale,oy-camera.y*scale);
      const key=p.map.id+':'+breaches.map(b=>b.wallId+':'+b.position.x+':'+b.position.y).join(',');
      if(!scene||key!==sceneKey){scene=document.createElement('canvas');scene.width=Math.ceil(map.width/2);scene.height=Math.ceil(map.height/2);const sceneContext=scene.getContext('2d')!;sceneContext.scale(.5,.5);paintBattleMap(sceneContext,map);sceneKey=key;}
      ctx.globalAlpha=.18;ctx.drawImage(scene,camera.x/2,camera.y/2,camera.width/2,camera.height/2,camera.x,camera.y,camera.width,camera.height);ctx.globalAlpha=1;
      const smokes=(snapshot.gadgets??[]).filter(g=>g.kind==='smoke'&&time>=g.activeAt&&time<g.until);
      ctx.save();ctx.beginPath();for(const unit of vision){const points=(cachedPolygons[vision.indexOf(unit)]??'').split(' ').map(point=>point.split(',').map(Number));points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.clip();ctx.drawImage(scene,camera.x/2,camera.y/2,camera.width/2,camera.height/2,camera.x,camera.y,camera.width,camera.height);ctx.restore();
      for(const portal of map.portals.filter(portal=>portal.traversal)){
        if(!vision.some(friend=>observer.canObserve(friend,portal.center,map,snapshot.gadgets,time)))continue;
        const opened=snapshot.openedPortals?.includes(portal.id);ctx.save();ctx.translate(portal.center.x,portal.center.y);if(portal.axis==='vertical')ctx.rotate(Math.PI/2);ctx.fillStyle=portal.traversal==='window'?(opened?'#A7CDCE33':'#86CEDB88'):'#B7A984';ctx.fillRect(-portal.width/2,-6,portal.width,12);ctx.strokeStyle='#D9E4D8';ctx.lineWidth=2;ctx.strokeRect(-portal.width/2,-8,portal.width,16);if(opened){ctx.beginPath();ctx.moveTo(-portal.width/2,-12);ctx.lineTo(-portal.width/2+8,3);ctx.lineTo(-portal.width/2+15,-8);ctx.stroke();}ctx.restore();
      }
      for(const gadget of snapshot.gadgets??[]){if(time>=gadget.until)continue;const flight=gadget.from&&gadget.landedAt&&gadget.thrownAt!==undefined?Math.max(0,Math.min(1,(time-gadget.thrownAt)/(gadget.landedAt-gadget.thrownAt))):1;const point=gadget.from?{x:gadget.from.x+(gadget.position.x-gadget.from.x)*flight,y:gadget.from.y+(gadget.position.y-gadget.from.y)*flight}:gadget.position;if(gadget.side!==p.side&&!vision.some(friend=>observer.canObserve(friend,point,map,snapshot.gadgets,time)))continue;ctx.beginPath();ctx.arc(point.x,point.y,gadget.kind==='smoke'&&time>=gadget.activeAt?gadget.radius:gadget.kind==='camera'?7:5,0,Math.PI*2);ctx.fillStyle=gadget.kind==='smoke'&&time>=gadget.activeAt?'#AABAC4DD':gadget.kind==='camera'?'#6EA8FF':'#FFC53D';ctx.fill();}
      const objective=snapshot.objective,device=objective?.devicePosition;
      if(device&&(objective.activeUntil||p.side==='공격'||vision.some(friend=>observer.canObserve(friend,device,map,snapshot.gadgets,time)))){ctx.fillStyle='#16272F';ctx.fillRect(device.x-12,device.y-9,24,18);ctx.strokeStyle='#FFC53D';ctx.strokeRect(device.x-12,device.y-9,24,18);ctx.fillStyle='#2FD4C4';ctx.fillRect(device.x-6,device.y-4,9,6);}
      hitTargets=[];
      for(const unit of visible){const visual=operatorVisual(unit.callSign);if(!visual)continue;const image=asset(visual.sprite);if(!imageReady(image))continue;ctx.save();ctx.translate(unit.position.x,unit.position.y);ctx.rotate(unit.facing);ctx.globalAlpha=unit.alive?1:.4;
        const legs=asset('movement-legs-atlas.webp');const moving=Math.hypot(unit.velocity.x,unit.velocity.y)>.05;
        const step=moving?Math.floor(time*(unit.locomotion==='sprint'?8:5))%2:0;
        const pose=!unit.alive||unit.locomotion==='crawl'?6:unit.locomotion==='crouch'||unit.locomotion==='vault'?4:unit.locomotion==='sprint'?2:0;
        const n=pose+step;if(imageReady(legs)){ctx.drawImage(legs,n%4*384,Math.floor(n/4)*512,384,512,-39,-24,35,47);}
        if(visual.region)ctx.drawImage(image,visual.region[0],visual.region[1],visual.width,visual.height,-visual.pivot[0]*OPERATOR_SCALE,-visual.pivot[1]*OPERATOR_SCALE,visual.width*OPERATOR_SCALE,visual.height*OPERATOR_SCALE);
        else ctx.drawImage(image,-visual.pivot[0]*OPERATOR_SCALE,-visual.pivot[1]*OPERATOR_SCALE,visual.width*OPERATOR_SCALE,visual.height*OPERATOR_SCALE);
        if(unit.shieldRaised){ctx.fillStyle='#617582';ctx.fillRect(16,-18,7,36);ctx.strokeStyle='#BED0D9';ctx.strokeRect(16,-18,7,36);}
        ctx.fillStyle=COLORS[unit.side];ctx.fillRect(-5,-14,6,3);ctx.restore();
        if(unit.side===p.side){hitTargets.push({id:unit.id,x:ox+(unit.position.x-camera.x)*scale,y:oy+(unit.position.y-camera.y)*scale});if(unit.id===p.selectedId){ctx.strokeStyle='#FFC53D';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(unit.position.x,unit.position.y,18,0,Math.PI*2);ctx.stroke();}}
        if(p.mode==='full'||unit.id===focusId){ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#EDF2F0';ctx.fillText(unit.callSign,unit.position.x,unit.position.y+29);}
      }
      for(const event of events){if(!event.position||!vision.some(friend=>observer.canObserve(friend,event.position!,map,snapshot.gadgets,time)))continue;const age=time-event.time;
        if(event.type==='shot'&&event.targetPosition&&age>=0&&age<=Math.max(.1,event.travelSeconds??.1)){
          const progress=Math.min(1,age/Math.max(.01,event.travelSeconds??.1)),start=Math.max(0,progress-.16),dx=event.targetPosition.x-event.position.x,dy=event.targetPosition.y-event.position.y;ctx.strokeStyle='#FFE1A0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(event.position.x+dx*start,event.position.y+dy*start);ctx.lineTo(event.position.x+dx*progress,event.position.y+dy*progress);ctx.stroke();if(age<.045){ctx.fillStyle='#FFF1C8';ctx.beginPath();ctx.arc(event.position.x,event.position.y,3,0,Math.PI*2);ctx.fill();}
        }
        if(event.type==='impact'&&age>=0&&age<.2){ctx.strokeStyle=event.hit?'#E5484D':'#C4C1A1';ctx.lineWidth=1;ctx.beginPath();ctx.arc(event.position.x,event.position.y,3+age*12,0,Math.PI*2);ctx.stroke();}
      }
    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);canvas.removeEventListener('pointerup',select);images.clear();scene=null;};
  },[props.map]);
  return <canvas ref={canvasRef} className="match-canvas" aria-label="우리 선수의 개인 시야로 보는 경기 중계" role="img"/>;
}
