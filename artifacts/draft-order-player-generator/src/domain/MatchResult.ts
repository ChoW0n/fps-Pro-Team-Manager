/**
 * 나중에 경기 중계 화면에서 쓸 데이터이며 지금은 화면을 만들지 않습니다.
 * 밴픽과 구간별 경기 결과를 보관합니다.
 */

import { Champion } from './Champion';
import { Team } from './Team';
import { Player } from './Player';

// 밴 또는 픽 한 차례의 기록 타입
export interface DraftRecord {
  action: 'BAN' | 'PICK';
  teamName: string;
  player?: Player;
  champion: Champion;
}

// 구간별 양 팀 전력 기록 타입
export interface PhaseResult {
  phase: 'EARLY' | 'MID' | 'LATE';
  homePower: number;
  awayPower: number;
  winnerName: string;
  adjustments: string[];
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
  ) {}
}