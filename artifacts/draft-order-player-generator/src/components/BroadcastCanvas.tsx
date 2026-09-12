import { useEffect, useRef, type ReactElement } from 'react';
import type { OperatorSide } from '../domain/Operator';
import { paintMinimalOperator } from './minimalOperator';
import { TacticalRealtimeSimulation, type RealtimeEvent, type RealtimeTick, type RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { battlefieldMap } from '../domain/realtime/fortifications';
import { angleDifference } from '../domain/realtime/perception';
import { cameraViewport, combatCamera, rememberContacts, visionPolygon } from '../domain/realtime/spectatorView';
import type { TacticalMapDefinition } from '../domain/tacticalMaps';
import { createSmokeTexture, paintSmoke } from './smokeEffect';

const ROOT = `${import.meta.env.BASE_URL}operators/`;
type Props = { tick: RealtimeTick | null; events: RealtimeEvent[]; map: TacticalMapDefinition; side: OperatorSide; selectedId: string | null; mode: 'broadcast' | 'follow' | 'full'; speed: number; paused: boolean; onSelect: (id: string) => void; onFocus?: (id: string | null) => void };

/** 파티클 모양은 사건과 참가자 ID로 고정해 프레임마다 난수 모양이 떨리지 않게 합니다. */
function seeded(key:string,index=0):number { let value=2166136261;for(const letter of `${key}:${index}`)value=Math.imul(value^letter.charCodeAt(0),16777619);return (value>>>0)/4294967295; }

/** 기록된 두 스냅샷 사이만 보간하며 사망·새 출현과 미래 위치를 외삽하지 않습니다. */
export function interpolateUnit(previous: RealtimeUnitState, next: RealtimeUnitState | undefined, amount: number): RealtimeUnitState {
  if (next && amount >= 1) return next;
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
    if(room.kind!=='yard'){ctx.strokeStyle='#D3DDD315';ctx.lineWidth=1;ctx.beginPath();for(let x=r.x;x<r.x+r.width;x+=80){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.height);}for(let y=r.y;y<r.y+r.height;y+=80){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.width,y);}ctx.stroke();}
    ctx.font='18px sans-serif';ctx.fillStyle='#CBD2CD99';ctx.fillText(room.label,r.x+20,r.y+34);
  }
  for(const site of map.sites){ctx.strokeStyle='#FFC53D';ctx.lineWidth=3;ctx.setLineDash([18,14]);ctx.strokeRect(site.bounds.x,site.bounds.y,site.bounds.width,site.bounds.height);ctx.setLineDash([]);ctx.fillStyle='#FFD66C';ctx.font='bold 30px sans-serif';ctx.fillText(site.id,site.bounds.x+20,site.bounds.y+42);}
  for(const wall of map.walls.filter(w=>w.kind!=='door-gap')){
    ctx.save();ctx.translate(5,7);ctx.beginPath();ctx.moveTo(wall.from.x,wall.from.y);ctx.lineTo(wall.to.x,wall.to.y);ctx.strokeStyle='#07101466';ctx.lineWidth=25;ctx.stroke();ctx.restore();ctx.beginPath();ctx.moveTo(wall.from.x,wall.from.y);ctx.lineTo(wall.to.x,wall.to.y);ctx.strokeStyle='#1D282E';ctx.lineWidth=22;ctx.stroke();ctx.strokeStyle=wall.breachable?'#B7AA91':'#ADB9B8';ctx.lineWidth=10;ctx.stroke();
    if(wall.breachable){ctx.setLineDash([20,10]);ctx.strokeStyle='#6D6555';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
    if(wall.reinforced){ctx.strokeStyle='#718693';ctx.lineWidth=14;ctx.stroke();ctx.setLineDash([4,9]);ctx.strokeStyle='#C5D1D6';ctx.lineWidth=8;ctx.stroke();ctx.setLineDash([]);}
  }
  for(const portal of map.portals){ctx.save();ctx.translate(portal.center.x,portal.center.y);if(portal.axis==='vertical')ctx.rotate(Math.PI/2);ctx.strokeStyle='#B46C5755';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-portal.width/2,-18);ctx.lineTo(portal.width/2,-18);ctx.moveTo(-portal.width/2,18);ctx.lineTo(portal.width/2,18);ctx.stroke();ctx.restore();}
  for(const cover of map.covers){const r=cover.rect;ctx.fillStyle='#16212699';ctx.fillRect(r.x+8,r.y+10,r.width,r.height);ctx.fillStyle='#374A52';ctx.fillRect(r.x,r.y,r.width,r.height);ctx.strokeStyle='#A5B3AF';ctx.lineWidth=2;ctx.strokeRect(r.x,r.y,r.width,r.height);
    ctx.strokeStyle='#182F39';ctx.beginPath();if(r.width>r.height){for(let x=r.x+12;x<r.x+r.width;x+=24){ctx.moveTo(x,r.y+4);ctx.lineTo(x,r.y+r.height-4);}}else{for(let y=r.y+12;y<r.y+r.height;y+=24){ctx.moveTo(r.x+4,y);ctx.lineTo(r.x+r.width-4,y);}}ctx.stroke();
    if(/desk|bench|console/.test(cover.id)){ctx.fillStyle='#122D3B';ctx.fillRect(r.x+12,r.y+8,Math.min(48,r.width-20),Math.min(23,r.height-14));ctx.fillStyle='#74B6BB';ctx.fillRect(r.x+17,r.y+13,22,2);ctx.fillRect(r.x+17,r.y+18,14,2);}
    if(/rack|cabinet/.test(cover.id)){for(let y=r.y+9;y<r.y+r.height-5;y+=24){ctx.fillStyle='#82CDB8';ctx.fillRect(r.x+8,y,4,3);}}
    if(cover.kind==='truck'){ctx.save();ctx.translate(r.x+r.width/2,r.y+r.height/2);if(r.height>r.width)ctx.rotate(Math.PI/2);const length=Math.max(r.width,r.height),width=Math.min(r.width,r.height);ctx.fillStyle='#A6A398';ctx.fillRect(-length/2+2,-width/2+2,length-4,width-4);ctx.fillStyle='#233D46';ctx.fillRect(length/2-37,-width/2+5,23,width-10);ctx.fillStyle='#12191D';for(const axle of [-length/2+24,length/2-27]){ctx.fillRect(axle,-width/2,17,6);ctx.fillRect(axle,width/2-6,17,6);}ctx.strokeStyle='#637277';ctx.strokeRect(-length/2+8,-width/2+7,length-60,width-14);ctx.restore();}
    if(cover.kind==='shield'){ctx.fillStyle='#A0ABB0';ctx.fillRect(r.x+3,r.y+3,r.width-6,r.height-6);ctx.strokeStyle='#2B3E48';ctx.lineWidth=3;ctx.strokeRect(r.x+5,r.y+5,r.width-10,r.height-10);}
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
    const smokeTexture=createSmokeTexture();
    /** 인물 원화는 한 번만 읽고 디코드된 이미지를 재사용합니다. */
    const asset=(file:string):HTMLImageElement=>{let image=images.get(file);if(!image){image=new Image();image.src=ROOT+file;images.set(file,image);}return image;};
    for(const view of ['front','back','side']){asset(`minimal-body-0-${view}.png`);asset(`minimal-head-0-${view}.png`);asset(`minimal-head-1-${view}.png`);}
    const touchMedia=window.matchMedia('(hover: none) and (pointer: coarse)'),motionMedia=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,scene:HTMLCanvasElement|null=null,sceneKey='',visionKey='';
    let cachedVision:RealtimeUnitState[]=[];let cachedVisibleIds=new Set<string>(),camera={x:0,y:0,width:430,height:260};
    let focusId:string|null=null,holdUntil=0,lastStamp=0,cameraReady=false;
    const contacts=new Map<string,{position:{x:number;y:number};seenAt:number}>();
    let contactView='',fanKey='';let fan:Array<{x:number;y:number}>=[];
    let hitTargets:Array<{id:string;x:number;y:number}>=[];
    const observer=new TacticalRealtimeSimulation(props.map);
    /** 실제 CSS 픽셀로 거리를 재어 화면 밀도와 무관하게 우리 선수만 선택합니다. */
    const select=(event:PointerEvent):void=>{const rect=canvas.getBoundingClientRect();const nearest=hitTargets.map(target=>({...target,distance:Math.hypot(event.clientX-rect.left-target.x*rect.width/canvas.width,event.clientY-rect.top-target.y*rect.height/canvas.height)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<45)latest.current.onSelect(nearest.id);};
    canvas.addEventListener('pointerup',select);
    /** 실제 틱 사이의 이동만 표시하고 발사·탄착은 그 사건의 기록 위치와 시각으로 그립니다. */
    const draw=(stamp:number):void=>{
      frame=requestAnimationFrame(draw);const state=timeline.current,p=latest.current;if(!state)return;
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(touchMedia.matches||rect.height<520?1:1.5,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const amount=p.paused?1:Math.min(1,Math.max(0,(stamp-state.received)/(100/p.speed)));
      const time=state.previous.time+(state.next.time-state.previous.time)*amount;
      const nextUnits=new Map(state.next.snapshot.units.map(unit=>[unit.id,unit]));
      const units=state.previous.snapshot.units.map(unit=>interpolateUnit(unit,nextUnits.get(unit.id),amount));
      const snapshot=amount>=1?state.next.snapshot:state.previous.snapshot,breaches=snapshot.breaches??[];
      const map=battlefieldMap(p.map,breaches,snapshot.fortifications);
      // 카메라의 최대 기억은 8초입니다. 오래된 발소리까지 매 프레임 시야 검사하지 않습니다.
      const events:RealtimeEvent[]=[];
      for(let i=p.events.findLastIndex(event=>event.time<=time);i>=0&&time-p.events[i].time<8;i--){const event=p.events[i];if(event.seenBy?.includes(p.side))events.push(event);}
      events.reverse();
      const teamVisible=units.filter(unit=>unit.side===p.side||snapshot.visibleTo?.[p.side].includes(unit.id));
      const framing=combatCamera(teamVisible,events,p.side,time,p.selectedId,p.mode==='follow',time<holdUntil?focusId:undefined);
      if(framing.focusId!==focusId)p.onFocus?.(framing.focusId);
      if(framing.focusId!==focusId||time>=holdUntil){focusId=framing.focusId;holdUntil=time+3.5;}
      // 중계는 우리 팀의 실제 관측을 합칩니다. 카메라가 고개를 돌려도 동료의 접촉은 유지됩니다.
      const currentVision=snapshot.units.filter(unit=>unit.side===p.side&&unit.alive);
      const nextVisionKey=snapshot.time+':'+p.side;
      // 엔진이 이미 식별·차폐를 검사한 현재 틱의 목록을 사용합니다. 옛 기록만 기존 시야 검사로 보완합니다.
      if(nextVisionKey!==visionKey){visionKey=nextVisionKey;cachedVision=currentVision;cachedVisibleIds=new Set(snapshot.visibleTo?.[p.side]??snapshot.units.filter(unit=>unit.side===p.side||currentVision.some(friend=>(!snapshot.observedBy||snapshot.observedBy[friend.id]?.includes(unit.id))&&observer.canObserve(friend,unit.position,map,snapshot.gadgets,snapshot.time))).map(unit=>unit.id));}
      const vision=cachedVision,visible=units.filter(unit=>cachedVisibleIds.has(unit.id));
      // 목격 좌표의 사본만 저장하며 카메라 전환으로 팀의 마지막 목격 기록을 지우지 않습니다.
      const view=p.side;
      if(contactView!==view){contacts.clear();contactView=view;}
      rememberContacts(contacts,snapshot.units.filter(unit=>unit.side!==p.side&&cachedVisibleIds.has(unit.id)),snapshot.time,time);
      const actualFrame=combatCamera(visible,events,p.side,time,p.selectedId,p.mode==='follow',focusId);
      const noFriendAlive=!units.some(unit=>unit.side===p.side&&unit.alive);
      if(noFriendAlive&&snapshot.objective?.devicePosition){actualFrame.x=snapshot.objective.devicePosition.x;actualFrame.y=snapshot.objective.devicePosition.y;actualFrame.width=520;}
      const viewport=cameraViewport(map,actualFrame,p.mode==='full');
      // 기기 화면 비율을 반영해 넓은 화면의 교전과 세로 화면의 인물이 모두 잘리지 않게 합니다.
      if(p.mode!=='full'){viewport.height=Math.min(map.height,viewport.width*h/w);viewport.y=Math.max(0,Math.min(map.height-viewport.height,actualFrame.y-viewport.height/2));}
      const elapsed=Math.min(.05,(stamp-lastStamp)/1000||.016);lastStamp=stamp;
      const reducedMotion=motionMedia.matches;
      const blend=reducedMotion||!cameraReady?1:1-Math.exp(-elapsed*9);
      for(const key of ['x','y','width','height'] as const)camera[key]+=(viewport[key]-camera[key])*blend;
      cameraReady=true;
      const scale=Math.min(w/camera.width,h/camera.height),ox=(w-camera.width*scale)/2,oy=(h-camera.height*scale)/2;
      // 관전 밖의 폭발은 화면을 흔들지 않으며 동작 줄이기·일시 정지는 충격을 끕니다.
      const blast=!reducedMotion&&!p.paused&&p.mode!=='full'?[...events].reverse().find(event=>event.position&&event.position.x>=camera.x&&event.position.x<=camera.x+camera.width&&event.position.y>=camera.y&&event.position.y<=camera.y+camera.height&&vision.some(friend=>observer.canObserve(friend,event.position!,map,snapshot.gadgets,time))&&time-event.time>=0&&time-event.time<.38&&(event.goal==='grenade-exploded'||event.goal==='wall-breached')):undefined;
      const blastAge=blast?time-blast.time:1,shake=blast?(1-blastAge/.38)*Math.min(7,scale*5):0,shakeX=(seeded(`${blast?.time}:x`,Math.floor(blastAge*80))-.5)*shake,shakeY=(seeded(`${blast?.time}:y`,Math.floor(blastAge*80))-.5)*shake;
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080E12';ctx.fillRect(0,0,w,h);ctx.setTransform(scale,0,0,scale,ox-camera.x*scale+shakeX,oy-camera.y*scale+shakeY);
      const key=p.map.id+':'+breaches.map(b=>b.wallId+':'+b.position.x+':'+b.position.y).join(',')+':'+(snapshot.fortifications??[]).map(item=>item.id).join(',');
      if(!scene||key!==sceneKey){scene=document.createElement('canvas');scene.width=Math.ceil(map.width/2);scene.height=Math.ceil(map.height/2);const sceneContext=scene.getContext('2d')!;sceneContext.scale(.5,.5);paintBattleMap(sceneContext,map);sceneKey=key;}
      // 감독은 익숙한 경기장 구조를 보되 상대 선수·가젯은 실제 개인 시야로 확인된 경우에만 봅니다.
      ctx.globalAlpha=.86;ctx.drawImage(scene,camera.x/2,camera.y/2,camera.width/2,camera.height/2,camera.x,camera.y,camera.width,camera.height);ctx.globalAlpha=1;
      // 전술 보기의 선택 아군만 실제 벽·연막으로 잘린 시야를 표시합니다. 적 정보는 추가로 공개하지 않습니다.
      const watched=p.mode==='full'?snapshot.units.find(unit=>unit.id===p.selectedId&&unit.side===p.side&&unit.alive):undefined;
      if(watched){const key=snapshot.time+':'+watched.id;if(key!==fanKey){fanKey=key;
        const smokes=(snapshot.gadgets??[]).filter(gadget=>gadget.kind==='smoke'&&snapshot.time>=gadget.activeAt&&snapshot.time<gadget.until);
        fan=visionPolygon(watched,map,smokes).split(' ').map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};});}
        ctx.fillStyle='#2FD4C418';ctx.beginPath();ctx.moveTo(watched.position.x,watched.position.y);for(const point of fan)ctx.lineTo(point.x,point.y);ctx.closePath();ctx.fill();
      }
      for(const portal of map.portals.filter(portal=>portal.traversal)){
        if(!vision.some(friend=>observer.canObserve(friend,portal.center,map,snapshot.gadgets,time)))continue;
        const opened=snapshot.openedPortals?.includes(portal.id);ctx.save();ctx.translate(portal.center.x,portal.center.y);if(portal.axis==='vertical')ctx.rotate(Math.PI/2);ctx.fillStyle=portal.traversal==='window'?(opened?'#A7CDCE33':'#86CEDB88'):'#B7A984';ctx.fillRect(-portal.width/2,-6,portal.width,12);ctx.strokeStyle='#D9E4D8';ctx.lineWidth=2;ctx.strokeRect(-portal.width/2,-8,portal.width,16);if(opened){ctx.beginPath();ctx.moveTo(-portal.width/2,-12);ctx.lineTo(-portal.width/2+8,3);ctx.lineTo(-portal.width/2+15,-8);ctx.stroke();}ctx.restore();
      }
      for(const gadget of snapshot.gadgets??[]){if(time>=gadget.until)continue;const flight=gadget.from&&gadget.landedAt&&gadget.thrownAt!==undefined?Math.max(0,Math.min(1,(time-gadget.thrownAt)/(gadget.landedAt-gadget.thrownAt))):1;const point=gadget.from?{x:gadget.from.x+(gadget.position.x-gadget.from.x)*flight,y:gadget.from.y+(gadget.position.y-gadget.from.y)*flight}:gadget.position;
        // 연막 자체를 볼 때만 자기 차폐를 제외합니다. 적 선수 판정과 다른 연막·벽은 그대로 유지합니다.
        const occluders=gadget.kind==='smoke'?(snapshot.gadgets??[]).filter(other=>other.id!==gadget.id):snapshot.gadgets;
        if(gadget.side!==p.side&&!vision.some(friend=>observer.canObserve(friend,point,map,occluders,time)))continue;
        if(gadget.kind==='smoke'&&time>=gadget.activeAt){paintSmoke(ctx,smokeTexture,point.x,point.y,gadget.radius,time-gadget.activeAt,gadget.until-gadget.activeAt);continue;}
        ctx.beginPath();ctx.arc(point.x,point.y,gadget.kind==='camera'?7:5,0,Math.PI*2);ctx.fillStyle=gadget.kind==='camera'?'#6EA8FF':'#FFC53D';ctx.fill();}
      const objective=snapshot.objective,device=objective?.devicePosition;
      if(device&&(objective.activeUntil||p.side==='공격'||vision.some(friend=>observer.canObserve(friend,device,map,snapshot.gadgets,time)))){ctx.fillStyle='#16272F';ctx.fillRect(device.x-12,device.y-9,24,18);ctx.strokeStyle='#FFC53D';ctx.strokeRect(device.x-12,device.y-9,24,18);ctx.fillStyle='#2FD4C4';ctx.fillRect(device.x-6,device.y-4,9,6);}
      hitTargets=[];
      // 실체를 연장해서 그리지 않습니다. 끊긴 접촉은 고정된 목격 표식으로만 페이드아웃합니다.
      for(const [id,contact] of contacts){if(cachedVisibleIds.has(id))continue;ctx.save();ctx.globalAlpha=Math.max(0,1-(time-contact.seenAt));ctx.strokeStyle='#6EA8FF';ctx.setLineDash([3,4]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(contact.position.x,contact.position.y,17,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#B0C9E9';ctx.fillText('마지막 목격',contact.position.x,contact.position.y+29);ctx.restore();}
      // 앞·뒤·옆 몸체와 장비를 조립하고 사격 반동은 실제 발사 사건에만 연결합니다.
      for(const unit of visible){
        const shotAt=events.findLast(event=>event.actor===unit.id&&event.type==='shot'&&time-event.time<.14)?.time;
        if(!paintMinimalOperator(ctx,unit,time,shotAt,asset,reducedMotion||p.paused))continue;
        // 다운은 사망과 다른 실제 상태입니다. 자세별 원화 전에는 명확한 구조 표식을 사용합니다.
        if(unit.downed){ctx.save();ctx.strokeStyle='#FFC53D';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(unit.position.x-5,unit.position.y-23);ctx.lineTo(unit.position.x+5,unit.position.y-23);ctx.moveTo(unit.position.x,unit.position.y-28);ctx.lineTo(unit.position.x,unit.position.y-18);ctx.stroke();if(unit.downed.progress>0){ctx.beginPath();ctx.arc(unit.position.x,unit.position.y,21,-Math.PI/2,-Math.PI/2+Math.PI*2*unit.downed.progress);ctx.stroke();}ctx.restore();}
        if(unit.side===p.side){hitTargets.push({id:unit.id,x:ox+(unit.position.x-camera.x)*scale,y:oy+(unit.position.y-camera.y)*scale});if(unit.id===p.selectedId){ctx.strokeStyle='#FFC53D';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(unit.position.x,unit.position.y,18,0,Math.PI*2);ctx.stroke();}}
        if(unit.side===p.side&&!unit.downed&&(unit.suppression??0)>=.4){ctx.fillStyle='#FFC53D';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText('!',unit.position.x,unit.position.y-25);if(unit.id===focusId){ctx.font='10px sans-serif';ctx.fillText('탄착 압박 · 엄폐',unit.position.x,unit.position.y-40);}}
        if(p.mode==='full'||unit.id===focusId){ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#EDF2F0';ctx.fillText(unit.callSign,unit.position.x,unit.position.y+29);}
      }
      for(const event of events){const age=time-event.time;if(!['shot','impact','utility'].includes(event.type)||age>Math.max(.65,event.travelSeconds??0)||!event.position||!vision.some(friend=>observer.canObserve(friend,event.position!,map,snapshot.gadgets,time)))continue;
        if(event.type==='shot'&&event.targetPosition&&age>=0&&age<=Math.max(.1,event.travelSeconds??.1)){
          const progress=Math.min(1,age/Math.max(.01,event.travelSeconds??.1)),start=Math.max(0,progress-.16),dx=event.targetPosition.x-event.position.x,dy=event.targetPosition.y-event.position.y;ctx.strokeStyle='#FFE1A0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(event.position.x+dx*start,event.position.y+dy*start);ctx.lineTo(event.position.x+dx*progress,event.position.y+dy*progress);ctx.stroke();if(age<.045){ctx.fillStyle='#FFF1C8';ctx.beginPath();ctx.arc(event.position.x,event.position.y,3,0,Math.PI*2);ctx.fill();}
        }
        if(event.type==='impact'&&age>=0&&age<.28){const radius=3+age*18;ctx.strokeStyle=event.hit?'#E5484D':'#E3D6A3';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(event.position.x,event.position.y,radius,0,Math.PI*2);ctx.stroke();for(let i=0;i<5;i++){const angle=seeded(`${event.time}:${event.actor}`,i)*Math.PI*2,length=(1-age/.28)*(5+seeded(`${event.time}:impact`,i)*11);ctx.beginPath();ctx.moveTo(event.position.x,event.position.y);ctx.lineTo(event.position.x+Math.cos(angle)*length,event.position.y+Math.sin(angle)*length);ctx.stroke();}}
        if(event.type==='utility'&&age>=0&&age<.65&&(event.goal==='grenade-exploded'||event.goal==='wall-breached')){const power=1-age/.65;ctx.fillStyle=event.goal==='grenade-exploded'?`rgba(255,197,61,${power*.65})`:`rgba(190,174,143,${power*.48})`;ctx.beginPath();ctx.arc(event.position.x,event.position.y,(event.goal==='grenade-exploded'?42:30)*(1-power*.35),0,Math.PI*2);ctx.fill();for(let i=0;i<14;i++){const angle=seeded(`${event.goal}:${event.time}`,i)*Math.PI*2,distance=(1-power)*(35+seeded(`${event.time}:debris`,i)*90);ctx.fillRect(event.position.x+Math.cos(angle)*distance,event.position.y+Math.sin(angle)*distance,2+seeded(event.goal,i)*5,2+seeded(event.goal,i+30)*4);}}
      }
    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);canvas.removeEventListener('pointerup',select);images.clear();scene=null;};
  },[props.map]);
  return <canvas ref={canvasRef} className="match-canvas" aria-label="우리 선수의 개인 시야로 보는 경기 중계" role="img"/>;
}
