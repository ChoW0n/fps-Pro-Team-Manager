import type { RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { muzzlePosition } from '../domain/operatorVisuals';

export type PartLoader = (file:string) => HTMLImageElement;
const MASKED = new Set(['COLLIER','MEDVED','REUSS','MARCHAND','성곽','SAVELLI']);

/** 선수 카드와 전장에서 같은 공통 머리 파츠를 표시합니다. */
export function minimalHeadFile(callSign:string):string {return `minimal-head-${MASKED.has(callSign)?1:0}-front.png`;}

/** 기존 총기 이름을 바꾸지 않고 작은 화면에서 식별할 형태만 분리합니다. 제조사 실측 도면은 아닙니다. */
export function weaponSilhouette(name:string):'carbine'|'suppressed'|'bullpup'|'p90'|'precision'|'bolt' {
  if(/C14/.test(name))return 'bolt';
  if(/PSG|HK417/.test(name))return 'precision';
  if(/P90/.test(name))return 'p90';
  if(/X95|타보르/.test(name))return 'bullpup';
  if(/MP5SD|Val/.test(name))return 'suppressed';
  return 'carbine';
}

/** 세 방향 파츠는 화면 위로 서 있고, 무기는 실제 월드 방향을 따릅니다. */
export function operatorDirection(facing:number):{view:'front'|'back'|'side';mirror:number} {
  return Math.abs(Math.sin(facing))>.72?{view:Math.sin(facing)>0?'front':'back',mirror:1}:{view:'side',mirror:Math.cos(facing)<0?-1:1};
}

/** 양손을 총기 레이어에 붙여 파지점이 따로 흔들리지 않게 합니다. */
function paintWeapon(ctx:CanvasRenderingContext2D,name:string):void {
  const kind=weaponSilhouette(name),long=kind==='precision'||kind==='bolt',length=long?38:30;
  ctx.fillStyle='#263237';ctx.strokeStyle='#090E11';ctx.lineWidth=1.5;ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(-length,-2);ctx.lineTo(-length+8,-2);ctx.lineTo(-length+10,-5);ctx.lineTo(-7,-5);ctx.lineTo(-7,-2);ctx.lineTo(0,-2);ctx.lineTo(0,1);ctx.lineTo(-8,1);ctx.lineTo(-11,4);ctx.lineTo(-length+8,4);ctx.lineTo(-length,7);ctx.closePath();ctx.fill();ctx.stroke();
  if(kind==='suppressed'){ctx.fillStyle='#171F23';ctx.fillRect(-11,-3,11,5);ctx.strokeRect(-11,-3,11,5);}
  if(kind==='p90'){ctx.fillStyle='#777E73';ctx.fillRect(-25,-7,18,3);ctx.strokeRect(-25,-7,18,3);}
  else{const magazine=kind==='bullpup'?-24:-16;ctx.fillStyle='#51594F';ctx.beginPath();ctx.moveTo(magazine,3);ctx.lineTo(magazine+5,3);ctx.lineTo(magazine+3,10);ctx.lineTo(magazine-2,9);ctx.closePath();ctx.fill();ctx.stroke();}
  if(long){ctx.fillStyle='#10181D';ctx.fillRect(-28,-10,15,4);ctx.fillRect(-24,-6,2,2);}
  // 단순 장갑 덩어리 두 개가 권총손잡이와 핸드가드를 잡습니다.
  ctx.fillStyle='#69654D';for(const [x,y] of [[-length+10,5],[-10,2]]){ctx.beginPath();ctx.ellipse(x,y,3.3,2.8,-.3,0,Math.PI*2);ctx.fill();ctx.stroke();}
}

/** 실제 이동·자세·사격 사건으로만 파츠를 움직이며 엔진의 총구 좌표를 그대로 사용합니다. */
export function paintMinimalOperator(ctx:CanvasRenderingContext2D,unit:RealtimeUnitState,time:number,shotAt:number|undefined,asset:PartLoader,reducedMotion=false):boolean {
  const direction=operatorDirection(unit.facing),body=asset(`minimal-body-0-${direction.view}.png`),head=asset(`minimal-head-${MASKED.has(unit.callSign)?1:0}-${direction.view}.png`);
  if(!(body.naturalWidth??body.width)||!(head.naturalWidth??head.width))return false;
  const speed=Math.hypot(unit.velocity.x,unit.velocity.y),moving=speed>1&&unit.alive;
  const down=Boolean(unit.downed)||!unit.alive,crouch=unit.locomotion==='crouch';
  const bob=!reducedMotion&&moving&&!down?Math.sin(time*(unit.locomotion==='sprint'?15:10))*.65:0;
  const size=down?30:crouch?29:34,headSize=24;
  ctx.save();ctx.translate(unit.position.x,unit.position.y);ctx.globalAlpha=unit.alive?1:.4;
  ctx.fillStyle='#04090C55';ctx.beginPath();ctx.ellipse(0,11,14,6,0,0,Math.PI*2);ctx.fill();
  ctx.save();if(down)ctx.rotate(unit.facing+Math.PI/2);ctx.scale(direction.mirror,1);
  ctx.drawImage(body,-size/2,-size*.45+bob,size,size);
  ctx.drawImage(head,-headSize/2,-size*.45-headSize*.72+bob,headSize,headSize);
  // 작은 식별 띠에만 팀 색을 사용합니다.
  ctx.fillStyle=unit.side==='공격'?'#2FD4C4':'#F0873C';ctx.fillRect(-size*.29,-3+bob,3,2);
  ctx.restore();ctx.restore();
  if(!down){
    const muzzle=muzzlePosition(unit.callSign,unit.position,unit.facing),age=shotAt===undefined?1:time-shotAt;
    const kick=!reducedMotion&&age>0&&age<.14?Math.sin(age/.14*Math.PI)*1.2:0;
    const kind=weaponSilhouette(unit.weaponName??''),length=kind==='precision'||kind==='bolt'?38:30;
    // 어깨에서 실제 파지점까지 짧은 소매를 연결합니다. 무기·양손의 상대 위치는 고정입니다.
    for(const [index,[x,y]] of [[-length+10-kick,5],[-10-kick,2]].entries()){
      const hand={x:muzzle.x+x*Math.cos(unit.facing)-y*Math.sin(unit.facing),y:muzzle.y+x*Math.sin(unit.facing)+y*Math.cos(unit.facing)};
      ctx.strokeStyle='#090E11';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(unit.position.x+(index?-7:7),unit.position.y-4+bob);ctx.lineTo(hand.x,hand.y);ctx.stroke();ctx.strokeStyle='#35454E';ctx.lineWidth=4;ctx.stroke();
    }
    ctx.save();ctx.translate(muzzle.x,muzzle.y);ctx.rotate(unit.facing);ctx.translate(-kick,0);
    paintWeapon(ctx,unit.weaponName??'');
    if(unit.shieldRaised){ctx.fillStyle='#56666B';ctx.strokeStyle='#0B1115';ctx.lineWidth=2;ctx.fillRect(-6,-16,6,32);ctx.strokeRect(-6,-16,6,32);ctx.fillStyle='#839AA0';ctx.fillRect(-5,-10,4,8);}
    ctx.restore();
  }
  return true;
}
