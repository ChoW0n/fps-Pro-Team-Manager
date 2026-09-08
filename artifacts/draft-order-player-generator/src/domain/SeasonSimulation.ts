/**
 * 반복 시즌 검증 클래스
 * 같은 로스터로 100시즌을 실행해 팀별 우승 횟수와 우승팀 변화 횟수를 집계합니다.
 */

import { Season } from './Season';
import { Team } from './Team';
import { MatchResult } from './MatchResult';

// 반복 시즌 검증 결과 타입
export interface SeasonSimulationResult {
  firstSeasonStandings: Team[];
  firstSeasonMatch: MatchResult;
  championChanges: number;
  championships: Map<string, number>;
}

export class SeasonSimulation {
  /**
   * 정규시즌 진행 클래스를 준비합니다.
   */
  constructor(private readonly season = new Season()) {}

  /**
   * 같은 팀으로 시즌을 반복하고 우승 분포를 반환합니다.
   */
  public run(teams: Team[], seasonCount = 100): SeasonSimulationResult {
    const championships = new Map(teams.map((team) => [team.name, 0]));
    let firstSeasonStandings: Team[] = [];
    let previousChampion = '';
    let firstSeasonMatch: MatchResult | undefined;
    let championChanges = 0;

    for (let index = 0; index < seasonCount; index += 1) {
      const standings = this.season.run(teams);
      const champion = standings[0].name;

      if (index === 0) {
        if (!this.season.firstMatchResult) throw new Error('첫 시즌 경기 기록을 보존하지 못했습니다.');
        firstSeasonMatch = this.season.firstMatchResult;
        firstSeasonStandings = standings.map((team) => {
          const snapshot = new Team(team.name, team.players);
          snapshot.wins = team.wins;
          snapshot.losses = team.losses;
          return snapshot;
        });
      }
      if (previousChampion && previousChampion !== champion) championChanges += 1;

      championships.set(champion, championships.get(champion)! + 1);
      previousChampion = champion;
    }

    if (!firstSeasonMatch) throw new Error('첫 시즌 경기 기록이 없습니다.');
    return { firstSeasonStandings, firstSeasonMatch, championChanges, championships };
  }
}