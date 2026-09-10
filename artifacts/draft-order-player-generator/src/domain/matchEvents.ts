/**
 * 이벤트와 선수 위치는 이미 계산된 경기 결과를 설명하기 위한 표시 데이터입니다.
 * 이 모듈은 승패·전력·보정값을 다시 계산하지 않으며, 맵에 보여 줄 움직임만 생성합니다.
 */

import { Champion } from './Champion';
import { MatchResult, PhaseResult } from './MatchResult';
import { Player, Position } from './Player';
import { formatPlayerName } from './playerDisplay';

/** 중계 화면이 사용할 경기 이벤트 종류입니다. */
export type MatchEventType = 'KILL' | 'GANK' | 'OBJECTIVE' | 'TOWER' | 'TEAMFIGHT' | 'ROAM';

/** 이벤트에 참여한 실제 선수와 밴픽 챔피언의 짝입니다. */
export interface MatchEventParticipant {
  player: Player;
  champion: Champion;
  teamName: string;
}

/** 이미 계산된 결과를 설명하는 한 줄짜리 경기 이벤트입니다. */
export interface MatchEvent {
  timestampSeconds: number;
  type: MatchEventType;
  participants: MatchEventParticipant[];
  description: string;
  position: { x: number; y: number };
}

/** 30초 시점마다 맵 위에 표시할 열 명의 선수 위치입니다. */
export interface MatchPlayerSnapshot {
  timestampSeconds: number;
  players: Array<MatchEventParticipant & { position: { x: number; y: number } }>;
}

/** 이벤트와 맵에서 공유하는 고정 오브젝트 좌표입니다. y는 아래에서 위로 증가합니다. */
export const MATCH_OBJECT_POSITIONS = [
  { name: '종의 파수꾼', x: 0.4, y: 0.62 },
  { name: '불꽃의 짐승', x: 0.55, y: 0.34 },
  { name: '심연의 군주', x: 0.66, y: 0.7 },
] as const;

const EVENT_TYPES: MatchEventType[] = ['KILL', 'GANK', 'OBJECTIVE', 'TOWER', 'TEAMFIGHT', 'ROAM'];
const SNAPSHOT_INTERVAL_SECONDS = 30;
const MATCH_END_SECONDS = 2100;
const PHASE_RANGES: Record<PhaseResult['phase'], [number, number]> = {
  EARLY: [60, 600],
  MID: [660, 1320],
  LATE: [1380, 2100],
};

type MapPosition = { x: number; y: number };
type WeightedType = { type: MatchEventType; weight: number };

/** 조합 태그를 세어 이벤트 성격과 수량을 정하는 데 사용합니다. */
function countTag(picks: Champion[], tag: 'DIVE' | 'POKE' | 'AOE' | 'EARLY' | 'LATE'): number {
  if (tag === 'AOE') return picks.filter((pick) => pick.range === tag).length;
  if (tag === 'EARLY' || tag === 'LATE') return picks.filter((pick) => pick.timing === tag).length;
  return picks.filter((pick) => pick.engagement === tag).length;
}

/** 같은 입력에서 매번 같은 불규칙 시간과 가중 선택을 만들기 위한 작은 결정론적 파동입니다. */
function deterministicWave(seed: number): number {
  return (Math.sin(seed * 12.9898) + 1) / 2;
}

/** 구간 조합에 따라 10~15개 사이의 이벤트 수를 정합니다. */
function getPhaseEventCount(picks: Champion[], phase: PhaseResult['phase']): number {
  const earlyBias = countTag(picks, 'EARLY') - countTag(picks, 'LATE');
  const phaseBias = phase === 'EARLY' ? earlyBias : phase === 'LATE' ? -earlyBias : Math.round(earlyBias / 2);
  return Math.min(15, Math.max(10, 12 + Math.round(phaseBias * 0.7)));
}

/** 평균 간격을 유지하되 일정한 격자처럼 보이지 않도록 구간별 시간을 흩어 놓습니다. */
function createIrregularTimestamps(
  range: [number, number],
  count: number,
  phaseIndex: number,
): number[] {
  const [start, end] = range;
  const interval = (end - start) / (count + 1);
  const timestamps: number[] = [];
  let previous = start;
  for (let index = 0; index < count; index += 1) {
    const wave = deterministicWave((phaseIndex + 1) * 31 + (index + 1) * 17) - 0.5;
    const ideal = start + interval * (index + 1);
    const remaining = count - index - 1;
    const lowerBound = previous + 16;
    const upperBound = end - remaining * 16;
    const timestamp = Math.round(Math.min(upperBound, Math.max(lowerBound, ideal + wave * interval * 0.68)));
    timestamps.push(timestamp);
    previous = timestamp;
  }
  return timestamps;
}

/** 조합 태그를 이벤트 종류별 가중치로 변환합니다. */
function getEventTypeWeights(picks: Champion[]): WeightedType[] {
  const dive = countTag(picks, 'DIVE');
  const poke = countTag(picks, 'POKE');
  const aoe = countTag(picks, 'AOE');
  return [
    { type: 'KILL', weight: 1 + dive * 1.55 },
    { type: 'GANK', weight: 1 + dive * 1.55 },
    { type: 'OBJECTIVE', weight: 0.8 + poke * 1.3 },
    { type: 'TOWER', weight: 0.8 + poke * 1.45 },
    { type: 'TEAMFIGHT', weight: 0.6 + aoe * 1.65 },
    { type: 'ROAM', weight: 1 + (dive + poke) * 0.25 },
  ];
}

/** 가중치와 이벤트 순번을 이용해 한 팀의 이벤트 종류를 고릅니다. */
function chooseWeightedType(weights: WeightedType[], seed: number): MatchEventType {
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = deterministicWave(seed) * total;
  for (const entry of weights) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.type;
  }
  return weights[weights.length - 1].type;
}

/** 승자 보정은 약하게만 적용하고 조합 태그가 이벤트 구성의 주된 원인이 되도록 합니다. */
function getTeamActivity(picks: Champion[], isWinner: boolean): number {
  return 1
    + countTag(picks, 'DIVE') * 1.35
    + countTag(picks, 'POKE') * 1.2
    + countTag(picks, 'AOE') * 0.8
    + (isWinner ? 1.4 : 0);
}

/** 같은 결과 구간에서 이벤트를 일으킬 팀을 조합 활동량으로 선택합니다. */
function chooseEventTeam(
  result: MatchResult,
  phase: PhaseResult,
  seed: number,
): string {
  const homeActivity = getTeamActivity(result.homePicks, phase.winnerName === result.homeTeam.name);
  const awayActivity = getTeamActivity(result.awayPicks, phase.winnerName === result.awayTeam.name);
  const homeShare = homeActivity / (homeActivity + awayActivity);
  return deterministicWave(seed) <= homeShare ? result.homeTeam.name : result.awayTeam.name;
}

/** 팀 이름에 맞는 실제 선수와 같은 인덱스의 픽을 반환합니다. */
function getParticipants(
  result: MatchResult,
  teamName: string,
  count: number,
  offset: number,
  type: MatchEventType,
): MatchEventParticipant[] {
  const isHome = teamName === result.homeTeam.name;
  const team = isHome ? result.homeTeam : result.awayTeam;
  const picks = isHome ? result.homePicks : result.awayPicks;
  const jungleIndex = team.players.findIndex((player) => player.position === 'JUNGLE');
  const indexes = type === 'GANK'
    ? [jungleIndex, (jungleIndex + 1 + offset) % team.players.length]
    : Array.from({ length: Math.min(count, team.players.length) }, (_, index) =>
      (index + offset) % team.players.length);
  return indexes
    .filter((index, indexPosition) => index >= 0 && indexes.indexOf(index) === indexPosition)
    .map((playerIndex) => ({
      player: team.players[playerIndex],
      champion: picks[playerIndex],
      teamName,
    }));
}

/** 세 개의 독립적인 경로를 따라 진행률을 좌표로 바꿉니다. */
function pointOnPath(path: MapPosition[], progress: number): MapPosition {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const scaled = clampedProgress * (path.length - 1);
  const segment = Math.min(path.length - 2, Math.floor(scaled));
  const localProgress = scaled - segment;
  const from = path[segment];
  const to = path[segment + 1];
  return {
    x: from.x + (to.x - from.x) * localProgress,
    y: from.y + (to.y - from.y) * localProgress,
  };
}

/** 포지션별 라인 경로를 반환합니다. 좌표계의 y=0은 화면 아래쪽입니다. */
function getLanePath(position: Position): MapPosition[] {
  if (position === 'TOP') return [{ x: 0.08, y: 0.08 }, { x: 0.08, y: 0.92 }, { x: 0.92, y: 0.92 }];
  if (position === 'MID') return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.92 }];
  return [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }];
}

/** 시간이 흐를수록 각 팀이 상대 본진 쪽으로 조금씩 전진하는 라인 진행률입니다. */
function getTeamProgress(result: MatchResult, teamName: string, timestampSeconds: number): number {
  const forward = 0.08 + Math.min(0.8, (timestampSeconds / MATCH_END_SECONDS) * 0.8);
  return teamName === result.homeTeam.name ? forward : 1 - forward;
}

/** 포지션 선수의 기본 라인 위치를 계산합니다. */
function getBasePlayerPosition(
  result: MatchResult,
  teamName: string,
  player: Player,
  timestampSeconds: number,
  playerIndex: number,
): MapPosition {
  if (player.position === 'JUNGLE') {
    const jungleCenters: MapPosition[] = [
      { x: 0.28, y: 0.28 },
      { x: 0.28, y: 0.72 },
      { x: 0.72, y: 0.28 },
      { x: 0.72, y: 0.72 },
    ];
    const center = jungleCenters[(Math.floor(timestampSeconds / 120) + playerIndex) % jungleCenters.length];
    const drift = deterministicWave(timestampSeconds / 30 + playerIndex * 7) - 0.5;
    return clampPosition({ x: center.x + drift * 0.12, y: center.y - drift * 0.1 });
  }
  const laneProgress = getTeamProgress(result, teamName, timestampSeconds);
  const position = pointOnPath(getLanePath(player.position), laneProgress);
  const laneOffset = ((playerIndex % 2) - 0.5) * 0.018;
  return clampPosition({ x: position.x + laneOffset, y: position.y - laneOffset });
}

/** 갱킹 좌표를 라인과 인접 정글의 경계로 배치합니다. */
function getGankPosition(
  result: MatchResult,
  teamName: string,
  player: Player,
  timestampSeconds: number,
  eventIndex: number,
): MapPosition {
  const line = getBasePlayerPosition(result, teamName, player, timestampSeconds, eventIndex);
  const jungle = [
    { x: 0.28, y: 0.28 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.28 },
    { x: 0.72, y: 0.72 },
  ][eventIndex % 4];
  return clampPosition({ x: line.x * 0.62 + jungle.x * 0.38, y: line.y * 0.62 + jungle.y * 0.38 });
}

/** 포지션과 이벤트 종류에 맞는 실제 맵 좌표를 반환합니다. */
function getEventPosition(
  result: MatchResult,
  teamName: string,
  eventType: MatchEventType,
  participants: MatchEventParticipant[],
  timestampSeconds: number,
  eventIndex: number,
  objectName: string,
): MapPosition {
  const lead = participants[0];
  if (eventType === 'OBJECTIVE') {
    return MATCH_OBJECT_POSITIONS.find((object) => object.name === objectName) ?? MATCH_OBJECT_POSITIONS[1];
  }
  if (eventType === 'TEAMFIGHT') {
    const objectPosition = MATCH_OBJECT_POSITIONS[(eventIndex + 1) % MATCH_OBJECT_POSITIONS.length];
    return eventIndex % 3 === 0 ? objectPosition : { x: 0.5, y: 0.5 };
  }
  if (eventType === 'GANK' && lead) {
    return getGankPosition(result, teamName, lead.player, timestampSeconds, eventIndex);
  }
  if (eventType === 'ROAM') {
    const lane = lead ? getBasePlayerPosition(result, teamName, lead.player, timestampSeconds, eventIndex) : { x: 0.5, y: 0.5 };
    return clampPosition({ x: lane.x * 0.55 + 0.5 * 0.45, y: lane.y * 0.55 + 0.5 * 0.45 });
  }
  return lead
    ? getBasePlayerPosition(result, teamName, lead.player, timestampSeconds, eventIndex)
    : { x: 0.5, y: 0.5 };
}

/** 이벤트 종류와 실제 참가자를 사용해 한 줄 중계 문장을 만듭니다. */
function getDescription(type: MatchEventType, participants: MatchEventParticipant[], objectName: string): string {
  const lead = participants[0];
  const playerName = formatPlayerName(lead.player);
  if (type === 'OBJECTIVE') return `${playerName}의 ${lead.champion.name}이 ${objectName}을 확보했습니다.`;
  if (type === 'TOWER') return `${playerName}의 ${lead.champion.name}이 전선을 밀어 탑을 무너뜨렸습니다.`;
  if (type === 'TEAMFIGHT') return `${playerName}의 ${lead.champion.name}이 합류한 한타가 승부를 갈랐습니다.`;
  if (type === 'GANK') return `${playerName}의 ${lead.champion.name}이 기습 합류로 흐름을 만들었습니다.`;
  if (type === 'ROAM') return `${playerName}의 ${lead.champion.name}이 로밍으로 전장을 흔들었습니다.`;
  return `${playerName}의 ${lead.champion.name}이 결정적인 처치를 만들었습니다.`;
}

/**
 * 구간 승패를 그대로 사용해 30~45개의 불규칙한 이벤트를 생성합니다.
 * 이벤트 수와 종류는 조합 태그를 반영하지만, 승패나 경기 전력은 절대 다시 계산하지 않습니다.
 */
export function generateMatchEvents(result: MatchResult): MatchEvent[] {
  const events: MatchEvent[] = [];
  result.phases.forEach((phase, phaseIndex) => {
    const count = getPhaseEventCount(
      phase.winnerName === result.homeTeam.name ? result.homePicks : result.awayPicks,
      phase.phase,
    );
    const timestamps = createIrregularTimestamps(PHASE_RANGES[phase.phase], count, phaseIndex);
    timestamps.forEach((timestampSeconds, eventIndex) => {
      const teamName = chooseEventTeam(result, phase, (phaseIndex + 1) * 101 + eventIndex * 13);
      const picks = teamName === result.homeTeam.name ? result.homePicks : result.awayPicks;
      const type = chooseWeightedType(getEventTypeWeights(picks), (phaseIndex + 1) * 53 + eventIndex * 19);
      const participantCount = type === 'TEAMFIGHT'
        ? Math.min(5, 2 + countTag(picks, 'AOE'))
        : type === 'GANK' ? 2 : 1;
      const participants = getParticipants(result, teamName, participantCount, phaseIndex + eventIndex, type);
      const objectName = MATCH_OBJECT_POSITIONS[(phaseIndex + eventIndex) % MATCH_OBJECT_POSITIONS.length].name;
      events.push({
        timestampSeconds,
        type,
        participants,
        description: getDescription(type, participants, objectName),
        position: getEventPosition(result, teamName, type, participants, timestampSeconds, phaseIndex + eventIndex, objectName),
      });
    });
  });
  return events.sort((left, right) => left.timestampSeconds - right.timestampSeconds);
}

/**
 * 경기 시간 0~2100초를 30초 간격으로 나눠 열 명의 기본 위치를 생성합니다.
 * 이벤트 참가자는 전후 45초 동안 이벤트 좌표 쪽으로 끌어당겨졌다가 다시 라인으로 돌아옵니다.
 */
export function generateMatchPlayerSnapshots(
  result: MatchResult,
  events: MatchEvent[],
): MatchPlayerSnapshot[] {
  const snapshots: MatchPlayerSnapshot[] = [];
  for (let timestampSeconds = 0; timestampSeconds <= MATCH_END_SECONDS; timestampSeconds += SNAPSHOT_INTERVAL_SECONDS) {
    const players = [
      ...result.homeTeam.players.map((player, index) => ({
        player,
        champion: result.homePicks[index],
        teamName: result.homeTeam.name,
        position: getBasePlayerPosition(result, result.homeTeam.name, player, timestampSeconds, index),
      })),
      ...result.awayTeam.players.map((player, index) => ({
        player,
        champion: result.awayPicks[index],
        teamName: result.awayTeam.name,
        position: getBasePlayerPosition(result, result.awayTeam.name, player, timestampSeconds, index),
      })),
    ];
    events.forEach((event) => {
      const distance = Math.abs(timestampSeconds - event.timestampSeconds);
      if (distance > 45) return;
      const influence = (1 - distance / 45) * 0.82;
      event.participants.forEach((participant, participantIndex) => {
        const player = players.find((entry) =>
          entry.teamName === participant.teamName && entry.player === participant.player);
        if (!player) return;
        const offset = (participantIndex - (event.participants.length - 1) / 2) * 0.018;
        const eventPosition = clampPosition({
          x: event.position.x + offset,
          y: event.position.y + offset * 0.6,
        });
        player.position = {
          x: player.position.x * (1 - influence) + eventPosition.x * influence,
          y: player.position.y * (1 - influence) + eventPosition.y * influence,
        };
      });
    });
    snapshots.push({ timestampSeconds, players });
  }
  return snapshots;
}

/** 이벤트 종류별 개수를 콘솔 비교와 검증에서 공통으로 사용합니다. */
export function getMatchEventTypeDistribution(events: MatchEvent[]): Record<MatchEventType, number> {
  return EVENT_TYPES.reduce((distribution, type) => {
    distribution[type] = events.filter((event) => event.type === type).length;
    return distribution;
  }, {} as Record<MatchEventType, number>);
}

/** 시간에 맞는 구간을 반환합니다. */
function getPhaseForTimestamp(timestampSeconds: number): PhaseResult['phase'] | undefined {
  return (Object.entries(PHASE_RANGES) as Array<[PhaseResult['phase'], [number, number]]>)
    .find(([, [start, end]]) => timestampSeconds >= start && timestampSeconds <= end)?.[0];
}

/** 생성된 이벤트와 스냅샷이 화면에 전달해도 되는 최소 형식인지 검사합니다. */
export function validateMatchEvents(
  result: MatchResult,
  events: MatchEvent[],
  snapshots: MatchPlayerSnapshot[] = [],
): string[] {
  const issues: string[] = [];
  if (events.length < 30 || events.length > 45) issues.push(`경기 이벤트 수가 30~45개 범위를 벗어났습니다: ${events.length}개`);
  const phaseCounts = { EARLY: 0, MID: 0, LATE: 0 };
  events.forEach((event, index) => {
    const phase = getPhaseForTimestamp(event.timestampSeconds);
    if (phase) phaseCounts[phase] += 1;
    if (index > 0 && event.timestampSeconds <= events[index - 1].timestampSeconds) issues.push('이벤트 시간이 엄격한 오름차순이 아닙니다.');
    if (index === 0 && event.timestampSeconds > 120) issues.push('첫 이벤트 전 공백이 2분을 넘습니다.');
    if (index > 0 && event.timestampSeconds - events[index - 1].timestampSeconds > 120) issues.push('이벤트 사이 공백이 2분을 넘습니다.');
    if (index === events.length - 1 && MATCH_END_SECONDS - event.timestampSeconds > 120) issues.push('마지막 이벤트 뒤 공백이 2분을 넘습니다.');
    if (!EVENT_TYPES.includes(event.type)) issues.push('허용되지 않은 이벤트 종류입니다.');
    if (event.position.x < 0 || event.position.x > 1 || event.position.y < 0 || event.position.y > 1) issues.push('이벤트 좌표가 0~1 범위를 벗어났습니다.');
    if (event.type === 'OBJECTIVE' && !MATCH_OBJECT_POSITIONS.some((object) => event.description.includes(object.name))) issues.push('허용되지 않은 오브젝트 이름입니다.');
    event.participants.forEach((participant) => {
      const isHome = participant.teamName === result.homeTeam.name;
      const team = isHome ? result.homeTeam : result.awayTeam;
      const picks = isHome ? result.homePicks : result.awayPicks;
      const playerIndex = team.players.indexOf(participant.player);
      if (playerIndex < 0 || picks[playerIndex] !== participant.champion) issues.push('참가 선수와 챔피언 조합이 실제 밴픽과 다릅니다.');
    });
  });
  if (phaseCounts.EARLY < 10 || phaseCounts.EARLY > 15) issues.push(`초반 이벤트 수가 10~15개 범위를 벗어났습니다: ${phaseCounts.EARLY}개`);
  if (phaseCounts.MID < 10 || phaseCounts.MID > 15) issues.push(`중반 이벤트 수가 10~15개 범위를 벗어났습니다: ${phaseCounts.MID}개`);
  if (phaseCounts.LATE < 10 || phaseCounts.LATE > 15) issues.push(`후반 이벤트 수가 10~15개 범위를 벗어났습니다: ${phaseCounts.LATE}개`);

  if (snapshots.length > 0) {
    if (snapshots.length !== MATCH_END_SECONDS / SNAPSHOT_INTERVAL_SECONDS + 1) issues.push('선수 위치 스냅샷이 30초 간격으로 0~2100초를 모두 포함하지 않습니다.');
    snapshots.forEach((snapshot, index) => {
      if (snapshot.timestampSeconds !== index * SNAPSHOT_INTERVAL_SECONDS) issues.push('선수 위치 스냅샷 간격이 30초가 아닙니다.');
      if (snapshot.players.length !== 10) issues.push('선수 위치 스냅샷에 10명이 들어 있지 않습니다.');
      snapshot.players.forEach((player) => {
        if (player.position.x < 0 || player.position.x > 1 || player.position.y < 0 || player.position.y > 1) issues.push('선수 위치 스냅샷 좌표가 0~1 범위를 벗어났습니다.');
      });
    });
  }
  return issues;
}

/** 좌표를 안전한 맵 범위로 제한합니다. */
function clampPosition(position: MapPosition): MapPosition {
  return {
    x: Math.min(0.96, Math.max(0.04, position.x)),
    y: Math.min(0.96, Math.max(0.04, position.y)),
  };
}