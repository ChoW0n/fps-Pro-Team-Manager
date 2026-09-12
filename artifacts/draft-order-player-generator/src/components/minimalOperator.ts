import type { RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { paintWeaponPart, weaponPart, weaponUp } from './weaponParts';
import { muzzlePosition } from '../domain/operatorVisuals';

export type PartLoader = (file:string) => HTMLImageElement;
const MASKED = new Set(['COLLIER','MEDVED','REUSS','MARCHAND','성곽','SAVELLI']);

// 창작 군장의 식별용 조합입니다. 실부대 지급품이나 미구현 가젯 효과를 뜻하지 않습니다.
const KITS:Record<string,{color:string;pouches:number;pack:number;tool:'shells'|'radio'|'optic'|'probe'|'case'|'charge'|'plate'|'roll'|'coil'|'lamp'|'drone'|'battery'|'interceptor'}>={
  MAGPIE:{color:'#706B50',pouches:3,pack:9,tool:'shells'},
  COLLIER:{color:'#39484B',pouches:4,pack:8,tool:'radio'},
  '해동':{color:'#526052',pouches:3,pack:10,tool:'coil'},
  ARBEL:{color:'#817858',pouches:2,pack:8,tool:'roll'},
  AUBERT:{color:'#455360',pouches:2,pack:13,tool:'drone'},
  MEDVED:{color:'#66644C',pouches:3,pack:14,tool:'charge'},
  REUSS:{color:'#46534C',pouches:2,pack:15,tool:'plate'},
  BRANDT:{color:'#56605A',pouches:2,pack:9,tool:'roll'},
  MARCHAND:{color:'#3E4B57',pouches:4,pack:11,tool:'coil'},
  HALLORAN:{color:'#7B795C',pouches:3,pack:12,tool:'roll'},
  '성곽':{color:'#586352',pouches:3,pack:17,tool:'battery'},
  SAVELLI:{color:'#434E48',pouches:2,pack:10,tool:'interceptor'},
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
  if(kit.tool==='drone'){box(x-3,-13,9,10,'#59666B');for(const y of [-12,-6]){box(x-5,y,2,4,'#252C2B');box(x+6,y,2,4,'#252C2B');}box(x,-11,3,3,'#899B91');}
  else if(kit.tool==='battery'){box(x-3,-13,9,15,'#65715A');box(x-1,-16,5,3,'#303C37');ctx.beginPath();ctx.moveTo(x+6,-10);ctx.lineTo(x+9,-10);ctx.lineTo(x+9,5);ctx.lineTo(x+3,5);ctx.stroke();}
  else if(kit.tool==='interceptor'){box(x-2,-16,7,6,'#718078');for(const dx of [0,4])box(x+dx,-9,2,15,'#343E3B');box(x,-18,3,2,'#879991');}
  else if(kit.tool==='plate'){box(x,-16,3,24,'#8B9386');box(x+4,-17,2,23,'#5D6966');}
  else if(kit.tool==='charge'){for(const dx of [0,4])box(x+dx,-17,3,20,'#90896E');}
  else if(kit.tool==='roll'){box(x-2,-9,6,19,'#8A8970');box(x-2,-4,6,2,'#343E35');}
  else if(kit.tool==='probe'||kit.tool==='radio'){box(x,-12,5,10,'#303C3D');ctx.beginPath();ctx.moveTo(x+2,-12);ctx.lineTo(x+(kit.tool==='probe'?5:2),-24);ctx.stroke();}
  else if(kit.tool==='case'){box(x-2,-10,7,14,'#677981');box(x,-12,3,2,'#242F35');}
  else if(kit.tool==='coil'){ctx.fillStyle='#67777A';ctx.beginPath();ctx.arc(x+2,-5,5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(x+2,-5,2,0,Math.PI*2);ctx.stroke();}
  else if(kit.tool==='shells'){for(let i=0;i<3;i++)box(x+i*3,-12,2,7,'#9A8764');}
  else{box(x,-14,5,7,'#293B40');box(x+1,-13,3,2,kit.tool==='optic'?'#829D97':'#B6B59B');}
}

/** 편성 카드도 같은 각진 헬멧·바이저와 개인 군장색을 사용합니다. */
export function minimalPortrait(callSign:string):string {
 const color=(KITS[callSign]??KITS.MAGPIE).color;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="#101A1D" stroke-width="2.5" stroke-linejoin="round"><path fill="${color}" d="M9 62V46L22 39H43L56 46V62Z"/><path fill="#69796F" d="M16 18L22 9H43L49 20L46 37L36 43L23 39L17 30Z"/><path fill="${color}" d="M12 23L17 9L28 3L43 5L51 16L49 24L32 20Z"/><path fill="#15282D" d="M16 23H48L45 31H20Z"/><path fill="#293B3E" d="M24 33H40L42 40L25 41Z"/><path fill="#303F42" d="M12 25H18V38H12Z"/></g><path stroke="#92AAA2" stroke-width="2" d="M21 25H28"/><path fill="#263639" d="M23 49H30V60H23ZM34 49H41V60H34Z"/></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

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

/** 실제 이동·자세·사격 사건으로만 파츠를 움직이며 엔진의 총구 좌표를 그대로 사용합니다. */
export function paintMinimalOperator(ctx:CanvasRenderingContext2D,unit:RealtimeUnitState,time:number,shotAt:number|undefined,_asset:PartLoader,reducedMotion=false):boolean {
  const direction=operatorDirection(unit.facing),kit=KITS[unit.callSign]??KITS.MAGPIE;
  const moving=Math.hypot(unit.velocity.x,unit.velocity.y)>1&&unit.alive;
  const down=Boolean(unit.downed)||!unit.alive,crouch=unit.locomotion==='crouch';
  const step=!reducedMotion&&moving&&!down?Math.sin(time*(unit.locomotion==='sprint'?15:10)):0;
  const bob=step*.5,age=shotAt===undefined?1:time-shotAt;
  const kick=!reducedMotion&&age>0&&age<.14?Math.sin(age/.14*Math.PI)*1.2:0;
  const muzzle=muzzlePosition(unit.callSign,unit.position,unit.facing),up=weaponUp(unit.facing),part=weaponPart(unit.weaponName??'');
  const weapon=()=>{
    if(down)return;
    // 총기와 손, 소매가 같은 좌우 보정과 파지점을 공유합니다.
    for(const [index,[x,y]] of [[part.grip-kick,5],[part.support-kick,2]].entries()){
      const px=x*.75,py=y*.75*up;
      const hand={x:muzzle.x+px*Math.cos(unit.facing)-py*Math.sin(unit.facing),y:muzzle.y+px*Math.sin(unit.facing)+py*Math.cos(unit.facing)};
      ctx.strokeStyle='#111B1E';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(unit.position.x+(index?-8:8),unit.position.y-10+bob);ctx.lineTo(hand.x,hand.y);ctx.stroke();ctx.strokeStyle=kit.color;ctx.lineWidth=3.5;ctx.stroke();
    }
    ctx.save();ctx.translate(muzzle.x,muzzle.y);ctx.rotate(unit.facing);ctx.scale(.75,.75*up);ctx.translate(-kick,0);paintWeaponPart(ctx,unit.weaponName??'');
    if(unit.shieldRaised){ctx.fillStyle='#56666B';ctx.strokeStyle='#0B1115';ctx.lineWidth=2;ctx.fillRect(-6,-16,6,32);ctx.strokeRect(-6,-16,6,32);ctx.fillStyle='#839AA0';ctx.fillRect(-5,-10,4,8);}ctx.restore();
  };
  ctx.save();ctx.globalAlpha=unit.alive?1:.4;
  ctx.fillStyle='#04090C55';ctx.beginPath();ctx.ellipse(unit.position.x,unit.position.y+19,14,5,0,0,Math.PI*2);ctx.fill();
  // 북쪽 사격은 몸 뒤로 가립니다. 총기 전체를 머리 위에 덧그리지 않습니다.
  if(direction.view==='back')weapon();
  ctx.save();ctx.translate(unit.position.x,unit.position.y+bob);if(down)ctx.rotate(unit.facing+Math.PI/2);ctx.scale(direction.mirror,crouch?.83:1);
  const poly=(points:number[][],fill:string)=>{ctx.fillStyle=fill;ctx.strokeStyle='#101A1D';ctx.lineWidth=1.4;ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();};
  // 각진 어깨, 분리된 허벅지·무릎·부츠로 작은 머리와 연결된 실루엣을 만듭니다.
  for(const side of [-1,1]){const x=side*(direction.view==='side'?3:5),stride=side*step*2;
    poly([[x-4,4],[x+4,4],[x+3,16+stride],[x-3,16+stride]],kit.color);
    poly([[x-3,11+stride],[x+3,11+stride],[x+3,15+stride],[x-3,16+stride]],'#384547');
    poly([[x-3,17+stride],[x+3,17+stride],[x+4,22+stride],[x-4,22+stride]],'#253235');
  }
  poly([[-12,-15],[-7,-19],[7,-19],[12,-15],[10,5],[6,8],[-7,8],[-10,4]],kit.color);
  ctx.save();ctx.scale(direction.view==='side'?.85:1,1);paintKit(ctx,unit.callSign,direction.view);ctx.restore();
  ctx.save();ctx.translate(0,12*Math.max(0,-Math.sin(unit.facing)));
  poly([[-4,-22],[4,-22],[4,-17],[-4,-17]],'#6D756A');
  poly([[-9,-30],[-6,-35],[5,-35],[9,-30],[8,-23],[4,-20],[-5,-21],[-9,-25]],MASKED.has(unit.callSign)?'#414D50':'#777F72');
  poly([[-10,-29],[-8,-35],[-3,-38],[6,-37],[10,-32],[9,-28],[3,-29],[-6,-27]],kit.color);
  if(direction.view!=='back'){
    poly(direction.view==='side'?[[0,-29],[10,-29],[10,-25],[1,-24]]:[[-8,-29],[8,-29],[7,-25],[-7,-25]],'#15282D');
    ctx.fillStyle='#92AAA2';ctx.fillRect(direction.view==='side'?6:-6,-28,3,1);
    if(MASKED.has(unit.callSign)){poly([[-4,-24],[4,-24],[5,-20],[-3,-20]],'#27373C');ctx.fillStyle='#657570';ctx.fillRect(-2,-23,3,2);}
  }else{ctx.fillStyle='#323F41';ctx.fillRect(-6,-29,12,3);ctx.fillRect(-3,-34,6,4);}
  ctx.fillStyle='#354548';ctx.fillRect(direction.view==='side'?-8:-10,-28,3,7);
  ctx.restore();
  ctx.fillStyle=unit.side==='공격'?'#2FD4C4':'#F0873C';ctx.fillRect(-11,-11,2,4);
  ctx.restore();if(direction.view!=='back')weapon();ctx.restore();return true;
}
