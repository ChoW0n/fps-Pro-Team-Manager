/**
 * 팀 데이터 클래스
 * 팀 이름과 다섯 포지션의 선수 명단을 저장합니다.
 */

import { Player, Position } from './Player';

export class Team {
  public wins = 0;
  public losses = 0;

  /**
   * 팀 이름과 선수 다섯 명으로 팀을 생성합니다.
   */
  constructor(
    public readonly name: string,
    public readonly players: Player[],
  ) {
    const positions = new Set<Position>(players.map((player) => player.position));
    if (players.length !== 5 || positions.size !== 5) {
      throw new Error('팀은 포지션별 선수 한 명씩 총 다섯 명이어야 합니다.');
    }
  }

  /**
   * 시즌 승패 기록을 초기화합니다.
   */
  public resetRecord(): void {
    this.wins = 0;
    this.losses = 0;
  }

  /**
   * 현재 승률을 반환합니다.
   */
  public getWinRate(): number {
    const games = this.wins + this.losses;
    return games === 0 ? 0 : this.wins / games;
  }
}