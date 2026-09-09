/**
 * 실시간 유닛 AI의 결과를 기존 경기·관전 계약으로 변환합니다.
 * 승패와 생존자 수는 이 어댑터에서 다시 계산하지 않고 런타임 결과를 요약합니다.
 */

import type { Champion } from '../Champion';
import type { Operator, OperatorSide } from '../Operator';
import { OPERATORS } from '../Operator';
import type {
  TacticalDecisionLog,
  TacticalEngagementRecord,
  TacticalRoundResult,
} from '../TacticalRoundSimulation';
import type { Player } from '../Player';
import type { BanPickResult } from '../BanPick';
import { Team } from '../Team';
import {
  runTacticalRealtimeSimulation,
  type RealtimeUnitInput,
  type TacticalRealtimeResult,
} from './TacticalRealtimeSimulation';

/** 선수와 밴픽을 실제 경기에서 사용할 오퍼레이터 입력으로 묶습니다. */
export function createRealtimeUnitInputs(
  team: Team,
  picks: Champion[],
  side: OperatorSide,
): RealtimeUnitInput[] {
  return team.players.map((player, index) => {
    const pick = picks[index];
    const preferred = player.operatorPool
      .filter((operator) => operator.side === side && operator.role === player.role)
      .sort((left, right) => operatorFit(right, player, pick) - operatorFit(left, player, pick))[0];
    const sameSide = player.operatorPool
      .filter((operator) => operator.side === side)
      .sort((left, right) => operatorFit(right, player, pick) - operatorFit(left, player, pick))[0];
    const roleFallback = OPERATORS
      .filter((operator) => operator.side === side && operator.role === player.role)
      .sort((left, right) => operatorFit(right, player, pick) - operatorFit(left, player, pick))[0];
    const operator = preferred ?? sameSide ?? roleFallback
      ?? OPERATORS.find((candidate) => candidate.side === side)!;
    return {
      player,
      operator,
      teamName: team.name,
      side,
      loadout: {
        pickName: pick?.name ?? '기본 전술 장비',
        strength: pick?.getStrength() ?? 50,
        positionFit: pick?.getPositionFit(player.position) ?? 50,
      },
    };
  });
}

/** 선수의 숙련도와 밴픽 적합도가 높은 오퍼레이터를 우선 선택합니다. */
function operatorFit(operator: Operator, player: Player, pick?: Champion): number {
  const roleFit = operator.role === player.role ? 24 : 0;
  const pickFit = pick ? pick.getPositionFit(player.position) / 10 : 0;
  return roleFit + operator.stats.aim + operator.stats.informationGathering
    + player.mastery * 0.4 + pickFit;
}

/** 실시간 라운드 결과를 기존 관전 화면이 읽는 결과로 요약합니다. */
export function createTacticalRoundResultFromRealtime(
  realtime: TacticalRealtimeResult,
  attackers: RealtimeUnitInput[],
  defenders: RealtimeUnitInput[],
): TacticalRoundResult {
  const units = [...attackers, ...defenders];
  const unitById = new Map(units.map((unit, index) => [
    `${unit.teamName}:${unit.player.nickname}:${unit.operator.callSign}:${index}`,
    unit,
  ]));
  const snapshotAt = (time: number) => realtime.snapshots.reduce(
    (closest, snapshot) => Math.abs(snapshot.time - time) < Math.abs(closest.time - time) ? snapshot : closest,
    realtime.snapshots[0] ?? { time: 0, units: [] },
  );
  const toRecord = (engagement: TacticalRealtimeResult['engagements'][number], index: number): TacticalEngagementRecord => {
    const snapshot = snapshotAt(engagement.firstShotAt);
    const attackerState = snapshot.units.find((unit) => unit.callSign === engagement.attackerCallSign && unit.side === '공격');
    const defenderState = snapshot.units.find((unit) => unit.callSign === engagement.defenderCallSign && unit.side === '수비');
    return {
      sequence: index + 1,
      attackerCallSign: engagement.attackerCallSign,
      defenderCallSign: engagement.defenderCallSign,
      winner: engagement.winner
        ?? (realtime.winner === '수비' ? '수비' : '공격'),
      attackersAlive: snapshot.units.filter((unit) => unit.side === '공격' && unit.alive).length
        + (attackerState?.alive ? 0 : 0),
      defendersAlive: snapshot.units.filter((unit) => unit.side === '수비' && unit.alive).length
        + (defenderState?.alive ? 0 : 0),
    };
  };
  const engagements = realtime.engagements.map(toRecord);
  const decisionLogs: TacticalDecisionLog[] = realtime.events
    .filter((event) => event.type === 'action' && event.actor)
    .slice(0, 80)
    .map((event, index) => {
      const source = unitById.get(event.actor!);
      const isAggressive = event.message.includes('fire') || (source?.player.aggression ?? 0) >= 70;
      return {
        sequence: index + 1,
        engagementSequence: engagements.findIndex((engagement) => engagement.attackerCallSign === source?.operator.callSign) + 1,
        type: isAggressive ? 'ENGAGEMENT_LEAD' : 'ISOLATION',
        callSign: source?.operator.callSign ?? event.actor!,
        statLabel: isAggressive ? '공격성' : '클러치',
        statValue: isAggressive ? source?.player.aggression ?? 0 : source?.player.clutch ?? 0,
        message: `${source?.operator.callSign ?? event.actor}가 ${event.message}`,
      };
    });
  const finalSnapshot = realtime.snapshots.at(-1);
  const informationAmount = Math.min(1, Math.max(0,
    (finalSnapshot?.units.reduce((sum, unit) => sum + unit.knowledge.confidence, 0) ?? 0)
      / Math.max(1, finalSnapshot?.units.length ?? 1),
  ));
  const phases = (['EARLY', 'MID', 'LATE'] as const).map((phase, index) => {
    const start = realtime.executionTime * (index / 3);
    const end = realtime.executionTime * ((index + 1) / 3);
    const phaseEvents = realtime.events.filter((event) => event.time >= start && event.time < end);
    const homeScore = scoreSide(phaseEvents, '공격', attackers, defenders);
    const awayScore = scoreSide(phaseEvents, '수비', defenders, attackers);
    const phaseWinner = homeScore === awayScore
      ? realtime.winner === '공격' ? attackers[0].teamName : defenders[0].teamName
      : homeScore > awayScore ? attackers[0].teamName : defenders[0].teamName;
    return {
      phase,
      homePower: homeScore,
      awayPower: awayScore,
      homeLevel: index + 1,
      awayLevel: index + 1,
      winnerName: phaseWinner,
      adjustments: ['실시간 감각·이동·사격 AI 결과로 산출'],
      homeAdjustmentDetails: [],
      awayAdjustmentDetails: [],
    };
  });
  const attackerSurvivors = realtime.survivors.filter((unit) => unit.side === '공격').length;
  const defenderSurvivors = realtime.survivors.filter((unit) => unit.side === '수비').length;
  return {
    attackersWon: realtime.winner === '공격',
    executionTime: realtime.executionTime,
    urgency: Math.max(0, (75 - realtime.executionTime) / 75),
    informationAmount,
    attackerSurvivors,
    defenderSurvivors,
    survivingScouts: attackers
      .filter((unit) => realtime.survivors.some((survivor) => survivor.callSign === unit.operator.callSign))
      .map((unit) => unit.operator),
    decisionLogs,
    engagements,
    phaseSummaries: phases,
    realtime,
  };
}

/** 실제 이벤트에서 양 팀의 전투 기여를 계산해 기존 구간 표시값을 채웁니다. */
function scoreSide(
  events: TacticalRealtimeResult['events'],
  side: OperatorSide,
  ownUnits: RealtimeUnitInput[],
  enemyUnits: RealtimeUnitInput[],
): number {
  const ownIds = new Set(ownUnits.map((unit) => `${unit.teamName}:${unit.player.nickname}:${unit.operator.callSign}`));
  const enemyIds = new Set(enemyUnits.map((unit) => `${unit.teamName}:${unit.player.nickname}:${unit.operator.callSign}`));
  let score = ownUnits.reduce((sum, unit) => sum + unit.operator.stats.aim * 0.3 + unit.player.mastery * 0.2, 0);
  events.forEach((event) => {
    const actor = event.actor?.split(':').slice(0, 3).join(':');
    const target = event.target?.split(':').slice(0, 3).join(':');
    if (actor && ownIds.has(actor)) score += event.type === 'impact' ? 18 : event.type === 'shot' ? 3 : 1;
    if (target && enemyIds.has(target) && event.type === 'death') score += 42;
  });
  return Math.round(score);
}

/** 밴픽 결과를 실제 공격·수비 오퍼레이터 입력과 권위 결과로 연결합니다. */
export function runRealtimeTacticalRound(
  homeTeam: Team,
  awayTeam: Team,
  draft: BanPickResult,
  seed = 1,
): TacticalRoundResult {
  const attackers = createRealtimeUnitInputs(homeTeam, draft.homePicks, '공격');
  const defenders = createRealtimeUnitInputs(awayTeam, draft.awayPicks, '수비');
  const realtime = runTacticalRealtimeSimulation({ attackers, defenders, seed });
  return createTacticalRoundResultFromRealtime(realtime, attackers, defenders);
}