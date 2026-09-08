/**
 * 밴픽 진행 클래스
 * 숙련도와 조합 태그를 기준으로 안전 검사를 거쳐 밴 4회와 픽 10회를 진행합니다.
 */

import { Champion } from './Champion';
import { DraftRecord } from './MatchResult';
import { Player } from './Player';
import { Team } from './Team';
import { formatPlayerName } from './playerDisplay';

/**
 * 밴픽 결과 데이터 클래스입니다.
 */
export class BanPickResult {
  /**
   * 밴픽 과정과 양 팀 최종 픽을 생성합니다.
   */
  constructor(
    public readonly records: DraftRecord[],
    public readonly homePicks: Champion[],
    public readonly awayPicks: Champion[],
  ) {}
}

/** 수동 밴픽의 현재 한 차례를 화면이 읽을 수 있게 나타냅니다. */
export interface DraftStep {
  action: 'BAN' | 'PICK';
  teamName: string;
  targetPlayer?: Player;
}

/**
 * 밴픽 규칙을 실행하는 클래스입니다.
 */
export class BanPick {
  /**
   * 두 팀의 밴픽을 순서대로 실행합니다.
   */
  public run(homeTeam: Team, awayTeam: Team): BanPickResult {
    const session = new DraftSession(homeTeam, awayTeam, this);
    while (!session.isComplete) session.advanceAi();
    return session.getResult();
  }

  /**
   * 상대 숙련 챔피언 가운데 선수 기량과 가장 잘 맞는 한 명을 AI 밴으로 고릅니다.
   */
  public selectAiBan(
    targetTeam: Team,
    allPlayers: Player[],
    unavailable: Set<string>,
  ): Champion {
    const candidates = targetTeam.players.flatMap((player) =>
      player.championPool
        .filter((champion) => !unavailable.has(champion.name))
        .map((champion) => ({ player, champion })),
    ).filter(({ champion }) =>
      this.canAssignAllPlayers(allPlayers, new Set([...unavailable, champion.name])),
    );
    if (candidates.length === 0) {
      throw new Error(`${targetTeam.name} 선수에게 합법적 픽이 남지 않습니다.`);
    }
    candidates.sort((left, right) =>
      this.difficultyFit(right.player, right.champion) - this.difficultyFit(left.player, left.champion),
    );
    return candidates[0].champion;
  }

  /**
   * 현재 선수가 조합에 부족한 태그부터 채우도록 AI 픽을 고릅니다.
   */
  public selectAiPick(
    player: Player,
    picks: Champion[],
    remainingPlayers: Player[],
    unavailable: Set<string>,
  ): Champion {
    const candidates = player.championPool
      .filter((champion) => !unavailable.has(champion.name))
      .filter((champion) => this.canAssignAllPlayers(
        remainingPlayers.filter((remainingPlayer) => remainingPlayer !== player),
        new Set([...unavailable, champion.name]),
      ));
    if (candidates.length === 0) {
      throw new Error(`${formatPlayerName(player)}에게 가능한 챔피언이 없습니다.`);
    }
    candidates.sort((left, right) =>
      this.pickPriority(player, picks, right) - this.pickPriority(player, picks, left),
    );
    return candidates[0];
  }

  /**
   * 남은 모든 선수가 서로 다른 챔피언을 하나씩 배정받을 수 있는지 확인합니다.
   * 단순 후보 수 검사만으로는 여러 선수가 같은 마지막 후보를 공유하는 한계가 있어 전체 배정 가능성을 검사합니다.
   */
  public canAssignAllPlayers(
    players: Player[],
    unavailable: Set<string>,
  ): boolean {
    if (players.length === 0) return true;

    const orderedPlayers = [...players].sort(
      (left, right) =>
        left.championPool.filter((champion) => !unavailable.has(champion.name)).length
        - right.championPool.filter((champion) => !unavailable.has(champion.name)).length,
    );
    const [player, ...remainingPlayers] = orderedPlayers;

    return player.championPool
      .filter((champion) => !unavailable.has(champion.name))
      .some((champion) => this.canAssignAllPlayers(
        remainingPlayers,
        new Set([...unavailable, champion.name]),
      ));
  }

  /**
   * 선수 평균 능력과 챔피언 난이도가 가까울수록 높은 적합도를 반환합니다.
   */
  private difficultyFit(player: Player, champion: Champion): number {
    const grade = (player.laning + player.teamfight + player.macro) / 60;
    return 5 - Math.abs(grade - champion.difficulty);
  }

  /**
   * 현재 조합에 없는 전투 역할과 태그에 높은 우선순위를 줍니다.
   */
  private compositionNeed(picks: Champion[], champion: Champion): number {
    if (picks.length === 0) return 1;
    let score = 0;
    if (!picks.some((pick) => pick.role === champion.role)) score += 4;
    if (!picks.some((pick) => pick.timing === champion.timing)) score += 2;
    if (!picks.some((pick) => pick.engagement === champion.engagement)) score += 2;
    if (!picks.some((pick) => pick.range === champion.range)) score += 1;
    return score;
  }

  private pickPriority(player: Player, picks: Champion[], champion: Champion): number {
    const fit = champion.getPositionFit(player.position);
    const lowFitPenalty = fit < 55 ? (55 - fit) * 0.35 : 0;
    return this.compositionNeed(picks, champion) * 10
      + this.difficultyFit(player, champion) * 3
      + fit * 0.45
      + champion.getStrength() * 12
      - lowFitPenalty;
  }
}

/**
 * 사람이 홈 팀을 한 차례씩 진행하고 상대 팀은 기존 AI 선택을 적용하는 밴픽 세션입니다.
 */
export class DraftSession {
  public readonly records: DraftRecord[] = [];
  public readonly homePicks: Champion[] = [];
  public readonly awayPicks: Champion[] = [];
  public readonly unavailable = new Set<string>();
  public stepIndex = 0;
  private readonly steps: DraftStep[];
  private readonly remainingPlayers: Player[];

  /** 두 팀과 기존 밴픽 규칙을 연결해 14차례의 고정 순서를 만듭니다. */
  constructor(
    private readonly homeTeam: Team,
    private readonly awayTeam: Team,
    private readonly rules = new BanPick(),
  ) {
    this.steps = [
      ...Array.from({ length: 2 }, () => ({ action: 'BAN' as const, teamName: homeTeam.name })),
      ...Array.from({ length: 2 }, () => ({ action: 'BAN' as const, teamName: awayTeam.name })),
      ...homeTeam.players.map((targetPlayer) => ({ action: 'PICK' as const, teamName: homeTeam.name, targetPlayer })),
      ...awayTeam.players.map((targetPlayer) => ({ action: 'PICK' as const, teamName: awayTeam.name, targetPlayer })),
    ];
    this.remainingPlayers = [...homeTeam.players, ...awayTeam.players];
  }

  /** 현재 차례의 행동, 팀, 픽 대상 선수를 반환합니다. */
  public get currentStep(): DraftStep | undefined {
    return this.steps[this.stepIndex];
  }

  /** 모든 밴픽 차례가 끝났는지 반환합니다. */
  public get isComplete(): boolean {
    return this.stepIndex === this.steps.length;
  }

  /** 현재 챔피언을 홈 팀 사람이 제출할 수 없는 이유를 한국어로 반환합니다. */
  public getChampionDisabledReason(champion: Champion): string | undefined {
    const step = this.currentStep;
    if (!step) return '밴픽이 이미 완료되었습니다.';
    if (step.teamName !== this.homeTeam.name) return '현재는 상대 팀 AI의 차례입니다.';
    if (this.unavailable.has(champion.name)) return '이미 금지되었거나 선택된 챔피언입니다.';
    if (step.action === 'BAN') {
      if (!this.awayTeam.players.some((player) => player.championPool.includes(champion))) {
        return '상대 선수의 챔피언 폭에 없는 챔피언은 금지할 수 없습니다.';
      }
      if (!this.rules.canAssignAllPlayers(this.remainingPlayers, new Set([...this.unavailable, champion.name]))) {
        return '선택하면 남은 선수에게 합법적 픽을 배정할 수 없습니다.';
      }
      return undefined;
    }
    if (!step.targetPlayer?.championPool.includes(champion)) return '현재 선수의 챔피언 폭에 없는 챔피언입니다.';
    if (!this.rules.canAssignAllPlayers(
      this.remainingPlayers.filter((player) => player !== step.targetPlayer),
      new Set([...this.unavailable, champion.name]),
    )) return '선택하면 남은 선수에게 합법적 픽을 배정할 수 없습니다.';
    return undefined;
  }

  /** 수동 홈 차례를 검증한 뒤 기록하고 다음 차례로 진행합니다. */
  public advanceManual(champion: Champion): void {
    const reason = this.getChampionDisabledReason(champion);
    if (reason) throw new Error(reason);
    this.commit(champion);
  }

  /** 현재 차례에 기존 AI 우선순위를 적용해 다음 차례로 진행합니다. */
  public advanceAi(): void {
    const step = this.currentStep;
    if (!step) throw new Error('밴픽이 이미 완료되었습니다.');
    const champion = step.action === 'BAN'
      ? this.rules.selectAiBan(step.teamName === this.homeTeam.name ? this.awayTeam : this.homeTeam, this.remainingPlayers, this.unavailable)
      : this.rules.selectAiPick(step.targetPlayer!, step.teamName === this.homeTeam.name ? this.homePicks : this.awayPicks, this.remainingPlayers, this.unavailable);
    this.commit(champion);
  }

  /** 완료된 세션을 기존 경기 계산기에 전달할 밴픽 결과로 반환합니다. */
  public getResult(): BanPickResult {
    if (!this.isComplete) throw new Error('밴픽이 아직 완료되지 않았습니다.');
    return new BanPickResult(this.records, this.homePicks, this.awayPicks);
  }

  /** 검증 또는 AI가 고른 챔피언을 현재 차례의 공통 기록으로 반영합니다. */
  private commit(champion: Champion): void {
    const step = this.currentStep!;
    this.unavailable.add(champion.name);
    if (step.action === 'BAN') {
      this.records.push({ action: 'BAN', teamName: step.teamName, champion });
    } else {
      const picks = step.teamName === this.homeTeam.name ? this.homePicks : this.awayPicks;
      picks.push(champion);
      this.records.push({ action: 'PICK', teamName: step.teamName, player: step.targetPlayer, champion });
      this.remainingPlayers.splice(this.remainingPlayers.indexOf(step.targetPlayer!), 1);
    }
    this.stepIndex += 1;
  }
}