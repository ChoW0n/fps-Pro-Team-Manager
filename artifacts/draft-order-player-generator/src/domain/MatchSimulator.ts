/**
 * 경기 판정 클래스
 * 선수별 경기 발휘치를 새로 뽑아 두 팀의 라인전·한타·운영 합계로 승자를 정합니다.
 */

import {
  MAX_VOLATILITY_STD_DEV,
  MIN_VOLATILITY_STD_DEV,
} from './playerStats';
import { Player } from './Player';
import { clampToStatRange, generateNormalRandom } from './randomUtils';
import { Team } from './Team';
import { BanPick, BanPickResult } from './BanPick';
import { Champion } from './Champion';
import { AdjustmentDetail, MatchResult, PhaseResult } from './MatchResult';
import {
  DIVE_VS_POKE_BONUS,
  LATE_AOE_BONUS,
  NO_TANK_PENALTY,
} from './compositionStats';
import {
  calculateDifficultyMultiplier,
  calculatePhaseTeamLevels,
  calculatePlayerLevelPowerMultiplier,
} from './levelGrowth';

export class MatchSimulator {
  /**
   * 기복 수치 0~100을 표준편차 경계값 사이로 선형 변환합니다.
   */
  public volatilityToStdDev(volatility: number): number {
    return MIN_VOLATILITY_STD_DEV
      + (MAX_VOLATILITY_STD_DEV - MIN_VOLATILITY_STD_DEV) * (volatility / 100);
  }

  /**
   * 한 선수의 라인전·한타·운영 경기 발휘치와 성장 배율을 계산합니다.
   */
  private calculatePlayerPerformance(player: Player, champion: Champion): number {
    const stdDev = this.volatilityToStdDev(player.volatility);
    const performance = [player.laning, player.teamfight, player.macro].reduce(
      (sum, mean) => sum + clampToStatRange(generateNormalRandom(mean, stdDev)),
      0,
    );
    return performance * calculateDifficultyMultiplier(player, champion);
  }

  /**
   * 팀 선수 다섯 명의 경기 발휘치 합계를 계산합니다.
   */
  private calculateTeamPerformance(team: Team, picks: Champion[], level: number): number {
    return team.players.reduce(
      (sum, player, index) => sum
        + this.calculatePlayerPerformance(player, picks[index])
          * calculatePlayerLevelPowerMultiplier(player, picks[index], level),
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
  ): { multiplier: number; reasons: string[]; details: AdjustmentDetail[] } {
    let multiplier = 1;
    const reasons: string[] = [];
    const details: AdjustmentDetail[] = [];
    // 시점 태그의 직접 보정은 제거하고 levelGrowth의 태그 기반 성장에 맡깁니다.
    if (phase === 'LATE') {
      const aoeCount = picks.filter((pick) => pick.range === 'AOE').length;
      if (aoeCount > 0) {
        const contribution = LATE_AOE_BONUS * aoeCount;
        multiplier += contribution;
        reasons.push(`광역 공격 ${aoeCount}명으로 후반 보정`);
        details.push({ reason: `광역 공격 ${aoeCount}명으로 후반 보정`, contribution });
      }
    }
    const ownDiveCount = picks.filter((pick) => pick.engagement === 'DIVE').length;
    const ownPokeCount = picks.filter((pick) => pick.engagement === 'POKE').length;
    const opponentDiveCount = opponentPicks.filter((pick) => pick.engagement === 'DIVE').length;
    const opponentPokeCount = opponentPicks.filter((pick) => pick.engagement === 'POKE').length;
    const divePokeAdvantage = ownDiveCount * opponentPokeCount
      - opponentDiveCount * ownPokeCount;
    if (divePokeAdvantage !== 0) {
      const contribution = DIVE_VS_POKE_BONUS * divePokeAdvantage;
      const reason = divePokeAdvantage > 0
          ? `돌진 조합이 상대 대치 조합에 우위`
          : `상대 돌진 조합이 대치 조합에 우위`;
      multiplier += contribution;
      reasons.push(reason);
      details.push({ reason, contribution });
    }
    if (!picks.some((pick) => pick.role === 'TANK')) {
      multiplier -= NO_TANK_PENALTY;
      reasons.push('탱커가 없어 전 구간 감점');
      details.push({ reason: '탱커가 없어 전 구간 감점', contribution: -NO_TANK_PENALTY });
    }
    return { multiplier, reasons, details };
  }

  /**
   * 밴픽과 세 구간 전력을 계산해 상세 경기 기록을 반환합니다.
   */
  public play(homeTeam: Team, awayTeam: Team): MatchResult {
    const draft = new BanPick().run(homeTeam, awayTeam);
    return this.playWithDraft(homeTeam, awayTeam, draft);
  }

  /**
   * 완료된 밴픽 결과를 그대로 사용해 경기 구간과 최종 승자를 계산합니다.
   */
  public playWithDraft(homeTeam: Team, awayTeam: Team, draft: BanPickResult): MatchResult {
    let homePreviousWins = 0;
    let awayPreviousWins = 0;
    const phases: PhaseResult[] = (['EARLY', 'MID', 'LATE'] as const).map((phase) => {
      const homeAdjustment = this.compositionMultiplier(draft.homePicks, draft.awayPicks, phase);
      const awayAdjustment = this.compositionMultiplier(draft.awayPicks, draft.homePicks, phase);
      const { homeLevel, awayLevel } = calculatePhaseTeamLevels(phase, homePreviousWins, awayPreviousWins);
      const homePower = this.calculateTeamPerformance(homeTeam, draft.homePicks, homeLevel) * homeAdjustment.multiplier;
      const awayPower = this.calculateTeamPerformance(awayTeam, draft.awayPicks, awayLevel) * awayAdjustment.multiplier;
      const winner = homePower === awayPower
        ? (Math.random() < 0.5 ? homeTeam : awayTeam)
        : (homePower > awayPower ? homeTeam : awayTeam);
      if (winner === homeTeam) homePreviousWins += 1;
      else awayPreviousWins += 1;
      return {
        phase,
        homePower,
        awayPower,
        homeLevel,
        awayLevel,
        winnerName: winner.name,
        adjustments: [
          `${homeTeam.name}: ${homeAdjustment.reasons.join(', ') || '적용 보정 없음'}`,
          `${awayTeam.name}: ${awayAdjustment.reasons.join(', ') || '적용 보정 없음'}`,
        ],
        homeAdjustmentDetails: homeAdjustment.details,
        awayAdjustmentDetails: awayAdjustment.details,
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