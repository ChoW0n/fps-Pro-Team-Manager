// 창작 군장의 식별용 조합입니다. 실부대 지급품이나 미구현 가젯 효과를 뜻하지 않습니다.
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

// 이전 호출부는 유지하되 실제 구현은 조립식 모듈 하나만 사용합니다.
export { paintModularOperator as paintMinimalOperator, throwArmPose } from './modularOperator';
export type { OperatorMotion, PartLoader } from './modularOperator';
