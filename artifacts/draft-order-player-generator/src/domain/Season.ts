/**
 * 정규시즌 진행 클래스
 * 일정을 실행하고 팀별 승패와 최종 순위를 계산합니다.
 */

import { MatchSimulator } from './MatchSimulator';
import { SeasonSchedule } from './SeasonSchedule';
import { Team } from './Team';

export class Season {
  /**
   * 일정 생성기와 경기 판정기를 준비합니다.
   */
  constructor(
    private readonly schedule = new SeasonSchedule(),
    private readonly matchSimulator = new MatchSimulator(),
  ) {}

  /**
   * 같은 팀 구성으로 정규시즌 한 번을 진행하고 순위표를 반환합니다.
   */
  public run(teams: Team[]): Team[] {
    teams.forEach((team) => team.resetRecord());

    this.schedule.createDoubleRoundRobin(teams).forEach(({ homeTeam, awayTeam }) => {
      const winner = this.matchSimulator.play(homeTeam, awayTeam);
      const loser = winner === homeTeam ? awayTeam : homeTeam;
      winner.wins += 1;
      loser.losses += 1;
    });

    return [...teams].sort(
      (left, right) =>
        right.wins - left.wins
        || right.getWinRate() - left.getWinRate()
        || left.name.localeCompare(right.name),
    );
  }
}