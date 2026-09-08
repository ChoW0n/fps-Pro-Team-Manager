/**
 * 영문 게임 코드의 한국어 표시명 모듈입니다.
 * 콘솔 출력은 이 매핑을 거쳐 사람이 읽는 이름만 사용합니다.
 */

import type { ChampionRole, Engagement, RangeType, Timing } from './Champion';
import type { EffectType } from './Champion';
import type { Position } from './Player';

// 포지션 표시명입니다.
export const positionDisplayNames: Record<Position, string> = { TOP: '탑', JUNGLE: '정글', MID: '미드', ADC: '원딜', SUPPORT: '서포터' };
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
export const statDisplayNames = { laning: '라인전', teamfight: '한타', macro: '운영', championPool: '챔피언 폭', volatility: '기복' };
// 경기 구간 표시명입니다.
export const phaseDisplayNames: Record<'EARLY' | 'MID' | 'LATE', string> = { EARLY: '초반', MID: '중반', LATE: '후반' };
// 자동 판정 이펙트 표시명입니다.
export const effectDisplayNames: Record<EffectType, string> = { RIFT: '균열', BLOOD: '혈흔', WAVE: '파동' };