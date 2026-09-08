/**
 * 선수 콘솔 표기 함수 모듈입니다.
 * 모든 사람이 읽는 선수 이름은 이 형식으로 통일합니다.
 */

import type { Player } from './Player';

/**
 * 닉네임과 본명을 결합한 공용 선수 표기를 반환합니다.
 */
export function formatPlayerName(player: Player): string {
  return `'${player.nickname}' ${player.realName}`;
}