/**
 * 경기 판정 클래스
 * 선수별 경기 발휘치를 새로 뽑아 두 팀의 라인전·한타·운영 합계로 승자를 정합니다.
 */

import {
  DIFFICULTY_PENALTY_COEFFICIENT,
  MAX_VOLATILITY_STD_DEV,
  MIN_VOLATILITY_STD_DEV,
} from './playerStats';
import { Player } from './Player';
import { clampToStatRange, generateNormalRandom } from './randomUtils';
import { Team } from './Team';
import { BanPick } from './BanPick';
import { Champion } from './Champion';
import { MatchResult, PhaseResult } from './MatchResult';
import {
  DIVE_VS_POKE_BONUS,
  EARLY_TIMING_BONUS,
  LATE_AOE_BONUS,
  LATE_TIMING_BONUS,
  NO_TANK_PENALTY,
} from './compositionStats';

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
  private calculatePlayerPerformance(player: Player, champion: Champion): number {
    const stdDev = this.volatilityToStdDev(player.volatility);
    const performance = [player.laning, player.teamfight, player.macro].reduce(
      (sum, mean) => sum + clampToStatRange(generateNormalRandom(mean, stdDev)),
      0,
    );
    const playerGrade = (player.laning + player.teamfight + player.macro) / 60;
    const difficultyGap = Math.max(0, champion.difficulty - playerGrade);
    return performance * (1 - difficultyGap * DIFFICULTY_PENALTY_COEFFICIENT);
  }

  /**
   * 팀 선수 다섯 명의 경기 발휘치 합계를 계산합니다.
   */
  private calculateTeamPerformance(team: Team, picks: Champion[]): number {
    return team.players.reduce(
      (sum, player, index) => sum + this.calculatePlayerPerformance(player, picks[index]),
      0,
    );
  }

  /**
   * 한 구간의 조합 보정 배율과 사람이 읽을 수 있는 이유를 계산합니다.
   */
  private compositionMultiplier(
    picks: Champion[],
    opponentPicks: Champion[],
    phase: PhaseResult['phase'],
  ): { multiplier: number; reasons: string[] } {
    let multiplier = 1;
    const reasons: string[] = [];
    const earlyCount = picks.filter((pick) => pick.timing === 'EARLY').length;
    const lateCount = picks.filter((pick) => pick.timing === 'LATE').length;
    if (phase === 'EARLY' && earlyCount > lateCount) {
      multiplier += EARLY_TIMING_BONUS * (earlyCount - lateCount);
      reasons.push(`초반형 ${earlyCount}명으로 초반 보정`);
    }
    if (phase === 'EARLY' && lateCount > earlyCount) {
      multiplier -= EARLY_TIMING_BONUS * (lateCount - earlyCount);
      reasons.push(`후반형 ${lateCount}명으로 초반 감점`);
    }
    if (phase === 'LATE' && lateCount > earlyCount) {
      multiplier += LATE_TIMING_BONUS * (lateCount - earlyCount);
      reasons.push(`후반형 ${lateCount}명으로 후반 보정`);
    }
    if (phase === 'LATE' && earlyCount > lateCount) {
      multiplier -= LATE_TIMING_BONUS * (earlyCount - lateCount);
      reasons.push(`초반형 ${earlyCount}명으로 후반 감점`);
    }
    if (phase === 'LATE') {
      const aoeCount = picks.filter((pick) => pick.range === 'AOE').length;
      if (aoeCount > 0) {
        multiplier += LATE_AOE_BONUS * aoeCount;
        reasons.push(`광역 공격 ${aoeCount}명으로 후반 보정`);
      }
    }
    const ownDiveCount = picks.filter((pick) => pick.engagement === 'DIVE').length;
    const ownPokeCount = picks.filter((pick) => pick.engagement === 'POKE').length;
    const opponentDiveCount = opponentPicks.filter((pick) => pick.engagement === 'DIVE').length;
    const opponentPokeCount = opponentPicks.filter((pick) => pick.engagement === 'POKE').length;
    const divePokeAdvantage = ownDiveCount * opponentPokeCount
      - opponentDiveCount * ownPokeCount;
    if (divePokeAdvantage !== 0) {
      multiplier += DIVE_VS_POKE_BONUS * divePokeAdvantage;
      reasons.push(
        divePokeAdvantage > 0
          ? `돌진 조합이 상대 대치 조합에 우위`
          : `상대 돌진 조합이 대치 조합에 우위`,
      );
    }
    if (!picks.some((pick) => pick.role === 'TANK')) {
      multiplier -= NO_TANK_PENALTY;
      reasons.push('탱커가 없어 전 구간 감점');
    }
    return { multiplier, reasons };
  }

  /**
   * 밴픽과 세 구간 전력을 계산해 상세 경기 기록을 반환합니다.
   */
  public play(homeTeam: Team, awayTeam: Team): MatchResult {
    const draft = new BanPick().run(homeTeam, awayTeam);
    const phases: PhaseResult[] = (['EARLY', 'MID', 'LATE'] as const).map((phase) => {
      const homeAdjustment = this.compositionMultiplier(draft.homePicks, draft.awayPicks, phase);
      const awayAdjustment = this.compositionMultiplier(draft.awayPicks, draft.homePicks, phase);
      const homePower = this.calculateTeamPerformance(homeTeam, draft.homePicks) * homeAdjustment.multiplier;
      const awayPower = this.calculateTeamPerformance(awayTeam, draft.awayPicks) * awayAdjustment.multiplier;
      const winner = homePower === awayPower
        ? (Math.random() < 0.5 ? homeTeam : awayTeam)
        : (homePower > awayPower ? homeTeam : awayTeam);
      return {
        phase,
        homePower,
        awayPower,
        winnerName: winner.name,
        adjustments: [
          `${homeTeam.name}: ${homeAdjustment.reasons.join(', ') || '적용 보정 없음'}`,
          `${awayTeam.name}: ${awayAdjustment.reasons.join(', ') || '적용 보정 없음'}`,
        ],
      };
    });
    const homeWins = phases.filter((phase) => phase.winnerName === homeTeam.name).length;
    const awayWins = phases.length - homeWins;
    const winner = homeWins === awayWins
      ? (Math.random() < 0.5 ? homeTeam : awayTeam)
      : (homeWins > awayWins ? homeTeam : awayTeam);
    return new MatchResult(homeTeam, awayTeam, draft.records, draft.homePicks, draft.awayPicks, phases, winner);
  }
}