import manifest from '../operators/manifest.json';
import collierDowned from '../operators/collier-downed-v3.json';
import collierCrawl from '../operators/collier-downed-crawl-v1.json';
import magpieWalk from '../operators/magpie-walk-v1.json';
import haedongWalk from '../operators/haedong-walk-v1.json';
import magpieCrouch from '../operators/magpie-crouch-v1.json';
import collierCrouch from '../operators/collier-crouch-v1.json';
import haedongCrouch from '../operators/haedong-crouch-v1.json';
import arbelCrouch from '../operators/arbel-crouch-v1.json';
import aubertCrouch from '../operators/aubert-crouch-v1.json';
import medvedCrouch from '../operators/medved-crouch-v1.json';
import reussCrouch from '../operators/reuss-crouch-v1.json';
import brandtCrouch from '../operators/brandt-crouch-v1.json';
import marchandCrouch from '../operators/marchand-crouch-v1.json';
import halloranCrouch from '../operators/halloran-crouch-v1.json';
import seonggakCrouch from '../operators/seonggak-crouch-v1.json';
import savelliCrouch from '../operators/savelli-crouch-v1.json';
import collierWalk from '../operators/collier-walk-v1.json';
import arbelWalk from '../operators/arbel-walk-v1.json';
import aubertWalk from '../operators/aubert-walk-v1.json';
import medvedWalk from '../operators/medved-walk-v1.json';
import reussWalk from '../operators/reuss-walk-v1.json';
import brandtWalk from '../operators/brandt-walk-v1.json';
import marchandWalk from '../operators/marchand-walk-v1.json';
import halloranWalk from '../operators/halloran-walk-v1.json';
import seonggakWalk from '../operators/seonggak-walk-v1.json';
import savelliWalk from '../operators/savelli-walk-v1.json';
import type { TacticalPoint } from './tacticalMaps';
import { weaponMuzzleOffset } from '../components/weaponParts';
import type { RealtimeUnitState } from './realtime/TacticalRealtimeSimulation';

/** 3600×2400 월드에서 몸통 약 24단위, 총구와 충돌 반경이 같은 게임용 비율입니다. */
export const OPERATOR_SCALE = 0.11;
export const TEMPORARY_OPERATOR_SCALE = 0.75;
const VISUAL_KEYS: Record<string, keyof typeof manifest> = {
  MAGPIE: 'magpie', COLLIER: 'collier', 해동: 'haedong',
};

export interface OperatorVisual {
  width:number; height:number; pivot:readonly number[]; muzzle:readonly number[]; sprite:string; portrait?:string;
  region?:readonly number[];
  sheetWidth?:number; sheetHeight?:number;
  scale?:number;
  rotationOffset?:number;
}
const FIELD_VISUALS: Record<string,OperatorVisual> = Object.fromEntries([
  ['ARBEL',[20,100,370,250],[165,118],[363,123]],
  ['AUBERT',[432,100,355,250],[163,130],[347,122]],
  ['MEDVED',[840,100,395,270],[180,135],[387,123]],
  ['REUSS',[20,490,398,260],[145,128],[392,110]],
  ['BRANDT',[425,505,455,250],[150,115],[447,109]],
  ['MARCHAND',[895,500,314,253],[130,120],[306,109]],
  ['HALLORAN',[20,885,440,230],[158,100],[433,108]],
  ['성곽',[458,890,343,240],[140,110],[335,108]],
  ['SAVELLI',[837,885,393,257],[170,122],[385,110]],
].map(([name,region,pivot,muzzle])=>[name,{region,pivot,muzzle,width:(region as number[])[2],height:(region as number[])[3],sprite:'field-operators-atlas.webp'}])) as Record<string,OperatorVisual>;

/** 준비된 인물에만 고유 원화를 연결하며 다른 인물로 대체하지 않습니다. */
export function operatorVisual(callSign: string): OperatorVisual | undefined {
  const key = VISUAL_KEYS[callSign];
  return key ? manifest[key] : FIELD_VISUALS[callSign];
}

// 한 자세로 제작한 원본에서 크롭·축소한 좌표를 그대로 사용합니다. 다운 중에는 사격하지 않습니다.
const COLLIER_DOWNED: OperatorVisual = collierDowned.visual;

/** 실제 이동 중인 다운 선수만 경기 시각으로 재생합니다. 정지·일시정지에는 가짜 동작을 만들지 않습니다. */
export function operatorPoseVisual(callSign: string, downed: boolean, crawlTime?: number): OperatorVisual | undefined {
  if (callSign !== 'COLLIER' || !downed) return operatorVisual(callSign);
  if (crawlTime === undefined || !Number.isFinite(crawlTime) || crawlTime < 0) return COLLIER_DOWNED;
  return collierCrawl.frames[Math.floor(crawlTime * 4) % collierCrawl.frames.length];
}

const WALK_SHEETS: Record<string, { frames: OperatorVisual[] }> = {
  MAGPIE: magpieWalk, 해동: haedongWalk,
  'COLLIER': collierWalk,
  'ARBEL': arbelWalk,
  'AUBERT': aubertWalk,
  'MEDVED': medvedWalk,
  'REUSS': reussWalk,
  'BRANDT': brandtWalk,
  'MARCHAND': marchandWalk,
  'HALLORAN': halloranWalk,
  '성곽': seonggakWalk,
  'SAVELLI': savelliWalk,
};
const WALK_ACTIONS = new Set(['approach', 'search', 'reposition']);
const CROUCH_SHEETS: Record<string, { frames: OperatorVisual[] }> = {
  'MAGPIE': magpieCrouch,
  'COLLIER': collierCrouch,
  '해동': haedongCrouch,
  'ARBEL': arbelCrouch,
  'AUBERT': aubertCrouch,
  'MEDVED': medvedCrouch,
  'REUSS': reussCrouch,
  'BRANDT': brandtCrouch,
  'MARCHAND': marchandCrouch,
  'HALLORAN': halloranCrouch,
  '성곽': seonggakCrouch,
  'SAVELLI': savelliCrouch,
};

/** 검수된 보행만 미리 읽습니다. 적 편성이나 엔진 상태를 변경하지 않습니다. */
export function operatorWalkVisual(callSign: string, crouched = false): OperatorVisual | undefined {
  return (crouched ? CROUCH_SHEETS : WALK_SHEETS)[callSign]?.frames[0];
}

/** 실제 이동·행동·경기 시각으로 시트를 고릅니다. 발사와 특수 동작에는 보행을 덧씌우지 않습니다. */
export function operatorStateVisual(unit: RealtimeUnitState, time: number): OperatorVisual | undefined {
  const speed = Math.hypot(unit.velocity.x, unit.velocity.y);
  const moving = speed > .01;
  const crawling = unit.alive && unit.downed?.mode === 'crawl' && moving;
  const fallback = operatorPoseVisual(unit.callSign, Boolean(unit.downed), crawling ? time : undefined);
  const sheet = (unit.locomotion === 'crouch' ? CROUCH_SHEETS : WALK_SHEETS)[unit.callSign];
  if (!sheet || !unit.alive || unit.downed || unit.traversal || unit.shieldRaised || unit.reviving
    || unit.reloadRemaining > 0 || (unit.locomotion !== 'walk' && unit.locomotion !== 'crouch') || !WALK_ACTIONS.has(unit.action)
    || !moving || !Number.isFinite(time) || time < 0) return fallback;
  // 앞걸음 시트를 횡이동·후진에 재사용해 발이 미끄러지는 표현을 만들지 않습니다.
  const forward = (unit.velocity.x * Math.cos(unit.facing) + unit.velocity.y * Math.sin(unit.facing)) / speed;
  if (forward < .7) return fallback;
  return sheet.frames[Math.floor(time * (unit.locomotion === 'crouch' ? 3 : 4)) % sheet.frames.length];
}

/** 탑뷰 총기 길이와 오른어깨 기준점을 회전시켜 판정과 중계가 같은 발사 원점을 사용합니다. */
export function muzzlePosition(weaponName: string, position: TacticalPoint, facing: number): TacticalPoint {
  const offset=weaponMuzzleOffset(weaponName);
  return { x: position.x + offset.x * Math.cos(facing) - offset.y * Math.sin(facing),
    y: position.y + offset.x * Math.sin(facing) + offset.y * Math.cos(facing) };
}
