import { OPERATOR_SCALE, type OperatorVisual } from '../domain/operatorVisuals';
import type { RealtimeUnitState } from '../domain/realtime/TacticalRealtimeSimulation';

/** 프레임의 헬멧 원점·회전·축척을 그대로 사용합니다. 총기가 포함된 시트만 한 번 그립니다. */
export function drawOperatorSheet(ctx:CanvasRenderingContext2D,visual:OperatorVisual,unit:RealtimeUnitState,asset:(file:string)=>HTMLImageElement):boolean {
 const image=asset(visual.sprite);if(!image.complete||!image.naturalWidth)return false;
 const scale=visual.scale??OPERATOR_SCALE,[x,y,w,h]=visual.region??[0,0,visual.width,visual.height];
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(unit.position.x,unit.position.y);ctx.rotate(unit.facing+(visual.rotationOffset??0));ctx.scale(scale,scale);
 ctx.drawImage(image,x,y,w,h,-visual.pivot[0],-visual.pivot[1],w,h);ctx.restore();return true;
}

/** 표시 전용 총구입니다. 시뮬레이션 총구 함수와 사건 데이터는 변경하지 않습니다. */
export function sheetMuzzlePosition(visual:OperatorVisual,unit:RealtimeUnitState):{x:number;y:number} {
 const scale=visual.scale??OPERATOR_SCALE,angle=unit.facing+(visual.rotationOffset??0);
 const x=(visual.muzzle[0]-visual.pivot[0])*scale,y=(visual.muzzle[1]-visual.pivot[1])*scale;
 return {x:unit.position.x+x*Math.cos(angle)-y*Math.sin(angle),y:unit.position.y+x*Math.sin(angle)+y*Math.cos(angle)};
}
