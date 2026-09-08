/**
 * 콘솔 출력 모듈
 * 생성된 선수 목록을 콘솔에 포지션별로 그룹화하여 출력합니다.
 */

import { Player, Position } from './Player';
import { SeasonSimulationResult } from './SeasonSimulation';
import { Team } from './Team';

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

/**
 * 첫 시즌 순위표를 순위, 팀 이름, 승패, 승률 형식으로 출력합니다.
 */
export function printStandingsToConsole(standings: Team[]): void {
  console.group('=== 정규시즌 순위표 (총 90경기) ===');
  standings.forEach((team, index) => {
    console.log(
      `${index + 1}위 | ${team.name.padEnd(18, ' ')} | ${team.wins}승 ${team.losses}패 | 승률 ${(team.getWinRate() * 100).toFixed(1)}%`,
    );
  });
  console.groupEnd();
}

/**
 * 100시즌 반복 검증의 우승팀 변화와 팀별 우승 횟수를 출력합니다.
 */
export function printSimulationToConsole(result: SeasonSimulationResult): void {
  console.group('=== 같은 로스터 100시즌 반복 검증 ===');
  console.log(`직전 시즌과 우승팀이 달라진 횟수: ${result.championChanges}회`);

  [...result.championships.entries()]
    .sort((left, right) => right[1] - left[1])
    .forEach(([teamName, wins]) => console.log(`${teamName.padEnd(18, ' ')} | 우승 ${wins}회`));

  const championshipCounts = [...result.championships.values()];
  const maximumWins = Math.max(...championshipCounts);
  const minimumWins = Math.min(...championshipCounts);

  if (maximumWins === 100) {
    console.log('관찰: 한 팀이 100번 모두 우승했습니다. 현재 기복 영향이 매우 약합니다.');
  } else if (maximumWins - minimumWins <= 5) {
    console.log('관찰: 우승 횟수가 팀별로 거의 균등합니다. 현재 기복 영향이 매우 강합니다.');
  } else {
    console.log('관찰: 강한 팀이 자주 우승하지만 우승팀은 고정되지 않았습니다.');
  }
  console.groupEnd();
}
