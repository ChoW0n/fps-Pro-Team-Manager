import type { ReactElement } from 'react';
import { getOperator } from '../domain/Operator';

/** 세대 색상은 아트 그룹이며 능력치나 출시 순서를 변경하지 않습니다. */
export const EMBLEM_GENERATIONS = [
  ['MAGPIE','COLLIER','해동','ARBEL'],
  ['AUBERT','MEDVED','REUSS','BRANDT'],
  ['MARCHAND','HALLORAN','성곽','SAVELLI'],
] as const;
/** 생성된 래스터 시트에서 해당 배지만 표시하며 미확인 상대의 신원을 공개하지 않습니다. */
export function OperatorEmblem({callSign,unknown=false}:{callSign?:string;unknown?:boolean}):ReactElement {
 const row=EMBLEM_GENERATIONS.findIndex(group=>(group as readonly string[]).includes(callSign??''));
 if(unknown||row<0)return <span className="operator-emblem emblem-unknown" role="img" aria-label="미확인 오퍼레이터">?</span>;
 const col=(EMBLEM_GENERATIONS[row] as readonly string[]).indexOf(callSign!);
 const equipment=getOperator(callSign!)?.equipment.name;
 // 원본의 정확한 배지 테두리 범위만 뷰포트에 표시합니다. 이미지는 재작화하지 않습니다.
 const x=[40,393,747,1101][col],y=[43,386,721][row];
 return <svg className="operator-emblem" viewBox={`${x} ${y} 306 306`} role="img" aria-label={`${callSign} · ${equipment}`} data-generation={row+1}>
   <title>{`${callSign} · ${equipment}`}</title>
   <image href={`${import.meta.env.BASE_URL}operators/emblems/generations-v1.png`} width="1448" height="1086"/>
 </svg>;
}
