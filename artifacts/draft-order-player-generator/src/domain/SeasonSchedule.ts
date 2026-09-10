/**
 * 정규시즌 일정 클래스
 * 10개 팀이 서로 두 번 만나는 총 90경기의 대진을 생성합니다.
 * 현재 홈팀과 원정팀 구분은 일정의 두 경기를 구별하는 이름일 뿐 경기 결과에는 아무 효과가 없습니다.
 * 홈 이점이 필요해지면 경기 판정 규칙에서 별도로 반영해야 합니다.
 */

import { Team } from './Team';

// 한 경기의 두 참가 팀을 나타내는 일정 타입
export interface ScheduledMatch {
  homeTeam: Team;
  awayTeam: Team;
}

export class SeasonSchedule {
  /**
   * 더블 라운드로빈 일정을 생성합니다.
   */
  public createDoubleRoundRobin(teams: Team[]): ScheduledMatch[] {
    const matches: ScheduledMatch[] = [];

    for (let first = 0; first < teams.length; first += 1) {
      for (let second = first + 1; second < teams.length; second += 1) {
        matches.push({ homeTeam: teams[first], awayTeam: teams[second] });
        matches.push({ homeTeam: teams[second], awayTeam: teams[first] });
      }
    }

    return matches;
  }
}