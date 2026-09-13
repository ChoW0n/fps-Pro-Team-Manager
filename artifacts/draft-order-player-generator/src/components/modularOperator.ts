import type { RealtimeUnitState, RealtimeGadget } from '../domain/realtime/TacticalRealtimeSimulation';
import { paintWeaponPart, weaponPart } from './weaponParts';

export type PartLoader = (file:string) => HTMLImageElement;
type Point = {x:number;y:number};

export const OPERATOR_LAYER_ORDER = [
  'shadow', 'lower-body', 'arms', 'torso', 'head-and-kit', 'weapon', 'hands', 'team-mark',
] as const;

export type WeaponPoseKind = 'carbine'|'smg'|'suppressed'|'bullpup'|'p90'|'marksman'|'bolt'|'pistol';
export interface WeaponMountPose {
  kind:WeaponPoseKind;
  stock:Point;
  triggerHand:Point;
  supportHand:Point;
  magazine:Point;
  muzzle:Point;
  triggerShoulder:Point;
  supportShoulder:Point;
  cheek:Point;
  torsoYaw:number;
  shoulderPocket:Point;
}
export interface OperatorAssemblyPose {
  lowerFacing:number;
  upperFacing:number;
  moving:boolean;
  crouched:boolean;
  prone:boolean;
  weapon?:WeaponMountPose;
}

export interface OperatorMotion { reloadStartedAt?:number; thrown?:RealtimeGadget; }

// 외형 식별값뿐입니다. 전투 수치·충돌 크기·이동 속도에는 사용하지 않습니다.
const KITS:Record<string,{color:string;pouches:number;pack:number;tool:'shells'|'radio'|'optic'|'probe'|'case'|'charge'|'plate'|'roll'|'coil'|'lamp'|'battery'|'interceptor'}>={
  MAGPIE:{color:'#706B50',pouches:3,pack:9,tool:'shells'},
  COLLIER:{color:'#39484B',pouches:4,pack:8,tool:'radio'},
  '해동':{color:'#526052',pouches:3,pack:10,tool:'coil'},
  ARBEL:{color:'#817858',pouches:2,pack:8,tool:'roll'},
  AUBERT:{color:'#455360',pouches:2,pack:13,tool:'probe'},
  MEDVED:{color:'#66644C',pouches:3,pack:14,tool:'charge'},
  REUSS:{color:'#46534C',pouches:2,pack:15,tool:'plate'},
  BRANDT:{color:'#56605A',pouches:2,pack:9,tool:'roll'},
  MARCHAND:{color:'#3E4B57',pouches:4,pack:11,tool:'coil'},
  HALLORAN:{color:'#7B795C',pouches:3,pack:12,tool:'roll'},
  '성곽':{color:'#586352',pouches:3,pack:17,tool:'battery'},
  SAVELLI:{color:'#434E48',pouches:2,pack:10,tool:'interceptor'},
};

export function weaponPoseKind(name:string):WeaponPoseKind {
  if(/글록 17|글록 19|P226|K5 권총|HK USP|베레타 92FS|SR-1|MR73/.test(name))return 'pistol';
  if(/C14/.test(name))return 'bolt';
  if(/PSG|HK417/.test(name))return 'marksman';
  if(/P90/.test(name))return 'p90';
  if(/X95|타보르/.test(name))return 'bullpup';
  if(/MP5SD|Val/.test(name))return 'suppressed';
  if(/MPX|K1A/.test(name))return 'smg';
  return 'carbine';
}

const add=(a:Point,b:readonly number[]):Point=>({x:a.x+b[0],y:a.y+b[1]});
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** 총기 원화를 변형하지 않고 그 원화의 접점으로 양손 자세를 결정합니다. */
export function weaponMountPose(name:string):WeaponMountPose {
  const part=weaponPart(name),kind=weaponPoseKind(name);
  // 로컬 +X는 조준, +Y는 오른쪽. 실측 각도가 아닌 탑뷰 표현용 자세입니다.
  const torsoYaw=kind==='bolt'?-.30:kind==='marksman'?-.12:0;
  const rotate=(p:Point):Point=>({x:p.x*Math.cos(torsoYaw)-p.y*Math.sin(torsoYaw),y:p.x*Math.sin(torsoYaw)+p.y*Math.cos(torsoYaw)});
  const shoulderPocket=rotate({x:-8,y:kind==='bolt'?1.2:kind==='marksman'?2.3:3.4});
  // 권총은 견착하지 않고 몸 중심 앞에 양손을 모읍니다.
  const stock=kind==='pistol'?{x:8,y:0}:shoulderPocket;
  const muzzle={x:stock.x+part.length,y:stock.y};
  const trigger=add(muzzle,part.gripPoint),rawSupport=add(muzzle,part.supportPoint),magazine=add(muzzle,part.magazinePoint);
  const support=kind==='bolt'?mix(magazine,rawSupport,.22):kind==='marksman'?mix(magazine,rawSupport,.55):kind==='pistol'?{x:trigger.x+1.4,y:trigger.y-1.2}:rawSupport;
  return {kind,stock,triggerHand:trigger,supportHand:support,magazine,muzzle,
    torsoYaw,shoulderPocket,
    triggerShoulder:rotate({x:-1,y:6}),supportShoulder:rotate({x:1,y:-5.5}),cheek:{x:stock.x+5,y:stock.y-3.5}};
}

function normalize(angle:number):number { return Math.atan2(Math.sin(angle),Math.cos(angle)); }
function recoilOffset(time:number,shotAt:number|undefined,reducedMotion:boolean):number {
  const age=shotAt===undefined?1:time-shotAt;
  return !reducedMotion&&age>0&&age<.14?Math.sin(age/.14*Math.PI)*1.2:0;
}

/** 하체는 실제 이동 방향, 상체와 무기는 실제 조준 방향을 따릅니다. */
export function operatorAssemblyPose(unit:RealtimeUnitState):OperatorAssemblyPose {
  const speed=Math.hypot(unit.velocity.x,unit.velocity.y),moving=Boolean(unit.alive)&&speed>1;
  const installing=unit.action==='plant'||unit.action==='disable'||unit.action==='utility'&&/설치/.test(unit.goal??'');
  const prone=unit.locomotion==='crawl'||Boolean(unit.downed)||!unit.alive;
  return {lowerFacing:moving?Math.atan2(unit.velocity.y,unit.velocity.x):unit.facing,upperFacing:unit.facing,moving,
    crouched:unit.locomotion==='crouch'||installing,prone,weapon:prone?undefined:weaponMountPose(unit.weaponName??'')};
}

interface ArmPose { shoulder:Point; elbow:Point; hand:Point; }
/** 길이를 바꾸지 않는 2관절 팔. 손 좌표는 총기의 접점과 정확히 같습니다. */
export function solveArm(shoulder:Point,hand:Point,upperLength:number,forearmLength:number,bend:number):ArmPose {
  const dx=hand.x-shoulder.x,dy=hand.y-shoulder.y,distance=Math.max(.001,Math.hypot(dx,dy));
  const min=Math.abs(upperLength-forearmLength)+.001,max=upperLength+forearmLength-.001;
  const reachable=Math.max(min,Math.min(max,distance)),along=(upperLength*upperLength-forearmLength*forearmLength+reachable*reachable)/(2*reachable);
  const height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along)),ux=dx/distance,uy=dy/distance;
  return {shoulder,elbow:{x:shoulder.x+ux*along-uy*height*bend,y:shoulder.y+uy*along+ux*height*bend},hand};
}

/** 실제 투척 직후부터 회복까지의 관절 회전. 팔 길이는 고정입니다. */
export function throwArmPose(progress:number):{elbow:Point;hand:Point}{
  const p=Math.max(0,Math.min(1,progress)),a=-.4+p*1.2,b=-.65-p*.7;
  const elbow={x:2+Math.cos(a)*9,y:10+Math.sin(a)*9};
  return {elbow,hand:{x:elbow.x+Math.cos(b)*8,y:elbow.y+Math.sin(b)*8}};
}

function strokeArm(ctx:CanvasRenderingContext2D,pose:ArmPose,color:string):void {
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#10191C';ctx.lineWidth=6;
  ctx.beginPath();ctx.moveTo(pose.shoulder.x,pose.shoulder.y);ctx.lineTo(pose.elbow.x,pose.elbow.y);ctx.lineTo(pose.hand.x,pose.hand.y);ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=3.6;ctx.stroke();
}
function hand(ctx:CanvasRenderingContext2D,point:Point,angle:number):void {
  ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle);ctx.fillStyle='#657064';ctx.strokeStyle='#10191C';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(0,0,3,2,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
}
function polygon(ctx:CanvasRenderingContext2D,points:number[][],fill:string):void {
  ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();
}

function paintLowerBody(ctx:CanvasRenderingContext2D,pose:OperatorAssemblyPose,time:number,reducedMotion:boolean,color:string):void {
  const relative=normalize(pose.lowerFacing-pose.upperFacing),step=!reducedMotion&&pose.moving&&!pose.prone?Math.sin(time*(pose.crouched?8:12))*3:0;
  ctx.save();ctx.rotate(relative);ctx.strokeStyle='#10191C';ctx.lineWidth=2;ctx.lineJoin='round';
  for(const side of [-1,1]){const rear=pose.prone?-29:pose.crouched?-13:-18+side*step;
    polygon(ctx,[[rear-5,side*2.5],[rear+7,side*2.5],[rear+8,side*5.5],[rear-4,side*7]],side<0?'#29373A':color);}
  ctx.restore();
}

function paintTorso(ctx:CanvasRenderingContext2D,color:string):void {
  ctx.strokeStyle='#10191C';ctx.lineWidth=2;ctx.lineJoin='round';
  polygon(ctx,[[-14,-5],[-6,-7.5],[4,-7],[7,-3.5],[6,6],[0,7.5],[-13,5.5],[-16,2]],color);
  ctx.fillStyle='#29373A';ctx.fillRect(-16,-5,5,10);ctx.strokeRect(-16,-5,5,10);
}

function paintHeadAndKit(ctx:CanvasRenderingContext2D,color:string,pack:number,tool:string):void {
  ctx.strokeStyle='#10191C';ctx.lineWidth=2;ctx.lineJoin='round';
  ctx.fillStyle='#29373A';ctx.fillRect(-18,-pack*.32,5,pack*.64);ctx.strokeRect(-18,-pack*.32,5,pack*.64);
  ctx.save();ctx.translate(-1,-3);ctx.scale(.72,.72);
  polygon(ctx,[[-13,-7],[-8,-12],[0,-11],[7,-5],[6,3],[-1,7],[-11,4],[-15,-1]],'#334246');
  polygon(ctx,[[-11,-7],[-7,-10],[0,-9],[4,-5],[3,1],[-2,4],[-10,2]],color);
  ctx.fillStyle='#859080';ctx.fillRect(-7,-11,7,3);ctx.restore();
  if(tool==='battery'||tool==='interceptor'||tool==='charge'||tool==='plate'){
    ctx.fillStyle=color;ctx.fillRect(-14,5.5,9,3.5);ctx.strokeRect(-14,5.5,9,3.5);
  } else if(tool==='coil'||tool==='roll'){
    ctx.fillStyle='#859080';ctx.beginPath();ctx.arc(-10,6.5,2.2,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
}

/**
 * 조립식 경기 캐릭터. 레이어 순서는 고정하고 하체·상체·무기·손을 독립 계산합니다.
 * 외형은 RealtimeUnitState를 읽기만 하며 성능·충돌·탄약을 수정하지 않습니다.
 */
export function paintModularOperator(ctx:CanvasRenderingContext2D,unit:RealtimeUnitState,time:number,shotAt:number|undefined,asset:PartLoader,reducedMotion=false,motion:OperatorMotion={}):boolean {
  const pose=operatorAssemblyPose(unit),kit=KITS[unit.callSign]??KITS.MAGPIE,down=pose.prone;
  const thrown=motion.thrown,throwAge=thrown?.thrownAt===undefined?-1:time-thrown.thrownAt;
  const throwing=!down&&unit.action!=='reload'&&throwAge>=0&&throwAge<.45;
  const installing=!down&&(unit.action==='plant'||unit.action==='disable'||unit.action==='utility'&&/설치/.test(unit.goal??''));
  const kick=recoilOffset(time,shotAt,reducedMotion);

  ctx.save();ctx.globalAlpha=unit.alive?1:.4;
  ctx.fillStyle='#04090C55';ctx.beginPath();ctx.ellipse(unit.position.x,unit.position.y+2,12,8,0,0,Math.PI*2);ctx.fill();
  ctx.translate(unit.position.x,unit.position.y);ctx.rotate(pose.upperFacing);
  paintLowerBody(ctx,pose,time,reducedMotion,kit.color);
  if(down){ctx.save();ctx.rotate(-.18);ctx.scale(1.15,.72);paintTorso(ctx,kit.color);paintHeadAndKit(ctx,kit.color,kit.pack,kit.tool);ctx.restore();ctx.restore();return true;}
  const mount=pose.weapon!;
  const throwProgress=reducedMotion?.6:Math.min(1,throwAge/.45);
  const gunStowed=installing||throwing,lower=installing?1:throwing?1-throwProgress:0;
  const offset={x:-kick-7*lower,y:9*lower};
  const displaced=(p:Point):Point=>({x:p.x+offset.x,y:p.y+offset.y});
  let triggerTarget=displaced(mount.triggerHand),supportTarget=displaced(mount.supportHand);
  const reloadAge=motion.reloadStartedAt===undefined?-1:time-motion.reloadStartedAt;
  const reloading=!down&&!reducedMotion&&unit.action==='reload'&&(unit.reloadRemaining??0)>0&&reloadAge>=0;
  if(reloading){const reach=Math.sin(Math.PI*Math.min(1,reloadAge/(reloadAge+unit.reloadRemaining!)));supportTarget=displaced(mix(mount.supportHand,mount.magazine,reach));}
  if(installing){triggerTarget={x:8,y:5};supportTarget={x:9,y:-5};}
  const triggerArm=solveArm(mount.triggerShoulder,triggerTarget,8,9,-1);
  let supportArm=solveArm(mount.supportShoulder,supportTarget,12,12,1);
  if(throwing){const thrownPose=throwArmPose(throwProgress);supportArm={shoulder:mount.supportShoulder,elbow:thrownPose.elbow,hand:thrownPose.hand};}
  strokeArm(ctx,supportArm,kit.color);strokeArm(ctx,triggerArm,kit.color);
  // 탑뷰에서 아래로 내려간 위팔은 흉곽/어깨 아래에 가립니다.
  // 손 접촉이 맞아도 팔 뿌리를 헬멧 위에 그리면 고리 모양의 기형이 됩니다.
  ctx.save();ctx.rotate(mount.torsoYaw);paintTorso(ctx,kit.color);paintHeadAndKit(ctx,kit.color,kit.pack,kit.tool);ctx.restore();

  ctx.save();ctx.translate(mount.muzzle.x+offset.x,mount.muzzle.y+offset.y);
  const weaponDrawn=paintWeaponPart(ctx,unit.weaponName??'',asset);ctx.restore();

  if(!gunStowed){
    const axis=Math.atan2(mount.muzzle.y-mount.stock.y,mount.muzzle.x-mount.stock.x);
    hand(ctx,triggerTarget,axis+Math.PI/2);hand(ctx,supportTarget,axis+Math.PI/2);
  } else {hand(ctx,triggerTarget,0);hand(ctx,supportArm.hand,0);}
  if(unit.shieldRaised){ctx.fillStyle='#29373A';ctx.strokeStyle='#10191C';ctx.lineWidth=1.5;ctx.fillRect(10,-18,8,36);ctx.strokeRect(10,-18,8,36);ctx.fillStyle='#859080';ctx.fillRect(11,-9,6,9);}
  ctx.fillStyle=unit.side==='공격'?'#2FD4C4':'#F0873C';ctx.fillRect(-16,-4,2,4);
  ctx.restore();return weaponDrawn;
}

/** 표시 전용 총구. 시뮬레이션 발사 원점·충돌에는 역으로 전달하지 않습니다. */
export function modularMuzzlePosition(unit:RealtimeUnitState,time=0,shotAt?:number,reducedMotion=false):Point {
  const offset=weaponMountPose(unit.weaponName??'').muzzle,c=Math.cos(unit.facing),s=Math.sin(unit.facing);
  const x=offset.x-recoilOffset(time,shotAt,reducedMotion);
  return {x:unit.position.x+x*c-offset.y*s,y:unit.position.y+x*s+offset.y*c};
}
