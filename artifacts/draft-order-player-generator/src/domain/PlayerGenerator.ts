/**
 * 선수 생성기 클래스
 * 정규분포를 사용하여 선수의 능력치를 생성하고 총 50명의 선수를 만듭니다.
 */

import { Player, Position } from './Player';
import { PLAYER_STATS_BY_POSITION, StatDistribution } from './playerStats';
import { NicknameGenerator } from './NicknameGenerator';
import { KoreanNameGenerator } from './KoreanNameGenerator';
import { clampToStatRange, generateNormalRandom } from './randomUtils';
import { Champion, getChampionsByPosition } from './Champion';
import { createSoloRankRecord } from './soloRank';

export class PlayerGenerator {
  private nicknameGenerator: NicknameGenerator;
  private koreanNameGenerator: KoreanNameGenerator;

  /**
   * PlayerGenerator 인스턴스를 초기화합니다.
   */
  constructor() {
    this.nicknameGenerator = new NicknameGenerator();
    this.koreanNameGenerator = new KoreanNameGenerator();
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
   * 기존 챔피언 폭 수치를 숙련 챔피언 수로 변환해 무작위 목록을 만듭니다.
   */
  private generateChampionPool(position: Position, poolStat: number): Champion[] {
    const count = Math.max(1, Math.min(5, Math.round(poolStat / 20)));
    const candidates = [...getChampionsByPosition(position)];
    const pool: Champion[] = [];
    while (pool.length < count) {
      const index = Math.floor(Math.random() * candidates.length);
      pool.push(candidates.splice(index, 1)[0]);
    }
    return pool;
  }

  /**
   * 지정된 포지션의 선수를 1명 생성하여 반환합니다.
   */
  private generatePlayerForPosition(position: Position): Player {
    const nickname = this.nicknameGenerator.generateUniqueNickname();
    const realName = this.koreanNameGenerator.generateUniqueName();
    const age = this.generateAge();
    const stats = PLAYER_STATS_BY_POSITION[position];

    const player = new Player(
      nickname,
      realName,
      position,
      age,
      this.generateStat(stats.laning),
      this.generateStat(stats.teamfight),
      this.generateStat(stats.macro),
      this.generateChampionPool(position, this.generateStat(stats.championPool)),
      this.generateStat(stats.volatility),
      this.generateStat(stats.mastery),
      this.generateStat(stats.aggression),
      this.generateStat(stats.composure),
      this.generateStat(stats.recovery),
      this.generateStat(stats.courage),
      this.generateStat(stats.teamSynergy),
    );
    player.soloRank = createSoloRankRecord(player);
    return player;
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
