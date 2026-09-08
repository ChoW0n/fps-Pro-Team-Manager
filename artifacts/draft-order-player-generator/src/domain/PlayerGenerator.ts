/**
 * 선수 생성기 클래스
 * 정규분포를 사용하여 선수의 능력치를 생성하고 총 50명의 선수를 만듭니다.
 */

import { Player, Position } from './Player';
import { PLAYER_STATS_BY_POSITION, StatDistribution } from './playerStats';
import { NicknameGenerator } from './NicknameGenerator';
import { clampToStatRange, generateNormalRandom } from './randomUtils';

export class PlayerGenerator {
  private nicknameGenerator: NicknameGenerator;

  /**
   * PlayerGenerator 인스턴스를 초기화합니다.
   */
  constructor() {
    this.nicknameGenerator = new NicknameGenerator();
  }

  /**
   * 주어진 능력치 분포 객체를 사용하여 실제 능력치 값을 생성합니다.
   */
  private generateStat(distribution: StatDistribution): number {
    const rawValue = generateNormalRandom(distribution.mean, distribution.stdDev);
    return Math.round(clampToStatRange(rawValue));
  }

  /**
   * e스포츠 선수에 적합한 합리적인 나이(16세 ~ 25세)를 무작위로 생성합니다.
   */
  private generateAge(): number {
    return Math.floor(Math.random() * 10) + 16;
  }

  /**
   * 지정된 포지션의 선수를 1명 생성하여 반환합니다.
   */
  private generatePlayerForPosition(position: Position): Player {
    const nickname = this.nicknameGenerator.generateUniqueNickname();
    const age = this.generateAge();
    const stats = PLAYER_STATS_BY_POSITION[position];

    return new Player(
      nickname,
      position,
      age,
      this.generateStat(stats.laning),
      this.generateStat(stats.teamfight),
      this.generateStat(stats.macro),
      this.generateStat(stats.championPool),
      this.generateStat(stats.volatility)
    );
  }

  /**
   * 각 포지션별 10명씩, 총 50명의 선수를 배열로 생성하여 반환합니다.
   */
  public generateFiftyPlayers(): Player[] {
    const positions: Position[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
    const players: Player[] = [];

    for (const position of positions) {
      for (let i = 0; i < 10; i++) {
        players.push(this.generatePlayerForPosition(position));
      }
    }

    return players;
  }
}
