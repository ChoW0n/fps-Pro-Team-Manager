/**
 * 콘솔 출력 모듈
 * 생성된 선수 목록을 콘솔에 포지션별로 그룹화하여 출력합니다.
 */

import { Player, Position } from './Player';
import { SeasonSimulationResult } from './SeasonSimulation';
import { Team } from './Team';
import { CHAMPIONS } from './Champion';
import { formatChampionIntroduction } from './Champion';
import { MatchResult } from './MatchResult';
import { formatPlayerName } from './playerDisplay';
import {
  draftActionDisplayNames,
  engagementDisplayNames,
  phaseDisplayNames,
  positionDisplayNames,
  rangeDisplayNames,
  roleDisplayNames,
  statDisplayNames,
  timingDisplayNames,
  primitiveDisplayNames,
} from './displayNames';

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
    console.group(`[${positionDisplayNames[position]}] 포지션 선수 목록 (${positionPlayers.length}명)`);
    
    positionPlayers.forEach((player, index) => {
      // 번호를 2자리로 패딩
      const no = (index + 1).toString().padStart(2, '0');
      // 공용 선수 표기를 일정 길이로 패딩하여 표 형태를 맞춤
      const playerName = formatPlayerName(player).padEnd(20, ' ');
      
      // 능력치도 3자리로 패딩하여 일렬로 정렬
      const laning = player.laning.toString().padStart(3, ' ');
      const teamfight = player.teamfight.toString().padStart(3, ' ');
      const macro = player.macro.toString().padStart(3, ' ');
      const champ = `${player.championPool.length}종 (${player.championPool.map((champion) => champion.name).join(', ')})`;
      const vol = player.volatility.toString().padStart(3, ' ');
      const mastery = player.mastery.toString().padStart(3, ' ');
      const aggression = player.aggression.toString().padStart(3, ' ');

      console.log(
          `${no}. ${playerName} | 나이: ${player.age} | ${statDisplayNames.laning}: ${laning} | ${statDisplayNames.teamfight}: ${teamfight} | ${statDisplayNames.macro}: ${macro} | ${statDisplayNames.championPool}: ${champ} | ${statDisplayNames.volatility}: ${vol} | ${statDisplayNames.mastery}: ${mastery} | ${statDisplayNames.aggression}: ${aggression}`
      );
    });

    // 콘솔 그룹 종료
    console.groupEnd();
  });

  console.log('============================================');
}

/**
 * 포지션별 챔피언과 전투 태그를 콘솔에 출력합니다.
 */
export function printChampionsToConsole(): void {
  console.group('=== DRAFT ORDER 챔피언 25종 ===');
  (['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as Position[]).forEach((position) => {
    console.group(`[${positionDisplayNames[position]}]`);
    CHAMPIONS.filter((champion) => champion.position === position).forEach((champion) => {
      console.log(
        `${formatChampionIntroduction(champion)} | 고유명: ${champion.name} | 수식어: ${champion.title} | `
        + `상징색: ${champion.symbolColor} | `
        + `태그: ${positionDisplayNames[champion.position]}, ${timingDisplayNames[champion.timing]}, `
        + `${engagementDisplayNames[champion.engagement]}, ${rangeDisplayNames[champion.range]}, `
        + `${roleDisplayNames[champion.role]} | 난이도 ${champion.difficulty}`,
      );
      console.log(`  패시브: ${champion.skills.passive.name} - ${champion.skills.passive.description}`);
      console.log(`  기본기: ${champion.skills.basic.name} - ${champion.skills.basic.description}`);
      console.log(`  궁극기: ${champion.skills.ultimate.name} - ${champion.skills.ultimate.description}`);
      champion.skills.ultimate.effectLayers.forEach((layer) => {
        console.log(`    ${primitiveDisplayNames[layer.primitive]} / 시작 ${layer.startMs}ms / 지속 ${layer.durationMs}ms / 강도 ${layer.intensity}x`);
      });
    });
    console.groupEnd();
  });
  console.groupEnd();
}

/**
 * 첫 시즌에서 보존한 한 경기의 밴픽과 구간 결과를 콘솔에 출력합니다.
 */
export function printMatchResultToConsole(result: MatchResult): void {
  console.group(`=== 첫 시즌 상세 경기: ${result.homeTeam.name} vs ${result.awayTeam.name} ===`);
  result.draftRecords.forEach((record, index) => {
    const actor = record.player ? ` ${formatPlayerName(record.player)}` : '';
    console.log(`${index + 1}. ${draftActionDisplayNames[record.action]} | ${record.teamName}${actor} | ${record.champion.name}`);
  });
  result.phases.forEach((phase) => {
    console.log(`${phaseDisplayNames[phase.phase]} | 레벨 ${result.homeTeam.name} ${phase.homeLevel.toFixed(1)} : ${result.awayTeam.name} ${phase.awayLevel.toFixed(1)} | 전력 ${result.homeTeam.name} ${phase.homePower.toFixed(1)} : ${result.awayTeam.name} ${phase.awayPower.toFixed(1)} | 구간 승자 ${phase.winnerName}`);
    phase.adjustments.forEach((adjustment) => console.log(`  보정: ${adjustment}`));
  });
  console.log(`경기 승자: ${result.winner.name}`);
  console.groupEnd();
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
  const highestStatTeam = [...result.firstSeasonStandings].sort((left, right) =>
    right.players.reduce((sum, player) => sum + player.laning + player.teamfight + player.macro + player.mastery, 0)
    - left.players.reduce((sum, player) => sum + player.laning + player.teamfight + player.macro + player.mastery, 0),
  )[0];
  console.log(`선수 능력치 총합 최고 팀: ${highestStatTeam.name} | 우승 ${result.championships.get(highestStatTeam.name)}회`);
  console.log(`후반형 편중 | ${formatPhaseWinStats(result.lateHeavyPhaseStats)}`);
  console.log(`초반형 편중 | ${formatPhaseWinStats(result.earlyHeavyPhaseStats)}`);
  console.groupEnd();
}

/** 세 구간 편중 조합의 승/전체와 승률만 한 줄로 만듭니다. */
function formatPhaseWinStats(stats: SeasonSimulationResult['lateHeavyPhaseStats']): string {
  return (['EARLY', 'MID', 'LATE'] as const)
    .map((phase) => {
      const value = stats[phase];
      const rate = value.total === 0 ? 0 : value.wins / value.total * 100;
      return `${phaseDisplayNames[phase]} ${value.wins}/${value.total} ${rate.toFixed(1)}%`;
    })
    .join(' | ');
}
