import { useEffect, useRef, type ReactElement } from 'react';
import type { OperatorSide } from '../domain/Operator';
import { paintMinimalOperator } from './minimalOperator';
import { TacticalRealtimeSimulation, type RealtimeEvent, type RealtimeTick, type RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { battlefieldMap } from '../domain/realtime/fortifications';
import { electronic, gadgetPosition, GADGET_LABELS } from '../domain/realtime/gadgetRules';
import { angleDifference } from '../domain/realtime/perception';
import { cameraViewport, combatCamera, rememberContacts, visionPolygon } from '../domain/realtime/spectatorView';
import { layer, type TacticalPoint, type TacticalMapDefinition } from '../domain/tacticalMaps';
import { createSmokeTexture, paintSmoke } from './smokeEffect';

/** 고밀도 폰은 원래 DPR을 사용하되 캔버스 한 장을 약 16MB 이하로 제한합니다. */
export function canvasSize(width:number,height:number,ratio:number):{width:number;height:number} {
  const dpr=Math.min(Math.max(1,Number.isFinite(ratio)?ratio:1),3,Math.sqrt(4_000_000/Math.max(1,width*height)));
  return {width:Math.max(1,Math.floor(width*dpr)),height:Math.max(1,Math.floor(height*dpr))};
}
const ROOT = `${import.meta.env.BASE_URL}operators/`;
const DEVICE_ATLAS = `${import.meta.env.BASE_URL}effects/tactical-device-states-v4.png`;
const EVENT_ATLAS = `${import.meta.env.BASE_URL}effects/tactical-event-effects-v3.png`;
type Props = { tick: RealtimeTick | null; events: RealtimeEvent[]; map: TacticalMapDefinition; side: OperatorSide; selectedId: string | null; mode: 'broadcast' | 'follow' | 'full'; floor?: number; speed: number; paused: boolean; onSelect: (id: string) => void; playerNames?: ReadonlyMap<string,string>; onFocus?: (id: string | null) => void };

/** 파티클 모양은 사건과 참가자 ID로 고정해 프레임마다 난수 모양이 떨리지 않게 합니다. */
function seeded(key:string,index=0):number { let value=2166136261;for(const letter of `${key}:${index}`)value=Math.imul(value^letter.charCodeAt(0),16777619);return (value>>>0)/4294967295; }

/** 사건별 표시 시간을 먼저 판정해 긴 설치·EMP 효과가 공통 제한에 잘리지 않게 합니다. */
export function eventEffectDuration(event:RealtimeEvent):number {
  if(event.type==='shot')return Math.max(.1,event.travelSeconds??.1);
  if(event.type==='impact')return event.hitRegion==='head'?.12:.28;
  if(['death','downed','revive','objective'].includes(event.type))return 1.2;
  if(event.type!=='utility')return 0;
  return ({'grenade-exploded':.65,'wall-breached':.65,'probe-deployed':1.2,'camera-deployed':1.2,'power-deployed':1.2,'interceptor-deployed':1.2,'emp-pulse':.9,'breach-started':3} as Record<string,number>)[event.goal??'']??0;
}

/** 기록된 두 스냅샷 사이만 보간하며 사망·새 출현과 미래 위치를 외삽하지 않습니다. */
export function interpolateUnit(previous: RealtimeUnitState, next: RealtimeUnitState | undefined, amount: number): RealtimeUnitState {
  if (next && amount >= 1) return next;
  if (!next || previous.alive !== next.alive || (previous.floor??0)!==(next.floor??0)) return previous;
  return { ...previous, position: { ...previous.position, x: previous.position.x + (next.position.x-previous.position.x)*amount, y: previous.position.y+(next.position.y-previous.position.y)*amount },
    facing: previous.facing + angleDifference(next.facing, previous.facing)*amount };
}

/** 정적인 실내 구조는 한 번 그려 캐시하며 파괴된 벽도 같은 지형 데이터를 사용합니다. */
export function paintBattleMap(ctx: CanvasRenderingContext2D, map: TacticalMapDefinition): void {
  map=layer(map,map.viewFloor??0);
  ctx.fillStyle='#273237'; ctx.fillRect(0,0,map.width,map.height);
  ctx.fillStyle='#536268'; ctx.fillRect(map.building.x,map.building.y,map.building.width,map.building.height);
  for(const room of map.rooms) {
    const r=room.rect; ctx.fillStyle=room.floorColor??(room.kind==='yard'?'#364246':room.kind==='corridor'?'#7C817A':'#65737A');ctx.fillRect(r.x,r.y,r.width,r.height);
    if(room.kind!=='yard'){ctx.strokeStyle='#D3DDD315';ctx.lineWidth=1;ctx.beginPath();for(let x=r.x;x<r.x+r.width;x+=80){ctx.moveTo(x,r.y);ctx.lineTo(x,r.y+r.height);}for(let y=r.y;y<r.y+r.height;y+=80){ctx.moveTo(r.x,y);ctx.lineTo(r.x+r.width,y);}ctx.stroke();}
    ctx.font=`${Math.min(24,Math.max(18,11/Math.max(.01,Math.abs(ctx.getTransform().a))))}px sans-serif`;ctx.fillStyle='#ECE9DD';ctx.fillText(room.callout??room.label,r.x+20,r.y+34);
  }
  for(const stair of map.stairs??[]){if(stair.lowerFloor!==map.viewFloor&&stair.upperFloor!==map.viewFloor)continue;const r=stair.width/2;ctx.fillStyle=stair.open?'#12262D':stair.reinforced?'#738B9C':'#927C55';ctx.fillRect(stair.center.x-r,stair.center.y-r,2*r,2*r);ctx.strokeStyle='#E6D7A9';ctx.lineWidth=3;ctx.strokeRect(stair.center.x-r,stair.center.y-r,2*r,2*r);if(stair.kind==='stair'){for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(stair.center.x-r,stair.center.y+i*10);ctx.lineTo(stair.center.x+r,stair.center.y+i*10);ctx.stroke();}}ctx.font='bold 14px sans-serif';ctx.fillStyle='#101C24';ctx.fillRect(stair.center.x-r,stair.center.y-12,2*r,24);ctx.fillStyle='#FFF0BC';ctx.fillText(stair.label+(stair.kind==='hatch'?' ↓':''),stair.center.x-r+3,stair.center.y+5);}
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
    const room=map.rooms.find(room=>r.x>=room.rect.x&&r.x<room.rect.x+room.rect.width&&r.y>=room.rect.y&&r.y<room.rect.y+room.rect.height);
    if(room&&/카페|휴게|테라스/.test(room.label)){ctx.fillStyle='#927F61';ctx.fillRect(r.x+2,r.y+2,r.width-4,r.height-4);for(const x of [r.x+15,r.x+r.width-18]){ctx.fillStyle='#D9D5BD';ctx.beginPath();ctx.arc(x,r.y+r.height/2,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#493C30';ctx.beginPath();ctx.arc(x,r.y+r.height/2,3,0,Math.PI*2);ctx.fill();}}
    if(room&&/전망|천문|관광/.test(room.label)){ctx.fillStyle='#9BADA7';ctx.fillRect(r.x+4,r.y+4,r.width-8,r.height-8);ctx.fillStyle='#2B4653';ctx.beginPath();ctx.arc(r.x+r.width/2,r.y+r.height/2,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#A5C9C7';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(r.x+r.width/2-13,r.y+r.height/2+5);ctx.lineTo(r.x+r.width/2+13,r.y+r.height/2-5);ctx.stroke();}
    if(room&&/기념품|전시|자료|창고/.test(room.label)){ctx.fillStyle='#887D64';ctx.fillRect(r.x+2,r.y+2,r.width-4,r.height-4);for(let x=r.x+7;x<r.x+r.width-8;x+=12){ctx.fillStyle=x%24?'#C2B598':'#607F78';ctx.fillRect(x,r.y+6,8,r.height-12);}}
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
    const atlas=(file:string):HTMLImageElement=>{let image=images.get(file);if(!image){image=new Image();image.src=file;images.set(file,image);}return image;};
    /** 장비 상태와 사건 효과를 분리해, EMP 정지·탄 소진·투척·폭발이 같은 아이콘으로 뭉개지지 않게 합니다. */
    const sprite=(file:string,columns:number,rows:number,cell:number,x:number,y:number,width:number,height:number,alpha=1):boolean=>{const image=atlas(file);if(!image.complete||!image.naturalWidth)return false;const sw=image.naturalWidth/columns,sh=image.naturalHeight/rows,sx=(cell%columns)*sw,sy=Math.floor(cell/columns)*sh;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(image,sx,sy,sw,sh,x-width/2,y-height/2,width,height);ctx.restore();return true;};
    const deviceSprite=(cell:number,x:number,y:number,width:number,height:number,alpha=1):boolean=>sprite(DEVICE_ATLAS,4,3,cell,x,y,width,height,alpha);
    const effectSprite=(cell:number,x:number,y:number,width:number,height:number,alpha=1):boolean=>sprite(EVENT_ATLAS,4,2,cell,x,y,width,height,alpha);
    const motionMedia=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,scene:HTMLCanvasElement|null=null,sceneKey='',visionKey='';
    let cachedVision:RealtimeUnitState[]=[];let cachedVisibleIds=new Set<string>(),camera={x:0,y:0,width:430,height:260};
    let focusId:string|null=null,holdUntil=0,lastStamp=0,cameraReady=false;
    const contacts=new Map<string,{position:TacticalPoint;seenAt:number}>();
    let contactView='',fanKey='';let fan:Array<{x:number;y:number}>=[];
    let hitTargets:Array<{id:string;x:number;y:number}>=[];
    const observer=new TacticalRealtimeSimulation(props.map);
    /** 실제 CSS 픽셀로 거리를 재어 화면 밀도와 무관하게 우리 선수만 선택합니다. */
    const select=(event:PointerEvent):void=>{const rect=canvas.getBoundingClientRect();const nearest=hitTargets.map(target=>({...target,distance:Math.hypot(event.clientX-rect.left-target.x*rect.width/canvas.width,event.clientY-rect.top-target.y*rect.height/canvas.height)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<45)latest.current.onSelect(nearest.id);};
    canvas.addEventListener('pointerup',select);
    /** 실제 틱 사이의 이동만 표시하고 발사·탄착은 그 사건의 기록 위치와 시각으로 그립니다. */
    const draw=(stamp:number):void=>{
      frame=requestAnimationFrame(draw);const state=timeline.current,p=latest.current;if(!state)return;
      const rect=canvas.getBoundingClientRect(),{width:w,height:h}=canvasSize(rect.width,rect.height,window.devicePixelRatio||1);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const amount=p.paused?1:Math.min(1,Math.max(0,(stamp-state.received)/(100/p.speed)));
      const time=state.previous.time+(state.next.time-state.previous.time)*amount;
      const nextUnits=new Map(state.next.snapshot.units.map(unit=>[unit.id,unit]));
      const allUnits=state.previous.snapshot.units.map(unit=>interpolateUnit(unit,nextUnits.get(unit.id),amount));
      const snapshot=amount>=1?state.next.snapshot:state.previous.snapshot,breaches=snapshot.breaches??[];
      const visibleFloor=p.floor??(allUnits.find(unit=>unit.id===(p.mode==='follow'?p.selectedId:focusId??p.selectedId))?.floor??0);
      const units=allUnits.filter(unit=>(unit.floor??0)===visibleFloor);
      const map=layer(battlefieldMap(p.map,breaches,snapshot.fortifications,snapshot.openedHatches),visibleFloor);
      // 카메라의 최대 기억은 8초입니다. 오래된 발소리까지 매 프레임 시야 검사하지 않습니다.
      const events:RealtimeEvent[]=[];
      for(let i=p.events.findLastIndex(event=>event.time<=time);i>=0&&time-p.events[i].time<8;i--){const event=p.events[i];if(event.seenBy?.includes(p.side)&&(!event.position||(event.position.floor??0)===visibleFloor))events.push(event);}
      events.reverse();
      const teamVisible=units.filter(unit=>unit.side===p.side||snapshot.visibleTo?.[p.side].includes(unit.id));
      const framing=combatCamera(teamVisible,events,p.side,time,p.selectedId,p.mode==='follow',time<holdUntil?focusId:undefined);
      if(framing.focusId!==focusId)p.onFocus?.(framing.focusId);
      if(framing.focusId!==focusId||time>=holdUntil){focusId=framing.focusId;holdUntil=time+3.5;}
      // 중계는 우리 팀의 실제 관측을 합칩니다. 카메라가 고개를 돌려도 동료의 접촉은 유지됩니다.
      const currentVision=snapshot.units.filter(unit=>unit.side===p.side&&unit.alive&&(unit.floor??0)===visibleFloor);
      const nextVisionKey=snapshot.time+':'+p.side+':'+visibleFloor;
      // 엔진이 이미 식별·차폐를 검사한 현재 틱의 목록을 사용합니다. 옛 기록만 기존 시야 검사로 보완합니다.
      if(nextVisionKey!==visionKey){visionKey=nextVisionKey;cachedVision=currentVision;cachedVisibleIds=new Set(snapshot.visibleTo?.[p.side]??snapshot.units.filter(unit=>unit.side===p.side||currentVision.some(friend=>(!snapshot.observedBy||snapshot.observedBy[friend.id]?.includes(unit.id))&&observer.canObserve(friend,unit.position,map,snapshot.gadgets,snapshot.time))).map(unit=>unit.id));}
      const vision=cachedVision,visible=units.filter(unit=>cachedVisibleIds.has(unit.id));
      // 목격 좌표의 사본만 저장하며 카메라 전환으로 팀의 마지막 목격 기록을 지우지 않습니다.
      const view=p.side+':'+visibleFloor;
      if(contactView!==view){contacts.clear();contactView=view;}
      rememberContacts(contacts,snapshot.units.filter(unit=>unit.side!==p.side&&cachedVisibleIds.has(unit.id)&&(unit.floor??0)===visibleFloor),snapshot.time,time);
      const actualFrame=combatCamera(visible,events,p.side,time,p.selectedId,p.mode==='follow',focusId);
      const noFriendAlive=!units.some(unit=>unit.side===p.side&&unit.alive&&(unit.floor??0)===visibleFloor);
      if(noFriendAlive&&snapshot.objective?.devicePosition){actualFrame.x=snapshot.objective.devicePosition.x;actualFrame.y=snapshot.objective.devicePosition.y;actualFrame.width=520;}
      const viewport=cameraViewport(map,actualFrame,p.mode==='full');
      // 기기 화면 비율을 반영해 넓은 화면의 교전과 세로 화면의 인물이 모두 잘리지 않게 합니다.
      if(p.mode!=='full'){
        // 세로 폰에서는 긴 빈 복도보다 선수의 군장·무기가 읽히는 확대 폭을 사용합니다.
        if(rect.width<600&&rect.height>rect.width){viewport.width=Math.min(viewport.width,600);viewport.x=Math.max(0,Math.min(map.width-viewport.width,actualFrame.x-viewport.width/2));}
        viewport.height=Math.min(map.height,viewport.width*h/w);viewport.y=Math.max(0,Math.min(map.height-viewport.height,actualFrame.y-viewport.height/2));
      }
      const elapsed=Math.min(.05,(stamp-lastStamp)/1000||.016);lastStamp=stamp;
      const reducedMotion=motionMedia.matches;
      const blend=reducedMotion||!cameraReady?1:1-Math.exp(-elapsed*9);
      for(const key of ['x','y','width','height'] as const){const delta=viewport[key]-camera[key];camera[key]=Math.abs(delta)<.01?viewport[key]:camera[key]+delta*blend;}
      cameraReady=true;
      // 전체 지도는 점수판·감독 지시·선수 카드의 화면 여백 안에 맞춥니다.
      const density=w/Math.max(1,rect.width),top=p.mode==='full'?100*density:0,bottom=p.mode==='full'?(rect.height<520?125:220)*density:0;
      const sideInset=p.mode==='full'?12*density:0;
      const scale=Math.min((w-sideInset*2)/camera.width,Math.max(1,h-top-bottom)/camera.height),ox=(w-camera.width*scale)/2,oy=top+(h-top-bottom-camera.height*scale)/2;
      const cssUnit=density/scale;
      const annotations:Array<{text:string;x:number;y:number;color:string}>=[];
      /** 글자는 지도 배율과 무관하게 CSS 11px로 마지막 계층에 표시합니다. */
      const label=(text:string,x:number,y:number,color='#EDF2F0'):void=>{annotations.push({text,x,y,color});};
      const visibleSmokes:NonNullable<typeof snapshot.gadgets>=[];
      // 관전 밖의 폭발은 화면을 흔들지 않으며 동작 줄이기·일시 정지는 충격을 끕니다.
      const blast=!reducedMotion&&!p.paused&&p.mode!=='full'?[...events].reverse().find(event=>event.position&&event.position.x>=camera.x&&event.position.x<=camera.x+camera.width&&event.position.y>=camera.y&&event.position.y<=camera.y+camera.height&&vision.some(friend=>observer.canObserve(friend,event.position!,map,snapshot.gadgets,time))&&time-event.time>=0&&time-event.time<.38&&(event.goal==='grenade-exploded'||event.goal==='wall-breached')):undefined;
      const blastAge=blast?time-blast.time:1,shake=blast?(1-blastAge/.38)*Math.min(7,scale*5):0,shakeX=(seeded(`${blast?.time}:x`,Math.floor(blastAge*80))-.5)*shake,shakeY=(seeded(`${blast?.time}:y`,Math.floor(blastAge*80))-.5)*shake;
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080E12';ctx.fillRect(0,0,w,h);ctx.setTransform(scale,0,0,scale,ox-camera.x*scale+shakeX,oy-camera.y*scale+shakeY);
      const mapX=Math.floor((camera.x*scale-ox)/128)*128,mapY=Math.floor((camera.y*scale-oy)/128)*128;
      const key=[w,h,mapX,mapY,scale].join(':')+':'+p.map.id+':'+visibleFloor+':'+(snapshot.openedHatches??[]).join(',')+':'+breaches.map(b=>b.wallId+':'+b.position.x+':'+b.position.y).join(',')+':'+(snapshot.fortifications??[]).map(item=>item.id).join(',');
      // 전체 지도를 저해상도로 확대하지 않고 현재 화면만 출력 픽셀에 직접 그립니다.
      // 카메라가 멈추면 재사용하며, 이동·회전·파괴 시 같은 캔버스를 갱신합니다.
      if(!scene||key!==sceneKey){scene??=document.createElement('canvas');if(scene.width!==w+128||scene.height!==h+128){scene.width=w+128;scene.height=h+128;}const c=scene.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,scene.width,scene.height);c.setTransform(scale,0,0,scale,-mapX,-mapY);paintBattleMap(c,map);sceneKey=key;}
      // 감독은 익숙한 경기장 구조를 보되 상대 선수·가젯은 실제 개인 시야로 확인된 경우에만 봅니다.
      ctx.save();ctx.setTransform(1,0,0,1,shakeX,shakeY);ctx.globalAlpha=.86;ctx.drawImage(scene,ox-camera.x*scale+mapX,oy-camera.y*scale+mapY);ctx.restore();
      // 전술 보기의 선택 아군만 실제 벽·연막으로 잘린 시야를 표시합니다. 적 정보는 추가로 공개하지 않습니다.
      const watched=p.mode==='full'?snapshot.units.find(unit=>unit.id===p.selectedId&&unit.side===p.side&&unit.alive&&(unit.floor??0)===visibleFloor):undefined;
      if(watched){const key=snapshot.time+':'+watched.id;if(key!==fanKey){fanKey=key;
        const smokes=(snapshot.gadgets??[]).filter(gadget=>gadget.kind==='smoke'&&snapshot.time>=gadget.activeAt&&snapshot.time<gadget.until);
        fan=visionPolygon(watched,map,smokes).split(' ').map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};});}
        ctx.fillStyle='#2FD4C418';ctx.beginPath();ctx.moveTo(watched.position.x,watched.position.y);for(const point of fan)ctx.lineTo(point.x,point.y);ctx.closePath();ctx.fill();
      }
      for(const portal of map.portals.filter(portal=>portal.traversal)){
        if(!vision.some(friend=>observer.canObserve(friend,portal.center,map,snapshot.gadgets,time)))continue;
        const opened=snapshot.openedPortals?.includes(portal.id);ctx.save();ctx.translate(portal.center.x,portal.center.y);if(portal.axis==='vertical')ctx.rotate(Math.PI/2);ctx.fillStyle=portal.traversal==='window'?(opened?'#A7CDCE33':'#86CEDB88'):'#B7A984';ctx.fillRect(-portal.width/2,-6,portal.width,12);ctx.strokeStyle='#D9E4D8';ctx.lineWidth=2;ctx.strokeRect(-portal.width/2,-8,portal.width,16);if(opened){ctx.beginPath();ctx.moveTo(-portal.width/2,-12);ctx.lineTo(-portal.width/2+8,3);ctx.lineTo(-portal.width/2+15,-8);ctx.stroke();}ctx.restore();
      }
      for(const gadget of snapshot.gadgets??[]){if(time>=gadget.until||(gadget.floor??gadget.position.floor??0)!==visibleFloor)continue;const point=gadgetPosition(gadget,time);
        // 연막 자체를 볼 때만 자기 차폐를 제외합니다. 적 선수 판정과 다른 연막·벽은 그대로 유지합니다.
        const occluders=gadget.kind==='smoke'?(snapshot.gadgets??[]).filter(other=>other.id!==gadget.id):snapshot.gadgets;
        if(gadget.side!==p.side&&!vision.some(friend=>observer.canObserve(friend,point,map,occluders,time)))continue;
        if(gadget.kind==='smoke'&&time>=gadget.activeAt){visibleSmokes.push(gadget);continue;}
        if(electronic(gadget)){const disabled=(gadget.disabledUntil??0)>time,cell=gadget.kind==='probe'?(disabled?1:0):gadget.kind==='camera'?(disabled?3:2):gadget.kind==='power'?(disabled?5:4):(gadget.charges??0)>0?6:7;
          const wall=gadget.wallId?map.walls.find(w=>w.id===gadget.wallId):undefined;
          const angle=wall?Math.atan2(wall.to.y-wall.from.y,wall.to.x-wall.from.x):gadget.facing??0;
          const size=gadget.kind==='probe'?22:gadget.kind==='camera'?26:gadget.kind==='power'?28:30;
          ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle);
          // Contact shadow stays within the footprint; wall-bound devices align to the wall tangent.
          ctx.fillStyle='#00000038';ctx.fillRect(-size*.32,-size*.2+1,size*.64,size*.4);
          if(!deviceSprite(cell,0,0,size,size,disabled?.6:1)){ctx.fillStyle=disabled?'#697174':'#465D65';ctx.strokeStyle='#A8BBB5';ctx.lineWidth=2;ctx.fillRect(-8,-7,16,14);ctx.strokeRect(-8,-7,16,14);ctx.font='bold 10px sans-serif';ctx.fillStyle='#D7E6DC';ctx.textAlign='center';ctx.fillText(({camera:'C',probe:'P',power:'P',interceptor:'I'} as Record<string,string>)[gadget.kind],0,4);}ctx.restore();
          if(gadget.side===p.side){label(GADGET_LABELS[gadget.kind]+((gadget.disabledUntil??0)>time?' · 정지':gadget.kind==='interceptor'?` · ${gadget.charges}발`:''),point.x,point.y+18*cssUnit);}continue;
        }
        const projectileCell=({smoke:8,emp:9,grenade:11} as Record<string,number>)[gadget.kind];
        if(projectileCell!==undefined&&gadget.thrownAt!==undefined&&!deviceSprite(projectileCell,point.x,point.y,14,14)){ctx.beginPath();ctx.arc(point.x,point.y,5,0,Math.PI*2);ctx.fillStyle='#FFC53D';ctx.fill();} else if(projectileCell===undefined) {ctx.beginPath();ctx.arc(point.x,point.y,gadget.kind==='camera'?7:5,0,Math.PI*2);ctx.fillStyle=gadget.kind==='camera'?'#6EA8FF':'#FFC53D';ctx.fill();}
      }
      const objective=snapshot.objective,device=objective?.devicePosition;
      if(device&&(device.floor??0)===visibleFloor&&(objective.activeUntil||p.side==='공격'||vision.some(friend=>observer.canObserve(friend,device,map,snapshot.gadgets,time)))){ctx.fillStyle='#16272F';ctx.fillRect(device.x-12,device.y-9,24,18);ctx.strokeStyle='#FFC53D';ctx.strokeRect(device.x-12,device.y-9,24,18);ctx.fillStyle='#2FD4C4';ctx.fillRect(device.x-6,device.y-4,9,6);}
      hitTargets=[];
      // 실체를 연장해서 그리지 않습니다. 끊긴 접촉은 고정된 목격 표식으로만 페이드아웃합니다.
      for(const [id,contact] of contacts){if(cachedVisibleIds.has(id))continue;const age=time-contact.seenAt;ctx.save();ctx.globalAlpha=Math.max(0,1-age/3);ctx.strokeStyle='#6EA8FF';ctx.setLineDash([3,4]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(contact.position.x,contact.position.y,17,0,Math.PI*2);ctx.stroke();ctx.restore();label('마지막 목격',contact.position.x,contact.position.y+29*cssUnit,'#B0C9E9');}
      // 앞·뒤·옆 몸체와 장비를 조립하고 사격 반동은 실제 발사 사건에만 연결합니다.
      for(const unit of visible){
        const shotAt=events.findLast(event=>event.actor===unit.id&&event.type==='shot'&&time-event.time<.14)?.time;
        if(!paintMinimalOperator(ctx,unit,time,shotAt,asset,reducedMotion,{reloadStartedAt:events.findLast(event=>event.actor===unit.id&&event.type==='reload'&&event.message.includes('장전 시작'))?.time,thrown:snapshot.gadgets?.find(gadget=>gadget.owner===unit.id&&gadget.thrownAt!==undefined&&time>=gadget.thrownAt&&time-gadget.thrownAt<.45)}))continue;
        // 다운은 사망과 다른 실제 상태입니다. 자세별 원화 전에는 명확한 구조 표식을 사용합니다.
        if(unit.downed){ctx.save();ctx.strokeStyle='#FFC53D';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(unit.position.x-5,unit.position.y-23);ctx.lineTo(unit.position.x+5,unit.position.y-23);ctx.moveTo(unit.position.x,unit.position.y-28);ctx.lineTo(unit.position.x,unit.position.y-18);ctx.stroke();if(unit.downed.progress>0){ctx.beginPath();ctx.arc(unit.position.x,unit.position.y,21,-Math.PI/2,-Math.PI/2+Math.PI*2*unit.downed.progress);ctx.stroke();}ctx.restore();}
        const rescued=unit.reviving&&visible.find(other=>other.id===unit.reviving!.targetId);
        if(rescued){ctx.save();ctx.strokeStyle='#9ECDB9';ctx.lineWidth=1.5*cssUnit;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(unit.position.x,unit.position.y);ctx.lineTo(rescued.position.x,rescued.position.y);ctx.stroke();ctx.restore();}
        // 팀 색상은 군장을 덮지 않는 바깥 고리로 구분하며 선택 고리는 같은 몸 중심에 둡니다.
        if(unit.alive){ctx.strokeStyle=unit.id===p.selectedId?'#FFC53D':unit.side===p.side?'#2FD4C4':'#F0873C';ctx.lineWidth=(unit.id===p.selectedId?2:1.2)*cssUnit;ctx.beginPath();ctx.arc(unit.position.x,unit.position.y,Math.max(20,7*cssUnit),0,Math.PI*2);ctx.stroke();}
        if(unit.side===p.side)hitTargets.push({id:unit.id,x:ox+(unit.position.x-camera.x)*scale,y:oy+(unit.position.y-camera.y)*scale});
        const focused=unit.side===p.side&&(unit.id===focusId||unit.id===p.selectedId);
        if(focused||p.mode==='full')label((unit.side===p.side?(p.playerNames?.get(unit.id)??unit.callSign):unit.callSign)+' · '+(visibleFloor+1)+'F',unit.position.x,unit.position.y+25*cssUnit);
        // 선택 선수의 상태는 우선순위 하나만 표시해 이름·경고·행동의 중첩을 줄입니다.
      }
      for(const event of events){const age=time-event.time,duration=eventEffectDuration(event),effectAge=reducedMotion?duration:age;if(age<0||age>=duration||!event.position||!vision.some(friend=>observer.canObserve(friend,event.position!,map,snapshot.gadgets,time)))continue;
        if(event.type==='shot'&&event.targetPosition&&age>=0&&age<=Math.max(.1,event.travelSeconds??.1)){
          const progress=Math.min(1,age/Math.max(.01,event.travelSeconds??.1)),start=Math.max(0,progress-.16),dx=event.targetPosition.x-event.position.x,dy=event.targetPosition.y-event.position.y;ctx.strokeStyle='#FFE1A0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(event.position.x+dx*start,event.position.y+dy*start);ctx.lineTo(event.position.x+dx*progress,event.position.y+dy*progress);ctx.stroke();if(age<.045){ctx.fillStyle='#FFF1C8';ctx.beginPath();ctx.arc(event.position.x,event.position.y,3,0,Math.PI*2);ctx.fill();}
        }
        if(event.type==='impact'){if(event.hitRegion==='head'){ctx.fillStyle='#FFF4DC';ctx.beginPath();ctx.arc(event.position.x,event.position.y,5,0,Math.PI*2);ctx.fill();}else if(!effectSprite(event.hit?5:4,event.position.x,event.position.y,42+effectAge*35,42+effectAge*35,1-age/duration)){const radius=3+effectAge*18;ctx.strokeStyle=event.hit?'#E5484D':'#E3D6A3';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(event.position.x,event.position.y,radius,0,Math.PI*2);ctx.stroke();}}
        if(event.type==='utility'&&(event.goal==='grenade-exploded'||event.goal==='wall-breached')){
          const power=1-age/.65,size=(event.goal==='grenade-exploded'?100:76)*(reducedMotion?1:1-power*.2);
          // 로딩 전·손상된 이미지에서도 폭발 사건 자체가 화면에서 사라지지 않게 합니다.
          if(!effectSprite(event.goal==='grenade-exploded'?6:7,event.position.x,event.position.y,size,size,power)){ctx.save();ctx.globalAlpha=power;ctx.strokeStyle='#D8B887';ctx.lineWidth=2;ctx.beginPath();ctx.arc(event.position.x,event.position.y,size/2,0,Math.PI*2);ctx.stroke();ctx.restore();}
        }
        if(event.type==='utility'&&['probe-deployed','camera-deployed','power-deployed','interceptor-deployed'].includes(event.goal??''))effectSprite(3,event.position.x,event.position.y,70+effectAge*50,70+effectAge*50,1-age/1.2);
        if(event.type==='utility'&&event.goal==='emp-pulse')effectSprite(2,event.position.x,event.position.y,90+effectAge*120,90+effectAge*120,1-age/.9);
        if(event.type==='utility'&&age>=0&&age<3&&event.goal==='breach-started')deviceSprite(10,event.position.x,event.position.y,48,48,Math.min(.85,1-age/3));
        // 확인된 사건의 기록 위치에만 결과를 남깁니다. 현재 숨은 적 위치는 따라가지 않습니다.
        if(['death','downed','revive','objective'].includes(event.type)){
          ctx.save();ctx.globalAlpha=1-age/duration;ctx.strokeStyle=event.type==='death'?'#E89989':event.type==='revive'?'#9ECDB9':'#E6C775';ctx.lineWidth=2*cssUnit;
          const radius=(reducedMotion?16:12+age*12)*cssUnit;ctx.beginPath();ctx.arc(event.position.x,event.position.y,radius,0,Math.PI*2);ctx.stroke();
          if(event.type==='death'){ctx.beginPath();ctx.moveTo(event.position.x-5*cssUnit,event.position.y-5*cssUnit);ctx.lineTo(event.position.x+5*cssUnit,event.position.y+5*cssUnit);ctx.moveTo(event.position.x+5*cssUnit,event.position.y-5*cssUnit);ctx.lineTo(event.position.x-5*cssUnit,event.position.y+5*cssUnit);ctx.stroke();}ctx.restore();
        }
      }
      // 연막은 실제로 보이는 구름만 인물·탄착 위에 합성하고, 상태 글자는 그 위에 둡니다.
      for(const smoke of visibleSmokes){const point=gadgetPosition(smoke,time);paintSmoke(ctx,smokeTexture,point.x,point.y,smoke.radius,time-smoke.activeAt,smoke.until-smoke.activeAt,reducedMotion);}
      ctx.textAlign='center';ctx.font=`bold ${11*cssUnit}px sans-serif`;
      for(const item of annotations){ctx.lineJoin='round';ctx.lineWidth=3*cssUnit;ctx.strokeStyle='#101820';ctx.strokeText(item.text,item.x,item.y);ctx.fillStyle=item.color;ctx.fillText(item.text,item.x,item.y);}
    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);canvas.removeEventListener('pointerup',select);images.clear();scene=null;};
  },[props.map]);
  return <canvas ref={canvasRef} className="match-canvas" aria-label="우리 선수의 개인 시야로 보는 경기 중계" role="img"/>;
}
