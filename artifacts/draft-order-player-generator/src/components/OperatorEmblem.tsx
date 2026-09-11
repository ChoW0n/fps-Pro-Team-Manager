import type { ReactElement } from 'react';
import { getOperator } from '../domain/Operator';

const SYMBOLS:Record<string,{body:string;detail?:string}>={
  MAGPIE:{body:'M10 13 14 10l6 8 6-8 4 3-7 9 6 8-4 3-5-7-5 7-4-3 6-8Z',detail:'M20 18a3 3 0 1 0 0 6 3 3 0 1 0 0-6'},
  COLLIER:{body:'M8 18h10l3-3h8v3h4v5h-4v3h-8l-3-3H8Z',detail:'M11 15h8v2h-8Zm12 12h5v2h-5Z'},
  해동:{body:'M20 9a12 12 0 1 0 0 24 12 12 0 1 0 0-24Zm0 5a7 7 0 1 1 0 14 7 7 0 1 1 0-14Z',detail:'M18 11h4v7h7v4h-7v7h-4v-7h-7v-4h7Z'},
  ARBEL:{body:'M8 29h5l4-15h6l4 15h5l-6-20H14Z',detail:'M15 23h10v4H15Zm3-7h4v5h-4Z'},
  AUBERT:{body:'m7 20 7-6h12l7 6-7 6H14Zm9-2v4h8v-4Z',detail:'M18 9h4v6h-4Zm0 16h4v7h-4Z'},
  MEDVED:{body:'M9 10h22v7H20v16h-6V17H9Z',detail:'M25 18h5v13h-5Z'},
  REUSS:{body:'M20 7 32 12v9c0 7-5 11-12 14-7-3-12-7-12-14v-9Zm-7 9v6c0 3 2 5 5 7V14Z',detail:'M22 14h5v12l-5 4Z'},
  BRANDT:{body:'M18 8h4v7h7v4h-7v7h-4v-7h-7v-4h7Zm2 9a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z'},
  MARCHAND:{body:'M8 11h24v22h-6V17H14v16H8Zm9 9h6v4h-6Z',detail:'M15 27h10v3H15Z'},
  HALLORAN:{body:'M8 14h7l3-4h6l3 4h5v16H8Zm12 3a5 5 0 1 0 0 10 5 5 0 1 0 0-10Z',detail:'M10 11h5v2h-5Z'},
  성곽:{body:'M7 13h5V8h5v5h6V8h5v5h5v20H7Zm9 11h8v9h-8Z',detail:'M11 18h18v4H11Z'},
  SAVELLI:{body:'M20 8 31 13v9c0 7-5 10-11 13-6-3-11-6-11-13v-9Zm-5 8 5 5 5-5 3 3-5 5 5 5-3 3-5-5-5 5-3-3 5-5-5-5Z'},
};
/** 창작 오퍼레이터의 고유 장비·역할을 단색 방송 아이콘으로 구분합니다. */
export function OperatorEmblem({callSign,unknown=false}:{callSign?:string;unknown?:boolean}):ReactElement {
  const equipment=getOperator(callSign??'')?.equipment.name;
  return <svg className="operator-emblem" viewBox="0 0 40 44" role="img" aria-label={unknown?'미확인 오퍼레이터':`${callSign} · ${equipment}`}>
    <path d="M20 1 37 9v20L20 43 3 29V9Z" fill="currentColor" opacity=".95"/>
    <path d="M20 5 33 11v16L20 38 7 27V11Z" fill="#101820"/>
    <path d="M8 29 20 39l12-10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".65"/>
    {unknown?<text x="20" y="29" textAnchor="middle" fontSize="23" fontWeight="800" fill="currentColor">?</text>:<g fill="currentColor"><path d={SYMBOLS[callSign??'']?.body??'M12 12h16v16H12Z'}/>{SYMBOLS[callSign??'']?.detail&&<path d={SYMBOLS[callSign??''].detail} opacity=".48"/>}</g>}
    {!unknown&&<title>{`${callSign} · ${equipment}`}</title>}
  </svg>;
}
