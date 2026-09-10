/**
 * 팀 생성기 클래스
 * 기존 선수 생성기로 만든 50명을 포지션별로 나누어 10개 팀을 구성합니다.
 */

import { PlayerGenerator } from './PlayerGenerator';
import { Position } from './Player';
import { Team } from './Team';
import { TeamNameGenerator } from './TeamNameGenerator';

export class TeamGenerator {
  /**
   * 선수 생성기와 팀 이름 생성기를 준비합니다.
   */
  constructor(
    private readonly playerGenerator = new PlayerGenerator(),
    private readonly teamNameGenerator = new TeamNameGenerator(),
  ) {}

  /**
   * 각 포지션 한 명씩 보유한 팀 10개를 생성합니다.
   */
  public generateTenTeams(): Team[] {
    const players = this.playerGenerator.generateFiftyPlayers();
    const positions: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
    const playersByPosition = new Map(
      positions.map((position) => [
        position,
        players.filter((player) => player.position === position),
      ]),
    );

    return Array.from({ length: 10 }, (_, teamIndex) => {
      const roster = positions.map((position) => playersByPosition.get(position)![teamIndex]);
      return new Team(this.teamNameGenerator.generateUniqueName(), roster);
    });
  }
}