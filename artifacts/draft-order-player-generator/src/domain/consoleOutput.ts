/**
 * 콘솔 출력 모듈
 * 생성된 선수 목록을 콘솔에 포지션별로 그룹화하여 출력합니다.
 */

import { Player, Position } from './Player';

// React StrictMode 등에서 여러 번 출력되는 것을 방지하는 플래그
let hasOutputRun = false;

/**
 * 50명의 선수 배열을 받아 브라우저 콘솔에 결과를 출력합니다.
 * 모듈 수준에서 단 한 번만 실행되도록 보장합니다.
 */
export function printPlayersToConsole(players: Player[]): void {
  if (hasOutputRun) return;
  hasOutputRun = true;

  const positions: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

  console.log('=== DRAFT ORDER 선수 생성 결과 (총 50명) ===');

  positions.forEach(position => {
    // 현재 포지션에 해당하는 선수들만 필터링
    const positionPlayers = players.filter(p => p.position === position);
    
    // 콘솔 그룹 시작
    console.group(`[${position}] 포지션 선수 목록 (${positionPlayers.length}명)`);
    
    positionPlayers.forEach((player, index) => {
      // 번호를 2자리로 패딩
      const no = (index + 1).toString().padStart(2, '0');
      // 닉네임을 일정 길이로 패딩하여 표 형태를 맞춤
      const nickname = player.nickname.padEnd(20, ' ');
      
      // 능력치도 3자리로 패딩하여 일렬로 정렬
      const laning = player.laning.toString().padStart(3, ' ');
      const teamfight = player.teamfight.toString().padStart(3, ' ');
      const macro = player.macro.toString().padStart(3, ' ');
      const champ = player.championPool.toString().padStart(3, ' ');
      const vol = player.volatility.toString().padStart(3, ' ');

      console.log(
        `${no}. ${nickname} | 나이: ${player.age} | 라인전: ${laning} | 한타: ${teamfight} | 운영: ${macro} | 챔프폭: ${champ} | 기복: ${vol}`
      );
    });

    // 콘솔 그룹 종료
    console.groupEnd();
  });

  console.log('============================================');
}
