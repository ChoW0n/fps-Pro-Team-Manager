import { SurvivorParts } from './survivorParts';
import type { RealtimeUnitState, RealtimeGadget } from '../domain/realtime/TacticalRealtimeSimulation';
import { paintWeaponPart, weaponPart, weaponDisplayScale } from './weaponParts';
import { HANDHELD_SHIELD, paintHandheldShield } from './shieldParts';

export type PartLoader = (file:string) => HTMLImageElement;
type Point = {x:number;y:number};

export const OPERATOR_LAYER_ORDER = [
  'shadow', 'lower-body', 'torso', 'arms', 'head-and-kit', 'hands', 'weapon', 'shield',
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
  inactive:boolean;
  weapon?:WeaponMountPose;
}

export interface OperatorAnimationFrame {
  lowerFacing:number;
  crouchAmount:number;
  step:number;
  reloadReach:number;
  gaitPhase?:number;
}
export interface OperatorMotion { reloadStartedAt?:number; thrown?:RealtimeGadget; frame?:OperatorAnimationFrame; }

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
  const source=weaponPart(name),scale=weaponDisplayScale(name),kind=weaponPoseKind(name);
  const scaled=(p:readonly number[])=>p.map(v=>v*scale);
  const part={length:source.length*scale,gripPoint:scaled(source.gripPoint),supportPoint:scaled(source.supportPoint),magazinePoint:scaled(source.magazinePoint)};
  // 로컬 +X는 조준, +Y는 오른쪽. 실측 각도가 아닌 탑뷰 표현용 자세입니다.
  const torsoYaw=0;
  const rotate=(p:Point):Point=>({x:p.x*Math.cos(torsoYaw)-p.y*Math.sin(torsoYaw),y:p.x*Math.sin(torsoYaw)+p.y*Math.cos(torsoYaw)});
  const shoulderPocket=rotate({x:-12,y:7});
  // 권총은 견착하지 않고 몸 중심 앞에 양손을 모읍니다.
  const stock=kind==='pistol'?{x:6.4,y:7}:shoulderPocket;
  const muzzle={x:stock.x+part.length,y:stock.y};
  const trigger=add(muzzle,part.gripPoint),rawSupport=add(muzzle,part.supportPoint),magazine=add(muzzle,part.magazinePoint);
  // 권총 손목은 슬라이드 중심보다 손잡이 아래에 둡니다.
  if(kind==='pistol')trigger.y+=1.5;
  const support=kind==='bolt'?mix(magazine,rawSupport,.22):kind==='marksman'?mix(magazine,rawSupport,.55):kind==='pistol'?{x:trigger.x+.8,y:trigger.y-2.4}:rawSupport;
  return {kind,stock,triggerHand:trigger,supportHand:support,magazine,muzzle,
    torsoYaw,shoulderPocket,
    triggerShoulder:rotate({x:-13,y:2}),supportShoulder:rotate({x:0,y:-9}),cheek:{x:stock.x+5,y:stock.y-3.5}};
}

/** 방패의 표시용 장착. 총기 장착 기준은 유지하고 몸의 투영과 분리합니다. */
export function equipmentMountPose(unit:RealtimeUnitState):WeaponMountPose {
  const mount=weaponMountPose(unit.weaponName??'');
  if(unit.shieldRaised&&mount.kind==='pistol'){
    const shift=(p:Point):Point=>({x:p.x+3,y:p.y+3});
    return {...mount,stock:shift(mount.stock),muzzle:shift(mount.muzzle),triggerHand:{x:mount.triggerHand.x+3,y:mount.triggerHand.y+2},magazine:shift(mount.magazine),supportHand:{...HANDHELD_SHIELD.hand},triggerShoulder:{x:-8,y:9},supportShoulder:{x:-3,y:-9}};
  }
  return mount;
}

function normalize(angle:number):number { return Math.atan2(Math.sin(angle),Math.cos(angle)); }
function recoilOffset(time:number,shotAt:number|undefined,reducedMotion:boolean):number {
  const age=shotAt===undefined?1:time-shotAt;
  return !reducedMotion&&age>0&&age<.14?Math.sin(age/.14*Math.PI)*1.2:0;
}

const approach=(from:number,to:number,limit:number):number=>from+Math.max(-limit,Math.min(limit,to-from));
function reloadReach(unit:RealtimeUnitState,time:number,motion:OperatorMotion):number {
  const age=motion.reloadStartedAt===undefined?-1:time-motion.reloadStartedAt;
  return unit.action==='reload'&&(unit.reloadRemaining??0)>0&&age>=0
    ?Math.sin(Math.PI*Math.min(1,age/(age+unit.reloadRemaining))):0;
}

/** 표시 상태만 소유합니다. 이동 거리로 보행을 진행하고 정지·앉기·장전 취소를 부드럽게 잇습니다. */
export class OperatorAnimator {
  private tracks=new Map<string,{time:number;position:Point;floor:number;inactive:boolean;distance:number;frame:OperatorAnimationFrame}>();

  sample(unit:RealtimeUnitState,time:number,reducedMotion=false,motion:OperatorMotion={}):OperatorAnimationFrame {
    const pose=operatorAssemblyPose(unit),prior=this.tracks.get(unit.id),floor=unit.floor??unit.position.floor??0;
    const dt=prior?time-prior.time:0;
    const travelled=prior?Math.hypot(unit.position.x-prior.position.x,unit.position.y-prior.position.y):0;
    // 뒤로 걷기에서는 골반을 180도 뒤집지 않아 상체가 역방향으로 꼬이지 않습니다.
    let facing=pose.lowerFacing;
    if(Math.abs(normalize(facing-pose.upperFacing))>Math.PI*110/180)facing=normalize(facing+Math.PI);
    const reset=!prior||dt<0||dt>.5||travelled>80||prior.floor!==floor||prior.inactive!==pose.inactive;
    const reach=reloadReach(unit,time,motion);
    if(reset||reducedMotion||pose.inactive){
      const frame={lowerFacing:reducedMotion?pose.upperFacing:facing,crouchAmount:Number(pose.crouched),step:0,reloadReach:reducedMotion||pose.inactive?0:reach};
      this.tracks.set(unit.id,{time,position:{...unit.position},floor,inactive:pose.inactive,distance:0,frame});
      return frame;
    }
    // 같은 경기 시각에는 프레임 수와 무관하게 완전히 같은 자세를 돌려줍니다.
    if(dt===0)return prior.frame;
    const distance=prior.distance+(pose.moving?travelled:0);
    const walking=pose.moving&&travelled>0;
    const step=approach(prior.frame.step,walking?Math.sin(distance*Math.PI*2/24)*1.4:0,dt*(walking?24:1.4/.12));
    const frame={
      lowerFacing:prior.frame.lowerFacing+approach(0,normalize(facing-prior.frame.lowerFacing),dt*8),
      crouchAmount:approach(prior.frame.crouchAmount,Number(pose.crouched),dt/.18),
      step,
      gaitPhase:(distance/24)%1,
      reloadReach:unit.action==='reload'?reach:approach(prior.frame.reloadReach,0,dt/.12),
    };
    this.tracks.set(unit.id,{time,position:{...unit.position},floor,inactive:pose.inactive,distance,frame});
    return frame;
  }

  clear():void { this.tracks.clear(); }
}

/** 하체는 실제 이동 방향, 상체와 무기는 실제 조준 방향을 따릅니다. */
export function operatorAssemblyPose(unit:RealtimeUnitState):OperatorAssemblyPose {
  const speed=Math.hypot(unit.velocity.x,unit.velocity.y),moving=Boolean(unit.alive)&&speed>1;
  const installing=unit.action==='plant'||unit.action==='disable'||unit.action==='utility'&&/설치/.test(unit.goal??'');
  const inactive=Boolean(unit.downed)||!unit.alive;
  return {lowerFacing:moving?Math.atan2(unit.velocity.y,unit.velocity.x):unit.facing,upperFacing:unit.facing,moving,
    crouched:unit.locomotion==='crouch'||unit.locomotion==='crawl'||inactive||installing,inactive,weapon:unit.downed||!unit.alive?undefined:equipmentMountPose(unit)};
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

/**
 * 조립식 경기 캐릭터. 레이어 순서는 고정하고 하체·상체·무기·손을 독립 계산합니다.
 * 외형은 RealtimeUnitState를 읽기만 하며 성능·충돌·탄약을 수정하지 않습니다.
 */
export function paintModularOperator(ctx:CanvasRenderingContext2D,unit:RealtimeUnitState,time:number,shotAt:number|undefined,asset:PartLoader,reducedMotion=false,motion:OperatorMotion={}):boolean {
  const pose=operatorAssemblyPose(unit),kit=KITS[unit.callSign]??KITS.MAGPIE,down=Boolean(unit.downed)||!unit.alive;
  const shielding=Boolean(unit.shieldRaised)&&pose.weapon?.kind==='pistol'&&!pose.inactive;
  const thrown=motion.thrown,throwAge=thrown?.thrownAt===undefined?-1:time-thrown.thrownAt;
  const throwing=!down&&!shielding&&unit.action!=='reload'&&throwAge>=0&&throwAge<.45;
  const installing=!down&&!shielding&&(unit.action==='plant'||unit.action==='disable'||unit.action==='utility'&&/설치/.test(unit.goal??''));
  const parts=new SurvivorParts(ctx,asset);
  const kick=down?0:recoilOffset(time,shotAt,reducedMotion);

  ctx.save();ctx.globalAlpha=unit.alive?1:.4;
  ctx.fillStyle='#04090C22';ctx.beginPath();ctx.ellipse(unit.position.x,unit.position.y+2,10,6,0,0,Math.PI*2);ctx.fill();
  ctx.translate(unit.position.x,unit.position.y);ctx.rotate(pose.upperFacing);
  const crouch=motion.frame?.crouchAmount??Number(pose.crouched);
  const relative=normalize((motion.frame?.lowerFacing??pose.lowerFacing)-pose.upperFacing);
  const strafe=Math.abs(relative)>.7&&Math.abs(relative)<2.4;
  parts.feet(strafe?0:relative,crouch,motion.frame?.step??0,motion.frame?.gaitPhase??0,!reducedMotion&&pose.moving,strafe?(relative<0?'strafe_left':'strafe_right'):unit.locomotion==='sprint'?'run':'walk');
  if(down){parts.body(0,kit.pack);parts.head(0);ctx.restore();return true;}
  const mount=pose.weapon!;
  const throwProgress=reducedMotion?.6:Math.min(1,throwAge/.45);
  const lower=installing?1:throwing?1-throwProgress:0;
  const offset={x:-kick-7*lower,y:9*lower};
  const displaced=(p:Point):Point=>({x:p.x+offset.x,y:p.y+offset.y});
  let triggerTarget=displaced(mount.triggerHand),supportTarget=shielding?mount.supportHand:displaced(mount.supportHand);
  const reach=reducedMotion?0:motion.frame?.reloadReach??reloadReach(unit,time,motion);
  if(reach>0&&!shielding)supportTarget=displaced(mix(mount.supportHand,mount.magazine,reach));
  if(installing){triggerTarget={x:8,y:5};supportTarget={x:9,y:-5};}
  // 원본 소총/권총 자세의 팔꿈치 방향을 사용하고 손끝은 현재 총기 접점에 고정합니다.
  const triggerArm=shielding?{shoulder:mount.triggerShoulder,elbow:mix(mount.triggerShoulder,triggerTarget,.5),hand:triggerTarget}:{shoulder:mount.triggerShoulder,elbow:mount.kind==='pistol'?{x:-11.5,y:9}:{x:-12,y:11},hand:triggerTarget};
  // 방패 팔은 과도한 옆꺾임 없이 짧게 투영된 위팔·아래팔로 손잡이에 닿습니다.
  let supportArm=shielding?{shoulder:mount.supportShoulder,elbow:{x:3,y:-9},hand:supportTarget}:{shoulder:mount.supportShoulder,elbow:mount.kind==='pistol'?{x:10.5,y:-3.5}:{x:10,y:-3},hand:supportTarget};
  if(throwing){const thrownPose=throwArmPose(throwProgress);supportArm={shoulder:mount.supportShoulder,elbow:thrownPose.elbow,hand:thrownPose.hand};}
  // 몸통이 아래팔을 덮지 않도록 원본처럼 몸통 → 팔 → 머리 순으로 조립합니다.
  parts.body(mount.torsoYaw,kit.pack);
  parts.arm(supportArm);parts.arm(triggerArm,shielding);
  parts.head(mount.torsoYaw);

  const wristAngle=(arm:ArmPose)=>Math.atan2(arm.hand.y-arm.elbow.y,arm.hand.x-arm.elbow.x);
  // 양손을 총기보다 먼저 그려 슬라이드·상부 레일을 손바닥이 덮지 않게 합니다.
  parts.hand(triggerTarget,wristAngle(triggerArm));
  if(!shielding)parts.hand(supportTarget,wristAngle(supportArm),true,reach>0);
  ctx.save();ctx.translate(mount.muzzle.x+offset.x,mount.muzzle.y+offset.y);
  const weaponDrawn=paintWeaponPart(ctx,unit.weaponName??'',asset);ctx.restore();

  const shieldDrawn=!shielding||paintHandheldShield(ctx,asset);
  if(shielding)parts.hand(supportTarget,wristAngle(supportArm),true);

  ctx.restore();return weaponDrawn&&shieldDrawn;
}

/** 표시 전용 총구. 시뮬레이션 발사 원점·충돌에는 역으로 전달하지 않습니다. */
export function modularMuzzlePosition(unit:RealtimeUnitState,time=0,shotAt?:number,reducedMotion=false):Point {
  const offset=equipmentMountPose(unit).muzzle,c=Math.cos(unit.facing),s=Math.sin(unit.facing);
  const x=offset.x-recoilOffset(time,shotAt,reducedMotion);
  return {x:unit.position.x+x*c-offset.y*s,y:unit.position.y+x*s+offset.y*c};
}
