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

/**
 * 밴픽 규칙을 실행하는 클래스입니다.
 */
export class BanPick {
  /**
   * 두 팀의 밴픽을 순서대로 실행합니다.
   */
  public run(homeTeam: Team, awayTeam: Team): BanPickResult {
    const unavailable = new Set<string>();
    const records: DraftRecord[] = [];
    const homePicks: Champion[] = [];
    const awayPicks: Champion[] = [];
    const allPlayers = [...homeTeam.players, ...awayTeam.players];

    this.banTwice(homeTeam, awayTeam, allPlayers, unavailable, records);
    this.banTwice(awayTeam, homeTeam, allPlayers, unavailable, records);
    this.pickAll(homeTeam, homePicks, allPlayers, unavailable, records);
    this.pickAll(awayTeam, awayPicks, allPlayers, unavailable, records);

    return new BanPickResult(records, homePicks, awayPicks);
  }

  /**
   * 상대 숙련 챔피언 가운데 선수 기량과 가장 잘 맞는 둘을 밴합니다.
   */
  private banTwice(
    banningTeam: Team,
    targetTeam: Team,
    allPlayers: Player[],
    unavailable: Set<string>,
    records: DraftRecord[],
  ): void {
    for (let count = 0; count < 2; count += 1) {
      const candidates = targetTeam.players.flatMap((player) =>
        player.championPool
          .filter((champion) => !unavailable.has(champion.name))
          .map((champion) => ({ player, champion })),
      ).filter(({ champion }) =>
        this.canAssignAllPlayers(allPlayers, new Set([...unavailable, champion.name])),
      );
      if (candidates.length === 0) {
        throw new Error(`${banningTeam.name}의 밴 이후 ${targetTeam.name} 선수에게 합법적 픽이 남지 않습니다.`);
      }
      candidates.sort((left, right) =>
        this.difficultyFit(right.player, right.champion) - this.difficultyFit(left.player, left.champion),
      );
      const selected = candidates[0].champion;
      unavailable.add(selected.name);
      records.push({ action: 'BAN', teamName: banningTeam.name, champion: selected });
    }
  }

  /**
   * 팀의 다섯 선수가 조합에 부족한 태그부터 채우도록 픽합니다.
   */
  private pickAll(
    team: Team,
    picks: Champion[],
    remainingPlayers: Player[],
    unavailable: Set<string>,
    records: DraftRecord[],
  ): void {
    for (const player of team.players) {
      const candidates = player.championPool
        .filter((champion) => !unavailable.has(champion.name))
        .filter((champion) => this.canAssignAllPlayers(
          remainingPlayers.filter((remainingPlayer) => remainingPlayer !== player),
          new Set([...unavailable, champion.name]),
        ));
      if (candidates.length === 0) {
        throw new Error(`${team.name}의 ${formatPlayerName(player)}에게 가능한 챔피언이 없습니다.`);
      }
      candidates.sort((left, right) => this.compositionNeed(picks, right) - this.compositionNeed(picks, left));
      const selected = candidates[0];
      unavailable.add(selected.name);
      picks.push(selected);
      records.push({ action: 'PICK', teamName: team.name, player, champion: selected });
      remainingPlayers.splice(remainingPlayers.indexOf(player), 1);
    }
  }

  /**
   * 남은 모든 선수가 서로 다른 챔피언을 하나씩 배정받을 수 있는지 확인합니다.
   * 단순 후보 수 검사만으로는 여러 선수가 같은 마지막 후보를 공유하는 한계가 있어 전체 배정 가능성을 검사합니다.
   */
  private canAssignAllPlayers(
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
}