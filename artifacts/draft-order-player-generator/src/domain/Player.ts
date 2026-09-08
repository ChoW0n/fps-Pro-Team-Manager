/**
 * 선수 데이터 클래스
 * 각 선수의 포지션, 나이, 능력치 정보를 저장합니다.
 */

import type { Champion } from './Champion';
import type { SoloRankRecord } from './soloRank';

// 포지션 타입 정의
export type Position = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export class Player {
  public nickname: string;
  public realName: string;
  public position: Position;
  public age: number;
  public laning: number;
  public teamfight: number;
  public macro: number;
  public championPool: Champion[];
  public volatility: number;
  public mastery: number;
  // 공격성은 잘하고 못하고가 아닌 선수의 성격이며, 전력 계산에는 사용하지 않습니다.
  public aggression: number;
  // 아래 네 값은 좋고 나쁨이 아닌 숨은 특성이며 화면에 원시 숫자를 공개하지 않습니다.
  public composure: number;
  public recovery: number;
  public courage: number;
  public teamSynergy: number;
  // 경기 준비 화면에서 읽는 공개 솔로랭크 기록입니다. 대회 판정에는 직접 사용하지 않습니다.
  public soloRank?: SoloRankRecord;

  /**
   * Player 인스턴스를 생성합니다.
   * 모든 값은 생성자를 통해 주입받습니다.
   */
  constructor(
    nickname: string,
    realName: string,
    position: Position,
    age: number,
    laning: number,
    teamfight: number,
    macro: number,
    championPool: Champion[],
    volatility: number,
    mastery: number,
    aggression: number,
    composure: number,
    recovery: number,
    courage: number,
    teamSynergy: number,
  ) {
    this.nickname = nickname;
    this.realName = realName;
    this.position = position;
    this.age = age;
    this.laning = laning;
    this.teamfight = teamfight;
    this.macro = macro;
    this.championPool = championPool;
    this.volatility = volatility;
    this.mastery = mastery;
    this.aggression = aggression;
    this.composure = composure;
    this.recovery = recovery;
    this.courage = courage;
    this.teamSynergy = teamSynergy;
  }
}
