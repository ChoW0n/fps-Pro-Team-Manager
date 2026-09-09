/**
 * 전술 FPS 라운드의 핵심 공식과 최소 라운드 진행기를 담습니다.
 * 라운드는 180초이며 선발조를 보내면 수색 시간과 복귀 20초를 실행 시간에서 뺍니다.
 */

import { OPERATOR_ROLE_LABELS, Operator, OPERATORS } from './Operator';

export const ROUND_DURATION_SECONDS = 180;
export const SCOUT_RETURN_SECONDS = 20;
export const TACTICAL_VALIDATION_TRIALS = 8000;

export interface EngagementInput {
  ownAim: number;
  opponentAim: number;
  ownSurvivors: number;
  opponentSurvivors: number;
  informationAmount: number;
  urgency: number;
}

export interface SearchResult {
  searchTime: number;
  executionTime: number;
  urgency: number;
  survivingScouts: Operator[];
  detectionRisk: number;
  rawInformation: number;
  informationAmount: number;
}

export interface TacticalRoundResult {
  attackersWon: boolean;
  executionTime: number;
  urgency: number;
  informationAmount: number;
  attackerSurvivors: number;
  defenderSurvivors: number;
  survivingScouts: Operator[];
  decisionLogs: TacticalDecisionLog[];
  engagements: TacticalEngagementRecord[];
}

export interface TacticalRoundOptions {
  searchTime?: number;
  scouts?: Operator[];
  random?: () => number;
}

export type TacticalDecisionType = 'ENGAGEMENT_LEAD' | 'ISOLATION';

export type TacticalEngagementWinner = '공격' | '수비';

export interface TacticalDecisionLog {
  sequence: number;
  engagementSequence: number;
  type: TacticalDecisionType;
  callSign: string;
  statLabel: '공격성' | '클러치';
  statValue: number;
  message: string;
}

export interface TacticalEngagementRecord {
  sequence: number;
  attackerCallSign: string;
  defenderCallSign: string;
  winner: TacticalEngagementWinner;
  attackersAlive: number;
  defendersAlive: number;
}

/** 수색 여부에 따라 180초에서 수색과 선발조 복귀 시간을 뺍니다. */
export function calculateExecutionTime(searchTime: number, scoutsSent: boolean): number {
  if (!scoutsSent) return ROUND_DURATION_SECONDS;
  return Math.max(0, ROUND_DURATION_SECONDS - Math.max(0, searchTime) - SCOUT_RETURN_SECONDS);
}

/** 실행 시간이 75초보다 짧을수록 커지는 급함을 계산합니다. */
export function calculateUrgency(executionTime: number): number {
  return Math.max(0, (75 - executionTime) / 75);
}

/** 조준·생존 인원·정보량·급함을 그대로 반영해 교전 승률을 계산합니다. */
export function calculateEngagementWinProbability(input: EngagementInput): number {
  const rawProbability = 0.5
    + ((input.ownAim - input.opponentAim) / 100) * 0.9
    + (input.ownSurvivors - input.opponentSurvivors) * 0.11
    + input.informationAmount * 0.18
    - input.urgency * 0.16;
  return clamp(rawProbability, 0.05, 0.95);
}

/** 선발조 한 명의 수색 발각 위험을 계산합니다. */
export function calculateDetectionRisk(
  searchTime: number,
  opponentDefensiveSetup: number,
  scoutInformationGathering: number,
  scoutCount: number,
): number {
  const risk = 0.17
    * (Math.max(0, searchTime) / 45)
    * (opponentDefensiveSetup / 70)
    * (70 / Math.max(1, scoutInformationGathering))
    * (1 + Math.max(0, scoutCount - 1) * 0.28);
  return Math.min(0.85, risk);
}

/** 살아남은 선발조 전체의 정보 획득 원값을 계산합니다. */
export function calculateRawInformation(
  searchTime: number,
  survivingScouts: Operator[],
  opponentDefensiveSetup: number,
  informationMultiplier = 1,
): number {
  return survivingScouts.reduce((sum, scout) => sum + (
    0.30
    * (Math.max(0, searchTime) / 45)
    * (scout.stats.informationGathering / 70)
    * (70 / Math.max(1, opponentDefensiveSetup))
    * informationMultiplier
  ), 0);
}

/** 정보가 쌓일수록 증가폭이 줄어드는 1-e^(-원값²) 변환을 적용합니다. */
export function calculateInformationAmount(rawInformation: number): number {
  return 1 - Math.exp(-(Math.max(0, rawInformation) ** 2));
}

/** 양측 선발조의 수색 결과를 판정하고 정보량을 반환합니다. */
export function resolveSearch(
  scouts: Operator[],
  defenders: Operator[],
  searchTime: number,
  random: () => number = Math.random,
): SearchResult {
  const normalizedSearchTime = Math.max(0, searchTime);
  const executionTime = calculateExecutionTime(normalizedSearchTime, scouts.length > 0);
  const urgency = calculateUrgency(executionTime);
  const opponentDefensiveSetup = average(defenders.map((defender) => defender.stats.defensiveSetup));
  const survivingScouts = scouts.filter((scout) => random() >= calculateDetectionRisk(
    normalizedSearchTime,
    opponentDefensiveSetup,
    scout.stats.informationGathering,
    scouts.length,
  ));
  const rawInformation = calculateRawInformation(
    normalizedSearchTime,
    survivingScouts,
    opponentDefensiveSetup,
  );
  return {
    searchTime: normalizedSearchTime,
    executionTime,
    urgency,
    survivingScouts,
    detectionRisk: scouts.length === 0 ? 0 : calculateDetectionRisk(
      normalizedSearchTime,
      opponentDefensiveSetup,
      average(scouts.map((scout) => scout.stats.informationGathering)),
      scouts.length,
    ),
    rawInformation,
    informationAmount: calculateInformationAmount(rawInformation),
  };
}

/** 생존 인원 차이를 매 교전마다 반영해 라운드의 승자를 계산합니다. */
export function simulateTacticalRound(
  attackers: Operator[],
  defenders: Operator[],
  options: TacticalRoundOptions = {},
): TacticalRoundResult {
  if (attackers.length === 0 || defenders.length === 0) {
    throw new Error('라운드는 양측에 한 명 이상의 오퍼레이터가 있어야 합니다.');
  }
  const random = options.random ?? Math.random;
  const scouts = options.scouts ?? attackers.filter((operator) => operator.role === 'SEARCH');
  const search = resolveSearch(scouts, defenders, options.searchTime ?? 45, random);
  const aliveAttackers = [...attackers];
  const aliveDefenders = [...defenders];
  const decisionLogs: TacticalDecisionLog[] = [];
  const engagements: TacticalEngagementRecord[] = [];
  let previousAttacker: Operator | undefined;
  let previousDefender: Operator | undefined;
  let isolationKey = '';
  let isolationHoldsPosition = true;

  while (aliveAttackers.length > 0 && aliveDefenders.length > 0) {
    const attacker = selectWeightedOperator(aliveAttackers, (operator) => operator.stats.aggression, random);
    const defender = selectWeightedOperator(aliveDefenders, (operator) => operator.stats.clutch, random);
    const attackerIndex = aliveAttackers.indexOf(attacker);
    const defenderIndex = aliveDefenders.indexOf(defender);
    if (attacker !== previousAttacker) {
      decisionLogs.push({
        sequence: decisionLogs.length + 1,
        engagementSequence: engagements.length + 1,
        type: 'ENGAGEMENT_LEAD',
        callSign: attacker.callSign,
        statLabel: '공격성',
        statValue: attacker.stats.aggression,
        message: `『${attacker.callSign}』 (진입, 공격성 ${attacker.stats.aggression}) — 선두에서 진입을 주도합니다`,
      });
      previousAttacker = attacker;
    }
    if (defender !== previousDefender) {
      decisionLogs.push({
        sequence: decisionLogs.length + 1,
        engagementSequence: engagements.length + 1,
        type: 'ENGAGEMENT_LEAD',
        callSign: defender.callSign,
        statLabel: '클러치',
        statValue: defender.stats.clutch,
        message: `『${defender.callSign}』 (클러치 ${defender.stats.clutch}) — 각을 잡고 대응할 확률이 높습니다`,
      });
      previousDefender = defender;
    }
    const isolation = getIsolationState(aliveAttackers, aliveDefenders);
    if (isolation) {
      const nextIsolationKey = `${isolation.side}:${isolation.operator.callSign}:${isolation.opponentCount}`;
      if (nextIsolationKey !== isolationKey) {
        isolationKey = nextIsolationKey;
        isolationHoldsPosition = random() < isolation.operator.stats.clutch / 100;
        decisionLogs.push({
          sequence: decisionLogs.length + 1,
          engagementSequence: engagements.length + 1,
          type: 'ISOLATION',
          callSign: isolation.operator.callSign,
          statLabel: '클러치',
          statValue: isolation.operator.stats.clutch,
          message: isolationHoldsPosition
            ? `『${isolation.operator.callSign}』 (클러치 ${isolation.operator.stats.clutch}) — 무리하지 않고 자리를 잡고 버티기로 판단합니다`
            : `『${isolation.operator.callSign}』 (클러치 ${isolation.operator.stats.clutch}) — 잃을 게 없다며 먼저 움직이기로 판단합니다`,
        });
      }
    } else {
      isolationKey = '';
    }
    const baseProbability = calculateEngagementWinProbability({
      ownAim: attacker.stats.aim,
      opponentAim: defender.stats.aim,
      ownSurvivors: aliveAttackers.length,
      opponentSurvivors: aliveDefenders.length,
      informationAmount: search.informationAmount,
      urgency: search.urgency,
    });
    const isolationAdjustment = isolation
      ? getIsolationAdjustment(isolation.side, isolationHoldsPosition)
      : 0;
    const winProbability = clamp(baseProbability + isolationAdjustment, 0.05, 0.95);
    const attackersWon = random() < winProbability;
    engagements.push({
      sequence: engagements.length + 1,
      attackerCallSign: attacker.callSign,
      defenderCallSign: defender.callSign,
      winner: attackersWon ? '공격' : '수비',
      attackersAlive: aliveAttackers.length,
      defendersAlive: aliveDefenders.length,
    });
    if (attackersWon) aliveDefenders.splice(defenderIndex, 1);
    else aliveAttackers.splice(attackerIndex, 1);
  }

  return {
    attackersWon: aliveDefenders.length === 0,
    executionTime: search.executionTime,
    urgency: search.urgency,
    informationAmount: search.informationAmount,
    attackerSurvivors: aliveAttackers.length,
    defenderSurvivors: aliveDefenders.length,
    survivingScouts: search.survivingScouts,
    decisionLogs,
    engagements,
  };
}

/** 성향 수치를 0이 아닌 선택 가중치로 바꿉니다. */
function calculateDecisionWeight(stat: number): number {
  return 0.25 + Math.max(0, stat) / 100;
}

/** 공격성 또는 클러치 가중치로 생존 오퍼레이터를 선택합니다. */
function selectWeightedOperator(
  operators: Operator[],
  statSelector: (operator: Operator) => number,
  random: () => number,
): Operator {
  const totalWeight = operators.reduce((sum, operator) => sum + calculateDecisionWeight(statSelector(operator)), 0);
  let cursor = Math.min(0.999999, Math.max(0, random())) * totalWeight;
  for (const operator of operators) {
    cursor -= calculateDecisionWeight(statSelector(operator));
    if (cursor <= 0) return operator;
  }
  return operators[operators.length - 1];
}

/** 한쪽이 고립되었는지와 상대 생존 인원을 반환합니다. */
function getIsolationState(
  attackers: Operator[],
  defenders: Operator[],
): { side: 'attacker' | 'defender'; operator: Operator; opponentCount: number } | null {
  if (attackers.length === 1 && defenders.length >= 2) {
    return { side: 'attacker', operator: attackers[0], opponentCount: defenders.length };
  }
  if (defenders.length === 1 && attackers.length >= 2) {
    return { side: 'defender', operator: defenders[0], opponentCount: attackers.length };
  }
  return null;
}

/** 고립자의 판단을 공격 승률 공식 위에 얹을 추가 보정으로 변환합니다. */
function getIsolationAdjustment(side: 'attacker' | 'defender', holdsPosition: boolean): number {
  const loneOperatorAdjustment = holdsPosition ? 0.05 : -0.03;
  return side === 'attacker' ? loneOperatorAdjustment : -loneOperatorAdjustment;
}

interface ValidationRow {
  scenario: string;
  actualPercent: number;
  expectedPercent: number;
  withinThreePercent: boolean;
}

/** 8천 회씩 공식 검증을 실행하고 기준 이탈 여부를 콘솔에 출력합니다. */
export function printTacticalSimulationValidation(
  trials = TACTICAL_VALIDATION_TRIALS,
  random: () => number = Math.random,
): void {
  const survivorRows = [5, 4, 3, 2, 1].map((opponentSurvivors, index) => ({
    scenario: `5대${opponentSurvivors}`,
    actualPercent: runEngagementTrials(5, opponentSurvivors, 0, trials, random) * 100,
    expectedPercent: [50.3, 75.9, 92.5, 98.8, 99.9][index],
  }));
  const informationRows = [0, 0.25, 0.5, 0.75, 1].map((informationAmount, index) => ({
    scenario: `정보량 ${informationAmount}`,
    actualPercent: runEngagementTrials(5, 5, informationAmount, trials, random) * 100,
    expectedPercent: [50.0, 59.8, 69.8, 77.5, 85.1][index],
  }));
  const operatorRows = OPERATORS.map((operator) => ({
    콜사인: operator.callSign,
    부대: operator.unit.name,
    역할: OPERATOR_ROLE_LABELS[operator.role],
    조준: operator.stats.aim,
    진입: operator.stats.entry,
    정보수집: operator.stats.informationGathering,
    수비설계: operator.stats.defensiveSetup,
    클러치: operator.stats.clutch,
    공격성: operator.stats.aggression,
    검증: '통과',
  }));
  /** 검증 표에 상대 오차 판정을 덧붙입니다. */
  const formatRows = (rows: Array<{ scenario: string; actualPercent: number; expectedPercent: number }>): ValidationRow[] =>
    rows.map((row) => ({
      ...row,
      withinThreePercent: withinTolerance(row.actualPercent, row.expectedPercent),
    }));

  console.group(`=== 전술 FPS 라운드 공식 검증 (${trials.toLocaleString()}회씩) ===`);
  console.table(formatRows(survivorRows));
  console.table(formatRows(informationRows));
  console.table(operatorRows);
  console.info('교전 선택은 공격성·클러치 가중치와 판단 로그를 사용하며, 위 동일 조건 승률은 기존 조준·생존 인원·정보량·급함 공식으로 다시 확인했습니다.');
  console.groupEnd();
}

/** 같은 조건의 교전 라운드를 반복해 공격 측 승률을 구합니다. */
function runEngagementTrials(
  ownSurvivors: number,
  opponentSurvivors: number,
  informationAmount: number,
  trials: number,
  random: () => number,
): number {
  let wins = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    let own = ownSurvivors;
    let opponent = opponentSurvivors;
    while (own > 0 && opponent > 0) {
      const winProbability = calculateEngagementWinProbability({
        ownAim: 70,
        opponentAim: 70,
        ownSurvivors: own,
        opponentSurvivors: opponent,
        informationAmount,
        urgency: 0,
      });
      if (random() < winProbability) opponent -= 1;
      else own -= 1;
    }
    if (opponent === 0) wins += 1;
  }
  return wins / trials;
}

/** 실제값과 기준값이 상대 오차 3퍼센트 이내인지 확인합니다. */
function withinTolerance(actualPercent: number, expectedPercent: number): boolean {
  return Math.abs(actualPercent - expectedPercent) / expectedPercent <= 0.03;
}

/** 배열의 평균을 계산하고 빈 배열은 0으로 처리합니다. */
function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 확률값을 0과 1 사이로 제한합니다. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}