/**
 * 나중에 경기 중계 화면에서 쓸 데이터이며 지금은 화면을 만들지 않습니다.
 * 밴픽과 구간별 경기 결과를 보관합니다.
 */

import { Champion } from './Champion';
import { Team } from './Team';
import { Player } from './Player';
import type { TacticalRoundResult } from './TacticalRoundSimulation';

// 밴 또는 픽 한 차례의 기록 타입
export interface DraftRecord {
  action: 'BAN' | 'PICK';
  teamName: string;
  player?: Player;
  champion: Champion;
}

/** 조합 보정 한 항목의 기존 계산 기여값입니다. */
export interface AdjustmentDetail {
  reason: string;
  contribution: number;
}

// 구간별 양 팀 전력 기록 타입
export interface PhaseResult {
  phase: 'EARLY' | 'MID' | 'LATE';
  homePower: number;
  awayPower: number;
  homeLevel: number;
  awayLevel: number;
  winnerName: string;
  adjustments: string[];
  homeAdjustmentDetails: AdjustmentDetail[];
  awayAdjustmentDetails: AdjustmentDetail[];
}

/**
 * 이미 계산된 보정 중 절대 기여값이 가장 큰 항목을 한 문장으로 요약합니다.
 * 같은 값이면 입력 순서를 유지해 먼저 계산된 항목을 선택합니다.
 */
export function getPhaseAdjustmentSummary(phase: PhaseResult): string {
  const details = [...phase.homeAdjustmentDetails, ...phase.awayAdjustmentDetails];
  if (details.length === 0) return '적용된 주요 조합 보정 없음';
  const primary = details.reduce((selected, detail) =>
    Math.abs(detail.contribution) > Math.abs(selected.contribution) ? detail : selected,
  );
  return `${primary.reason} (${primary.contribution >= 0 ? '+' : ''}${primary.contribution})`;
}

/**
 * 경기 전체 기록 데이터 클래스입니다.
 */
export class MatchResult {
  /**
   * 밴픽, 구간 전력, 승자를 묶어 생성합니다.
   */
  constructor(
    public readonly homeTeam: Team,
    public readonly awayTeam: Team,
    public readonly draftRecords: DraftRecord[],
    public readonly homePicks: Champion[],
    public readonly awayPicks: Champion[],
    public readonly phases: PhaseResult[],
    public readonly winner: Team,
    /** 실제 전술 AI가 만든 라운드 결과입니다. */
    public readonly tacticalRound?: TacticalRoundResult,
  ) {}
}