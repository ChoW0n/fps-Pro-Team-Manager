import type { RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';
import { paintWeaponPart, weaponPart } from './weaponParts';
import { muzzlePosition } from '../domain/operatorVisuals';

export type PartLoader = (file:string) => HTMLImageElement;

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

/** 가파른 탑뷰의 한 로컬 좌표계를 머리·군장·팔·총기가 연속적으로 공유합니다. */
export function paintMinimalOperator(ctx:CanvasRenderingContext2D,unit:RealtimeUnitState,time:number,shotAt:number|undefined,_asset:PartLoader,reducedMotion=false):boolean {
  const kit=KITS[unit.callSign]??KITS.MAGPIE,part=weaponPart(unit.weaponName??'');
  const down=Boolean(unit.downed)||!unit.alive,crouch=unit.locomotion==='crouch';
  const moving=Math.hypot(unit.velocity.x,unit.velocity.y)>1&&unit.alive;
  const step=!reducedMotion&&moving&&!down?Math.sin(time*(unit.locomotion==='sprint'?15:10)):0;
  const age=shotAt===undefined?1:time-shotAt,kick=!reducedMotion&&age>0&&age<.14?Math.sin(age/.14*Math.PI)*1.2:0;
  const muzzle=muzzlePosition(unit.callSign,unit.position,unit.facing),c=Math.cos(unit.facing),s=Math.sin(unit.facing);
  const dx=muzzle.x-unit.position.x,dy=muzzle.y-unit.position.y;
  const tip={x:dx*c+dy*s,y:-dx*s+dy*c};
  const ink='#10191C',shade='#29373A',light='#859080',outline=2;
  ctx.save();ctx.globalAlpha=unit.alive?1:.4;
  ctx.fillStyle='#04090C55';ctx.beginPath();ctx.ellipse(unit.position.x,unit.position.y+3,19,15,0,0,Math.PI*2);ctx.fill();
  ctx.translate(unit.position.x,unit.position.y);ctx.rotate(unit.facing);
  ctx.strokeStyle=ink;ctx.lineWidth=outline;ctx.lineJoin='round';ctx.lineCap='round';
  const poly=(points:number[][],fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();};
  const box=(x:number,y:number,w:number,h:number,fill=kit.color)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);};
  // 전신을 세우지 않고 어깨·배낭·뒤로 짧게 보이는 부츠를 위에서 읽게 합니다.
  for(const side of [-1,1]){
    const rear=down?-29:crouch?-17:-22+side*step*2;
    poly([[rear,side*4],[rear+10,side*4],[rear+9,side*10],[rear-2,side*9]],shade);
  }
  poly([[-16,-10],[-8,-14],[2,-13],[7,-7],[6,9],[-1,14],[-14,11],[-18,3]],kit.color);
  box(-20,-kit.pack*.42,8,kit.pack*.84,shade);
  // 군장 식별은 외곽의 큰 물체 한두 개로 유지합니다.
  if(kit.tool==='charge'||kit.tool==='plate'){box(-17,11,18,4,light);if(kit.tool==='charge')box(-15,16,12,3,kit.color);}
  else if(kit.tool==='drone'){box(-17,10,12,6,shade);box(-18,9,3,3,light);box(-8,15,3,3,light);}
  else if(kit.tool==='battery'){box(-17,10,11,8,kit.color);box(-14,9,5,2,light);}
  else if(kit.tool==='interceptor'){box(-17,11,13,4,shade);box(-13,15,4,5,light);}
  else if(kit.tool==='coil'){ctx.fillStyle=light;ctx.beginPath();ctx.arc(-12,14,5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  else if(kit.tool==='roll'){box(-19,10,16,6,light);}
  else if(kit.tool==='radio'){box(-15,10,8,7,shade);ctx.beginPath();ctx.moveTo(-15,12);ctx.lineTo(-24,12);ctx.stroke();}
  else{for(let i=0;i<Math.min(3,kit.pouches);i++)box(-17+i*5,11,4,6,light);}
  // 같은 두 면의 헬멧이 모든 방향에서 회전하므로 특정 각도에서 높이가 바뀌지 않습니다.
  poly([[-14,-6],[-10,-11],[-2,-12],[5,-7],[6,1],[0,6],[-10,5],[-15,0]],shade);
  poly([[-12,-6],[-9,-10],[-2,-10],[3,-6],[3,0],[-2,3],[-10,2]],kit.color);
  box(-9,-12,8,3,light);box(-8,4,6,3,shade);
  ctx.fillStyle=unit.side==='공격'?'#2FD4C4':'#F0873C';ctx.fillRect(-18,-5,2,5);
  if(!down){
    for(const [index,[x,y]] of [[part.grip-kick,5],[part.support-kick,2]].entries()){
      const hand={x:tip.x+x*.75,y:tip.y+y*.75},shoulder={x:2,y:index?10:-10};
      ctx.strokeStyle=ink;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(shoulder.x,shoulder.y);ctx.lineTo(hand.x,hand.y);ctx.stroke();ctx.strokeStyle=kit.color;ctx.lineWidth=3;ctx.stroke();
    }
    // 무기는 언제나 전방에 그립니다. 270도도 별도 가림·거울 반전 분기가 없습니다.
    ctx.save();ctx.translate(tip.x,tip.y);ctx.scale(.75,.75);ctx.translate(-kick,0);paintWeaponPart(ctx,unit.weaponName??'',kit.color,outline/.75);
    if(unit.shieldRaised){ctx.fillStyle=shade;ctx.strokeStyle=ink;ctx.lineWidth=outline/.75;ctx.fillRect(-5,-18,7,36);ctx.strokeRect(-5,-18,7,36);ctx.fillStyle=light;ctx.fillRect(-4,-9,5,9);}ctx.restore();
  }
  ctx.restore();return true;
}
