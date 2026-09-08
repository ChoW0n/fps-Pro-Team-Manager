/**
 * 경기 판정 클래스
 * 선수별 경기 발휘치를 새로 뽑아 두 팀의 라인전·한타·운영 합계로 승자를 정합니다.
 */

import { MAX_VOLATILITY_STD_DEV, MIN_VOLATILITY_STD_DEV } from './playerStats';
import { Player } from './Player';
import { clampToStatRange, generateNormalRandom } from './randomUtils';
import { Team } from './Team';

export class MatchSimulator {
  /**
   * 기복 수치 0~100을 표준편차 경계값 사이로 선형 변환합니다.
   */
  public volatilityToStdDev(volatility: number): number {
    return MIN_VOLATILITY_STD_DEV
      + (MAX_VOLATILITY_STD_DEV - MIN_VOLATILITY_STD_DEV) * (volatility / 100);
  }

  /**
   * 한 선수의 라인전·한타·운영 경기 발휘치 합계를 계산합니다.
   */
  private calculatePlayerPerformance(player: Player): number {
    const stdDev = this.volatilityToStdDev(player.volatility);
    return [player.laning, player.teamfight, player.macro].reduce(
      (sum, mean) => sum + clampToStatRange(generateNormalRandom(mean, stdDev)),
      0,
    );
  }

  /**
   * 팀 선수 다섯 명의 경기 발휘치 합계를 계산합니다.
   */
  private calculateTeamPerformance(team: Team): number {
    return team.players.reduce(
      (sum, player) => sum + this.calculatePlayerPerformance(player),
      0,
    );
  }

  /**
   * 두 팀의 경기 발휘치를 비교해 승자를 반환합니다.
   */
  public play(homeTeam: Team, awayTeam: Team): Team {
    const homeScore = this.calculateTeamPerformance(homeTeam);
    const awayScore = this.calculateTeamPerformance(awayTeam);

    if (homeScore === awayScore) {
      return Math.random() < 0.5 ? homeTeam : awayTeam;
    }

    return homeScore > awayScore ? homeTeam : awayTeam;
  }
}