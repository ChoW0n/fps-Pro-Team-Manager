/**
 * 영문 게임 코드의 한국어 표시명 모듈입니다.
 * 콘솔 출력은 이 매핑을 거쳐 사람이 읽는 이름만 사용합니다.
 */

import type { ChampionRole, Engagement, RangeType, Timing } from './Champion';
import type { EffectPrimitive } from './Champion';
import type { Position } from './Player';
import type { MatchEventType } from './matchEvents';

// 포지션 표시명입니다.
export const positionDisplayNames: Record<Position, string> = { TOP: '수비설계', JUNGLE: '수색', MID: '화력', ADC: '진입', SUPPORT: '차단' };
// 챔피언 시점 태그 표시명입니다.
export const timingDisplayNames: Record<Timing, string> = { EARLY: '초반형', LATE: '후반형' };
// 교전 방식 태그 표시명입니다.
export const engagementDisplayNames: Record<Engagement, string> = { DIVE: '돌진', POKE: '견제' };
// 공격 범위 태그 표시명입니다.
export const rangeDisplayNames: Record<RangeType, string> = { SINGLE: '단일', AOE: '광역' };
// 전투 역할 태그 표시명입니다.
export const roleDisplayNames: Record<ChampionRole, string> = { TANK: '탱커', DAMAGE: '딜러', UTILITY: '유틸' };
// 밴픽 행동 표시명입니다.
export const draftActionDisplayNames: Record<'BAN' | 'PICK', string> = { BAN: '금지', PICK: '선택' };
// 선수 능력치 표시명입니다.
export const statDisplayNames = { laning: '초기 교전', farming: '자원 관리', vision: '시야', teamfight: '집단 교전', macro: '운영', championPool: '오퍼레이터 숙련', volatility: '기복', mastery: '숙련도', aggression: '공격성' };
// 경기 구간 표시명입니다.
export const phaseDisplayNames: Record<'EARLY' | 'MID' | 'LATE', string> = { EARLY: '초반', MID: '중반', LATE: '후반' };
// 스킬 이펙트 프리미티브 표시명입니다.
export const primitiveDisplayNames: Record<EffectPrimitive, string> = { FLASH: '섬광', TREMOR: '진동', PILLAR: '광주', RIFT: '균열', WAVE: '파동', SHARD: '파편', BURST: '폭산', SLASH: '검격', TRAIL: '궤적', SPIRAL: '나선', RUNE: '룬문', FLOAT: '부유' };
// 경기 이벤트 표시명입니다.
export const matchEventDisplayNames: Record<MatchEventType, string> = { KILL: '전투 이탈', GANK: '기습 진입', OBJECTIVE: '목표 지점', TOWER: '방어선 붕괴', TEAMFIGHT: '집단 교전', ROAM: '재배치' };