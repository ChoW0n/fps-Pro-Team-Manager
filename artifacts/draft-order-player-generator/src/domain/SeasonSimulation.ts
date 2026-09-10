/**
 * 반복 시즌 검증 클래스
 * 같은 로스터로 100시즌을 실행해 팀별 우승 횟수와 우승팀 변화 횟수를 집계합니다.
 */

import { Season } from './Season';
import { Team } from './Team';
import { MatchResult } from './MatchResult';

// 편중 조합의 구간별 승패 누적 타입입니다.
export interface PhaseWinTotal {
  wins: number;
  total: number;
}

// 초반형 또는 후반형 편중 조합의 세 구간 누적 타입입니다.
export type TimingHeavyPhaseStats = Record<'EARLY' | 'MID' | 'LATE', PhaseWinTotal>;

// 반복 시즌 검증 결과 타입
export interface SeasonSimulationResult {
  firstSeasonStandings: Team[];
  firstSeasonMatch: MatchResult;
  championChanges: number;
  championships: Map<string, number>;
  lateHeavyPhaseStats: TimingHeavyPhaseStats;
  earlyHeavyPhaseStats: TimingHeavyPhaseStats;
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
    const lateHeavyPhaseStats = this.createEmptyTimingHeavyStats();
    const earlyHeavyPhaseStats = this.createEmptyTimingHeavyStats();

    for (let index = 0; index < seasonCount; index += 1) {
      const standings = this.season.run(teams, (result) => {
        this.accumulateTimingHeavyStats(result, lateHeavyPhaseStats, earlyHeavyPhaseStats);
      });
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
    return {
      firstSeasonStandings,
      firstSeasonMatch,
      championChanges,
      championships,
      lateHeavyPhaseStats,
      earlyHeavyPhaseStats,
    };
  }

  /** 편중 조합 집계를 위한 빈 세 구간 카운터를 만듭니다. */
  private createEmptyTimingHeavyStats(): TimingHeavyPhaseStats {
    return {
      EARLY: { wins: 0, total: 0 },
      MID: { wins: 0, total: 0 },
      LATE: { wins: 0, total: 0 },
    };
  }

  /** 한 경기의 홈·원정 조합을 각각 하나의 편중 관측치로 누적합니다. */
  private accumulateTimingHeavyStats(
    result: MatchResult,
    lateHeavyStats: TimingHeavyPhaseStats,
    earlyHeavyStats: TimingHeavyPhaseStats,
  ): void {
    this.accumulateTeamTimingObservation(result, result.homePicks, result.homeTeam.name, lateHeavyStats, earlyHeavyStats);
    this.accumulateTeamTimingObservation(result, result.awayPicks, result.awayTeam.name, lateHeavyStats, earlyHeavyStats);
  }

  /** 한 팀의 5개 픽 시점 태그 편중과 구간 승리를 누적합니다. */
  private accumulateTeamTimingObservation(
    result: MatchResult,
    picks: MatchResult['homePicks'],
    teamName: string,
    lateHeavyStats: TimingHeavyPhaseStats,
    earlyHeavyStats: TimingHeavyPhaseStats,
  ): void {
    const lateCount = picks.filter((pick) => pick.timing === 'LATE').length;
    const earlyCount = picks.length - lateCount;
    const target = lateCount > earlyCount ? lateHeavyStats : earlyCount > lateCount ? earlyHeavyStats : undefined;
    if (!target) return;
    result.phases.forEach((phase) => {
      target[phase.phase].total += 1;
      if (phase.winnerName === teamName) target[phase.phase].wins += 1;
    });
  }
}