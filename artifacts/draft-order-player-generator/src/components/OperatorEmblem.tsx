import type { ReactElement } from 'react';

const SYMBOLS:Record<string,string>={
  MAGPIE:'M6 25 Q16 5 26 25 L20 22 L16 28 L12 22 Z',
  COLLIER:'M5 20 H13 L17 13 L21 27 L25 20 H31 M7 10 H29',
  해동:'M18 5 A13 13 0 1 0 18 31 A13 13 0 1 0 18 5 M18 11 V25 M11 18 H25',
  ARBEL:'M7 28 L14 8 L19 18 L25 6 L30 28 M11 21 H27',
  AUBERT:'M6 18 L14 12 H22 L30 18 L22 24 H14 Z M18 9 V27',
  MEDVED:'M7 8 H29 V14 L23 18 L29 22 V28 H7 V22 L13 18 L7 14 Z',
  REUSS:'M18 4 L29 9 V18 Q29 28 18 32 Q7 28 7 18 V9 Z M18 9 V27',
  BRANDT:'M18 4 V11 M18 25 V32 M4 18 H11 M25 18 H32 M18 13 A5 5 0 1 0 18 23 A5 5 0 1 0 18 13',
  MARCHAND:'M6 29 V9 H30 V29 M11 29 V18 H25 V29 M11 14 H25',
  HALLORAN:'M6 11 H13 L16 7 H23 L26 11 H30 V27 H6 Z M18 14 A5 5 0 1 0 18 24 A5 5 0 1 0 18 14',
  성곽:'M5 30 V13 H10 V7 H15 V13 H21 V7 H26 V13 H31 V30 Z M14 30 V22 H22 V30',
  SAVELLI:'M7 9 Q18 2 29 9 V18 Q29 28 18 32 Q7 28 7 18 Z M12 14 L24 22 M24 14 L12 22',
};
/** 창작 오퍼레이터의 고유 장비·역할을 단색 방송 아이콘으로 구분합니다. */
export function OperatorEmblem({callSign,unknown=false}:{callSign?:string;unknown?:boolean}):ReactElement {
  return <svg className="operator-emblem" viewBox="0 0 36 36" role="img" aria-label={unknown?'미확인 오퍼레이터':`${callSign} 오퍼레이터 아이콘`}>
    <path d="M18 1 L34 9 V27 L18 35 L2 27 V9 Z" fill="#101C23" stroke="currentColor" strokeWidth="1.5"/>
    {unknown?<text x="18" y="25" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">?</text>:<path d={SYMBOLS[callSign??'']??'M10 10 L26 26 M26 10 L10 26'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}
