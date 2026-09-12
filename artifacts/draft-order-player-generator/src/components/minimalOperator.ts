import type { RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { muzzlePosition } from '../domain/operatorVisuals';

export type PartLoader = (file:string) => HTMLImageElement;
const MASKED = new Set(['COLLIER','MEDVED','REUSS','MARCHAND','성곽','SAVELLI']);

// 창작 군장의 식별용 조합입니다. 실부대 지급품이나 미구현 가젯 효과를 뜻하지 않습니다.
const KITS:Record<string,{color:string;pouches:number;pack:number;tool:'shells'|'radio'|'optic'|'probe'|'case'|'charge'|'plate'|'roll'|'coil'|'lamp'}>={
  MAGPIE:{color:'#706B50',pouches:3,pack:9,tool:'shells'},
  COLLIER:{color:'#39484B',pouches:4,pack:8,tool:'radio'},
  '해동':{color:'#526052',pouches:3,pack:10,tool:'optic'},
  ARBEL:{color:'#817858',pouches:2,pack:8,tool:'probe'},
  AUBERT:{color:'#455360',pouches:2,pack:13,tool:'case'},
  MEDVED:{color:'#66644C',pouches:3,pack:14,tool:'charge'},
  REUSS:{color:'#46534C',pouches:2,pack:15,tool:'plate'},
  BRANDT:{color:'#56605A',pouches:2,pack:9,tool:'roll'},
  MARCHAND:{color:'#3E4B57',pouches:4,pack:11,tool:'coil'},
  HALLORAN:{color:'#7B795C',pouches:3,pack:12,tool:'roll'},
  '성곽':{color:'#586352',pouches:3,pack:17,tool:'plate'},
  SAVELLI:{color:'#434E48',pouches:2,pack:10,tool:'lamp'},
};

/** 몸체 위에 조끼·파우치·운반 장비를 같은 축척으로 조립합니다. 양쪽 장비는 대칭입니다. */
function paintKit(ctx:CanvasRenderingContext2D,callSign:string,view:'front'|'back'|'side'):void {
  const kit=KITS[callSign];if(!kit)return;
  const box=(x:number,y:number,w:number,h:number,color=kit.color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);};
  ctx.strokeStyle='#11191A';ctx.lineWidth=1.2;ctx.lineJoin='round';
  if(view==='side'){
    box(-13,-12,kit.pack*.45,17);box(2,-10,5,15);
    box(4,-3,4,6,'#8A856A');
  }else if(view==='back'){
    box(-kit.pack/2,-13,kit.pack,19);box(-kit.pack/2+2,-10,kit.pack-4,7,'#697365');
    for(const x of [-kit.pack/2+1,kit.pack/2-3])box(x,-13,2,19,'#303C37');
  }else{
    box(-9,-13,18,19);box(-7,-15,3,8);box(4,-15,3,8);
    for(let i=0;i<kit.pouches;i++)box(-8+i*16/kit.pouches,-2,16/kit.pouches-1,7,'#777861');
  }
  // 어깨 바깥 장비를 남겨 축소된 중계에서도 각 인물의 윤곽이 구별되게 합니다.
  const x=view==='side'?-12:-kit.pack/2-3;
  if(kit.tool==='plate'){box(x,-16,3,24,'#8B9386');box(x+4,-17,2,23,'#5D6966');}
  else if(kit.tool==='charge'){for(const dx of [0,4])box(x+dx,-17,3,20,'#90896E');}
  else if(kit.tool==='roll'){box(x-2,-9,6,19,'#8A8970');box(x-2,-4,6,2,'#343E35');}
  else if(kit.tool==='probe'||kit.tool==='radio'){box(x,-12,5,10,'#303C3D');ctx.beginPath();ctx.moveTo(x+2,-12);ctx.lineTo(x+(kit.tool==='probe'?5:2),-24);ctx.stroke();}
  else if(kit.tool==='case'){box(x-2,-10,7,14,'#677981');box(x,-12,3,2,'#242F35');}
  else if(kit.tool==='coil'){ctx.fillStyle='#67777A';ctx.beginPath();ctx.arc(x+2,-5,5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x+2,-5,2,0,Math.PI*2);ctx.stroke();}
  else if(kit.tool==='shells'){for(let i=0;i<3;i++)box(x+i*3,-12,2,7,'#9A8764');}
  else{box(x,-14,5,7,'#293B40');box(x+1,-13,3,2,kit.tool==='optic'?'#829D97':'#B6B59B');}
}

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
  ctx.save();ctx.translate(0,bob);ctx.scale(size/34,size/34);paintKit(ctx,unit.callSign,direction.view);ctx.restore();
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
