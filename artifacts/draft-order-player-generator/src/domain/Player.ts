/**
 * 선수 데이터 클래스
 * 각 선수의 포지션, 나이, 능력치 정보를 저장합니다.
 */

import type { Champion } from './Champion';

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
    volatility: number
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
  }
}
