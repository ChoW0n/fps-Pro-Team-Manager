/**
 * 선수 생성기 클래스
 * 정규분포를 사용하여 선수의 능력치를 생성하고 총 50명의 선수를 만듭니다.
 */

import { Player, Role } from './Player';
import { PLAYER_STATS_BY_ROLE, StatDistribution } from './playerStats';
import { NicknameGenerator } from './NicknameGenerator';
import { KoreanNameGenerator } from './KoreanNameGenerator';
import { clampToStatRange, generateNormalRandom } from './randomUtils';
import { Champion, CHAMPIONS } from './Champion';
import { Operator, OPERATORS } from './Operator';
import { assignSoloRankLadder, createSoloRankRecord } from './soloRank';

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
   * 기존 챔피언 폭 수치를 새 오퍼레이터 폭으로 바꿔 무작위 목록을 만듭니다.
   */
  private generateOperatorPool(poolStat: number, role: Role): Operator[] {
    const count = Math.max(2, Math.min(5, Math.round(poolStat / 20)));
    // 새로 생성하는 선수에게만 기본 공수 한 명씩을 부여합니다. 기존 저장 선수는 변경하지 않습니다.
    const basics: Record<Role, [string,string]> = {SEARCH:['ARBEL','HALLORAN'],ENTRY:['MAGPIE','MARCHAND'],FIREPOWER:['COLLIER','BRANDT'],DEFENSIVE_SETUP:['해동','REUSS'],BLOCKING:['AUBERT','성곽']};
    const pool = basics[role].map(name=>OPERATORS.find(operator=>operator.callSign===name)!);
    const candidates = OPERATORS.filter(operator=>!pool.includes(operator));
    while (pool.length < count) {
      const index = Math.floor(Math.random() * candidates.length);
      pool.push(candidates.splice(index, 1)[0]);
    }
    return pool;
  }

  /** 레거시 화면용 챔피언 폭을 별도로 만들어 반환합니다. */
  private generateLegacyChampionPool(poolStat: number): Champion[] {
    const count = Math.max(1, Math.min(5, Math.round(poolStat / 20)));
    const candidates = [...CHAMPIONS];
    return Array.from({ length: count }, () => candidates.splice(
      Math.floor(Math.random() * candidates.length), 1,
    )[0]);
  }

  /**
    * 지정된 역할의 선수를 1명 생성하여 반환합니다.
   */
  private generatePlayerForRole(role: Role): Player {
    const nickname = this.nicknameGenerator.generateUniqueNickname();
    const realName = this.koreanNameGenerator.generateUniqueName();
    const age = this.generateAge();
    const stats = PLAYER_STATS_BY_ROLE[role];
    const poolStat = this.generateStat(stats.operatorPool);

    const player = new Player(
      nickname,
      realName,
      role,
      age,
      this.generateStat(stats.aim),
      this.generateStat(stats.entry),
      this.generateStat(stats.informationGathering),
      this.generateStat(stats.defensiveSetup),
      this.generateStat(stats.clutch),
      this.generateOperatorPool(poolStat, role),
      this.generateStat(stats.volatility),
      this.generateStat(stats.mastery),
      this.generateStat(stats.aggression),
      this.generateStat(stats.composure),
      this.generateStat(stats.recovery),
      this.generateStat(stats.courage),
      this.generateStat(stats.teamSynergy),
      this.generateLegacyChampionPool(poolStat),
    );
    player.soloRank = createSoloRankRecord(player);
    return player;
  }

  /**
    * 각 역할별 10명씩, 총 50명의 선수를 배열로 생성하여 반환합니다.
   */
  public generateFiftyPlayers(): Player[] {
    const roles: Role[] = ['SEARCH', 'ENTRY', 'FIREPOWER', 'DEFENSIVE_SETUP', 'BLOCKING'];
    const players: Player[] = [];

    for (const role of roles) {
      for (let i = 0; i < 10; i++) {
        players.push(this.generatePlayerForRole(role));
      }
    }

    assignSoloRankLadder(players);
    return players;
  }
}
