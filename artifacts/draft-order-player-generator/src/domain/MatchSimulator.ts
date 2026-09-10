/**
 * 경기 판정 클래스
 * 밴픽을 실제 오퍼레이터 감각·판단·이동·사격 엔진에 전달합니다.
 */

import {
  MAX_VOLATILITY_STD_DEV,
  MIN_VOLATILITY_STD_DEV,
} from './playerStats';
import { Team } from './Team';
import { BanPick, BanPickResult } from './BanPick';
import { MatchResult } from './MatchResult';
import { runRealtimeTacticalRound } from './realtime/tacticalRealtimeAdapter';

export class MatchSimulator {
  private simulationSequence = 0;
  /**
   * 기복 수치 0~100을 표준편차 경계값 사이로 선형 변환합니다.
   */
  public volatilityToStdDev(volatility: number): number {
    return MIN_VOLATILITY_STD_DEV
      + (MAX_VOLATILITY_STD_DEV - MIN_VOLATILITY_STD_DEV) * (volatility / 100);
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
    const tacticalRound = runRealtimeTacticalRound(
      homeTeam,
      awayTeam,
      draft,
      this.nextSimulationSeed(homeTeam, awayTeam, draft),
    );
    const winner = tacticalRound.realtime?.winner === '수비' ? awayTeam : homeTeam;
    return new MatchResult(
      homeTeam,
      awayTeam,
      draft.records,
      draft.homePicks,
      draft.awayPicks,
      tacticalRound.phaseSummaries ?? [],
      winner,
      tacticalRound,
    );
  }

  /** 시즌 내 경기마다 다른 결정론적 시드를 만들어 실제 AI 변동성을 유지합니다. */
  private nextSimulationSeed(homeTeam: Team, awayTeam: Team, draft: BanPickResult): number {
    this.simulationSequence += 1;
    const text = `${homeTeam.name}|${awayTeam.name}|${this.simulationSequence}|${draft.records.map((record) => record.champion.name).join('|')}`;
    return Array.from(text).reduce((hash, character) => (
      Math.imul(hash ^ character.charCodeAt(0), 16777619)
    ), 2166136261) >>> 0;
  }
}
