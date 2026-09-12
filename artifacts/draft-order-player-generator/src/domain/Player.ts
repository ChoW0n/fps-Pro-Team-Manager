/**
 * 전술 FPS 선수 데이터 클래스입니다.
 * position과 MOBA 능력치 getter는 기존 화면·시뮬레이터의 임시 호환 경로입니다.
 */

import type { PlayerTrait } from './playerTraits';
import type { CombatSkills } from './combatSkills';
import type { Champion } from './Champion';
import type { Operator } from './Operator';
import type { SoloRankRecord } from './soloRank';

// 새 종목의 다섯 역할을 정의합니다.
export type Role = 'SEARCH' | 'ENTRY' | 'FIREPOWER' | 'DEFENSIVE_SETUP' | 'BLOCKING';

// 기존 MOBA 모듈이 아직 사용하는 타입을 보존합니다.
export type Position = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export class Player {
  public nickname: string;
  public behaviorTrait?: PlayerTrait;
  public combatSkills?: Partial<CombatSkills>;
  public realName: string;
  public readonly role: Role;
  public age: number;
  public readonly aim: number;
  public readonly entry: number;
  public readonly informationGathering: number;
  public readonly defensiveSetup: number;
  public readonly clutch: number;
  public readonly operatorPool: Operator[];
  private legacyChampionPool: Champion[];
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
   * 전술 FPS 선수 인스턴스를 생성합니다.
   */
  constructor(
    nickname: string,
    realName: string,
    role: Role,
    age: number,
    aim: number,
    entry: number,
    informationGathering: number,
    defensiveSetup: number,
    clutch: number,
    operatorPool: Operator[],
    volatility: number,
    mastery: number,
    aggression: number,
    composure: number,
    recovery: number,
    courage: number,
    teamSynergy: number,
    legacyChampionPool: Champion[] = [],
  ) {
    this.nickname = nickname;
    this.realName = realName;
    this.role = role;
    this.age = age;
    this.aim = aim;
    this.entry = entry;
    this.informationGathering = informationGathering;
    this.defensiveSetup = defensiveSetup;
    this.clutch = clutch;
    this.operatorPool = operatorPool;
    this.volatility = volatility;
    this.mastery = mastery;
    this.aggression = aggression;
    this.composure = composure;
    this.recovery = recovery;
    this.courage = courage;
    this.teamSynergy = teamSynergy;
    this.legacyChampionPool = legacyChampionPool;
  }

  /** 기존 화면과 MOBA 도메인이 읽는 포지션 호환값을 반환합니다. */
  public get position(): Position {
    const positionByRole: Record<Role, Position> = {
      SEARCH: 'JUNGLE',
      ENTRY: 'TOP',
      FIREPOWER: 'ADC',
      DEFENSIVE_SETUP: 'SUPPORT',
      BLOCKING: 'MID',
    };
    return positionByRole[this.role];
  }

  /** 기존 라인전 참조를 조준값으로 읽습니다. */
  public get laning(): number { return this.aim; }
  /** 기존 파밍 참조를 진입값으로 읽습니다. */
  public get farming(): number { return this.entry; }
  /** 기존 시야 참조를 정보수집값으로 읽습니다. */
  public get vision(): number { return this.informationGathering; }
  /** 기존 한타 참조를 클러치값으로 읽습니다. */
  public get teamfight(): number { return this.clutch; }
  /** 기존 운영 참조를 수비설계값으로 읽습니다. */
  public get macro(): number { return this.defensiveSetup; }

  /** 아직 남은 MOBA 화면이 읽을 챔피언 폭을 반환합니다. */
  public get championPool(): Champion[] { return this.legacyChampionPool; }
  /** 기존 솔로랭크 기록이 챔피언 폭을 갱신할 수 있게 합니다. */
  public set championPool(value: Champion[]) { this.legacyChampionPool = value; }
}
