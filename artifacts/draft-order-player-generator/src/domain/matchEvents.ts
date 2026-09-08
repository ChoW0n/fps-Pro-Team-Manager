/**
 * 이벤트는 이미 계산된 구간 승패/최종 결과를 설명하기 위해 거꾸로 생성하며 승패를 바꾸지 않는다.
 * 이벤트에서 경기 결과를 다시 계산하면 시뮬레이션 통제 불가.
 * 맵 좌표는 다음 단계용이고 지금 사용하지 않는다.
 */

import { Champion } from './Champion';
import { MatchResult, PhaseResult } from './MatchResult';
import { Player } from './Player';
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

const EVENT_TYPES: MatchEventType[] = ['KILL', 'GANK', 'OBJECTIVE', 'TOWER', 'TEAMFIGHT', 'ROAM'];
const OBJECT_NAMES = ['종의 파수꾼', '불꽃의 짐승', '심연의 군주'];

/** 챔피언 태그를 세어 이벤트 성격을 정하는 데만 사용합니다. */
function countTag(picks: Champion[], tag: 'DIVE' | 'POKE' | 'AOE' | 'EARLY'): number {
  if (tag === 'AOE') return picks.filter((pick) => pick.range === tag).length;
  if (tag === 'EARLY') return picks.filter((pick) => pick.timing === tag).length;
  return picks.filter((pick) => pick.engagement === tag).length;
}

/** 팀 명칭에 맞는 실제 선수와 같은 인덱스의 픽을 반환합니다. */
function getParticipants(
  result: MatchResult,
  teamName: string,
  count: number,
  offset: number,
): MatchEventParticipant[] {
  const isHome = teamName === result.homeTeam.name;
  const team = isHome ? result.homeTeam : result.awayTeam;
  const picks = isHome ? result.homePicks : result.awayPicks;
  return Array.from({ length: Math.min(count, team.players.length) }, (_, index) => {
    const playerIndex = (index + offset) % team.players.length;
    return { player: team.players[playerIndex], champion: picks[playerIndex], teamName };
  });
}

/** 태그 우선순위로 결과를 설명할 이벤트 종류를 반환합니다. */
function getEventType(picks: Champion[], eventIndex: number): MatchEventType {
  if (eventIndex === 2 && countTag(picks, 'AOE') > 0) return 'TEAMFIGHT';
  if (countTag(picks, 'DIVE') > countTag(picks, 'POKE')) return eventIndex === 1 ? 'KILL' : 'GANK';
  if (countTag(picks, 'POKE') > 0) return eventIndex === 1 ? 'TOWER' : 'OBJECTIVE';
  return eventIndex === 1 ? 'ROAM' : 'KILL';
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
 * 구간 승자와 이미 확정된 챔피언 태그를 읽어 시간순 중계 이벤트를 생성합니다.
 * 이 함수는 결과 객체를 수정하지 않고 새 이벤트 배열만 반환합니다.
 */
export function generateMatchEvents(result: MatchResult): MatchEvent[] {
  const events: MatchEvent[] = [];
  const ranges: Record<PhaseResult['phase'], [number, number]> = {
    EARLY: [60, 600],
    MID: [660, 1320],
    LATE: [1380, 2100],
  };
  result.phases.forEach((phase, phaseIndex) => {
    const winnerPicks = phase.winnerName === result.homeTeam.name ? result.homePicks : result.awayPicks;
    const loserName = phase.winnerName === result.homeTeam.name ? result.awayTeam.name : result.homeTeam.name;
    const loserPicks = phase.winnerName === result.homeTeam.name ? result.awayPicks : result.homePicks;
    const earlyFirst = phase.phase === 'EARLY' && countTag(loserPicks, 'EARLY') > countTag(winnerPicks, 'EARLY')
      ? loserName
      : phase.winnerName;
    const [start, end] = ranges[phase.phase];
    [earlyFirst, phase.winnerName, phase.winnerName].forEach((teamName, eventIndex) => {
      const picks = teamName === result.homeTeam.name ? result.homePicks : result.awayPicks;
      const type = getEventType(picks, eventIndex);
      const participantCount = type === 'TEAMFIGHT' ? Math.min(5, 2 + countTag(picks, 'AOE')) : 1;
      const participants = getParticipants(result, teamName, participantCount, phaseIndex + eventIndex);
      const timestampSeconds = start + Math.floor(((eventIndex + 1) * (end - start)) / 4);
      events.push({
        timestampSeconds,
        type,
        participants,
        description: getDescription(type, participants, OBJECT_NAMES[(phaseIndex + eventIndex) % OBJECT_NAMES.length]),
        position: { x: (phaseIndex + 1) / 4, y: (eventIndex + 1) / 4 },
      });
    });
  });
  return events.sort((left, right) => left.timestampSeconds - right.timestampSeconds);
}

/** 생성된 이벤트가 화면에 전달해도 되는 최소 형식인지 검사하고 문제 문구를 반환합니다. */
export function validateMatchEvents(result: MatchResult, events: MatchEvent[]): string[] {
  const issues: string[] = [];
  events.forEach((event, index) => {
    if (index > 0 && event.timestampSeconds < events[index - 1].timestampSeconds) issues.push('이벤트 시간이 오름차순이 아닙니다.');
    if (!EVENT_TYPES.includes(event.type)) issues.push('허용되지 않은 이벤트 종류입니다.');
    if (event.position.x < 0 || event.position.x > 1 || event.position.y < 0 || event.position.y > 1) issues.push('이벤트 좌표가 0~1 범위를 벗어났습니다.');
    if (event.type === 'OBJECTIVE' && !OBJECT_NAMES.some((name) => event.description.includes(name))) issues.push('허용되지 않은 오브젝트 이름입니다.');
    event.participants.forEach((participant) => {
      const isHome = participant.teamName === result.homeTeam.name;
      const team = isHome ? result.homeTeam : result.awayTeam;
      const picks = isHome ? result.homePicks : result.awayPicks;
      const playerIndex = team.players.indexOf(participant.player);
      if (playerIndex < 0 || picks[playerIndex] !== participant.champion) issues.push('참가 선수와 챔피언 조합이 실제 밴픽과 다릅니다.');
    });
  });
  return issues;
}