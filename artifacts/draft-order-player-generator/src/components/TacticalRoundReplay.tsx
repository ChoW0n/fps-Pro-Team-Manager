/**
 * PixiJS로 한 라운드의 소리와 시선을 중계 화면처럼 재생합니다.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Operator } from '../domain/Operator';
import { OPERATORS } from '../domain/Operator';
import type { TacticalRoundResult } from '../domain/TacticalRoundSimulation';
import { BREACHLINE_MAP, type TacticalMapDefinition, type TacticalPoint } from '../domain/tacticalMaps';

const REPLAY_PHASES = ['수색', '브리칭', '교전', '결과'] as const;
const ROLE_RING_COLORS: Record<Operator['role'], number> = {
  SEARCH: 0x8b9fa1,
  ENTRY: 0xd3b16a,
  FIREPOWER: 0xb5c5ce,
  DEFENSIVE_SETUP: 0x8d9c84,
  BLOCKING: 0xc39a74,
};
const ATTACKER_COLOR = 0x65d8c8;
const DEFENDER_COLOR = 0xe9785f;
const MAP_BACKGROUND = 0x11191d;
const MAP_FLOOR = 0x17252a;
const MAP_GRID = 0x24404a;
const MAP_WALL = 0x9fb2af;
const MAP_INTERIOR = 0x667c7d;
const MAP_ACCENT = 0xe6bd78;
const REPLAY_DURATION_CAP = 92;

export interface TacticalRoundReplayProps {
  /** 계산이 끝난 전술 라운드 결과입니다. */
  result: TacticalRoundResult;
  /** 라운드에 사용한 오퍼레이터 사전이며 기본값은 전체 오퍼레이터입니다. */
  operators?: readonly Operator[];
}

interface ReplayEvent {
  id: string;
  time: number;
  kind: '판단' | '교전' | '시야' | '소리';
  headline: string;
  detail: string;
  accent: 'attack' | 'defend' | 'gold';
}

interface OperatorMotion {
  operator: Operator;
  index: number;
  position: TacticalPoint;
  visible: boolean;
  pulse: number;
  eliminated: boolean;
}

interface ReplayTiming {
  searchEnd: number;
  breachEnd: number;
  engagementStarts: number[];
  resultStart: number;
  duration: number;
}

/** 두 점 사이를 선형 보간합니다. */
function mixPoint(from: TacticalPoint, to: TacticalPoint, amount: number): TacticalPoint {
  const clamped = Math.max(0, Math.min(1, amount));
  return { x: from.x + (to.x - from.x) * clamped, y: from.y + (to.y - from.y) * clamped };
}

/** 한 점을 중심으로 역할별 오프셋을 계산합니다. */
function offsetAround(point: TacticalPoint, index: number, radius: number): TacticalPoint {
  const angle = (index * 2.399963 + Math.PI / 4) % (Math.PI * 2);
  return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
}

/** 선분 두 개가 교차하는지 판정합니다. */
function segmentsIntersect(
  firstFrom: TacticalPoint,
  firstTo: TacticalPoint,
  secondFrom: TacticalPoint,
  secondTo: TacticalPoint,
): boolean {
  // 방향 벡터의 외적 부호로 두 선분의 교차를 판정합니다.
  const cross = (a: TacticalPoint, b: TacticalPoint, c: TacticalPoint): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const first = cross(firstFrom, firstTo, secondFrom);
  const second = cross(firstFrom, firstTo, secondTo);
  const third = cross(secondFrom, secondTo, firstFrom);
  const fourth = cross(secondFrom, secondTo, firstTo);
  return ((first > 0 && second < 0) || (first < 0 && second > 0))
    && ((third > 0 && fourth < 0) || (third < 0 && fourth > 0));
}

/** 중앙 내벽과 문틈을 기준으로 시야 차단을 계산합니다. */
function hasBlockedSight(from: TacticalPoint, to: TacticalPoint, map: TacticalMapDefinition): boolean {
  const centralWalls = map.walls.filter((wall) => wall.kind === 'interior');
  return centralWalls.some((wall) => segmentsIntersect(from, to, wall.from, wall.to));
}

/** 라운드 데이터에서 실제로 화면에 등장하는 양 팀을 정리합니다. */
function deriveRosters(result: TacticalRoundResult, operators: readonly Operator[]): {
  attackers: Operator[];
  defenders: Operator[];
} {
  const engaged = new Set(result.engagements.flatMap((engagement) => [
    engagement.attackerCallSign,
    engagement.defenderCallSign,
  ]));
  const scouts = new Set(result.survivingScouts.map((operator) => operator.callSign));
  const attackers = operators.filter((operator) => (
    operator.side === '공격' && (engaged.has(operator.callSign) || scouts.has(operator.callSign))
  ));
  const defenders = operators.filter((operator) => operator.side === '수비' && engaged.has(operator.callSign));
  const expectedAttackers = Math.max(
    result.attackerSurvivors,
    ...result.engagements.map((engagement) => engagement.attackersAlive),
    0,
  );
  const expectedDefenders = Math.max(
    result.defenderSurvivors,
    ...result.engagements.map((engagement) => engagement.defendersAlive),
    0,
  );
  const completeAttackers = [...attackers, ...operators.filter((operator) => (
    operator.side === '공격' && !engaged.has(operator.callSign) && !scouts.has(operator.callSign)
  ))];
  const completeDefenders = [...defenders, ...operators.filter((operator) => (
    operator.side === '수비' && !engaged.has(operator.callSign)
  ))];
  return {
    attackers: completeAttackers.length > 0
      ? completeAttackers.slice(0, Math.max(expectedAttackers, attackers.length))
      : operators.filter((operator) => operator.side === '공격'),
    defenders: completeDefenders.length > 0
      ? completeDefenders.slice(0, Math.max(expectedDefenders, defenders.length))
      : operators.filter((operator) => operator.side === '수비'),
  };
}

/** 모든 판단과 교전을 동일한 중계 타임라인에 배치합니다. */
function buildReplayEvents(
  result: TacticalRoundResult,
  timing: ReplayTiming,
): ReplayEvent[] {
  const engagementTimes = timing.engagementStarts;
  const decisionEvents = result.decisionLogs.map((log, index): ReplayEvent => ({
    id: `decision-${log.sequence}`,
    time: log.engagementSequence === 0
      ? timing.searchEnd
      : (engagementTimes[Math.max(0, log.engagementSequence - 1)] ?? timing.breachEnd),
    kind: '판단',
    headline: log.type === 'ISOLATION' ? '고립 판단' : '주도권 판단',
    detail: log.message,
    accent: log.statLabel === '공격성' ? 'attack' : 'gold',
  }));
  const engagementEvents = result.engagements.map((engagement, index): ReplayEvent => ({
    id: `engagement-${engagement.sequence}`,
    time: engagementTimes[index] ?? timing.breachEnd,
    kind: '교전',
    headline: `${engagement.attackerCallSign} 대 ${engagement.defenderCallSign}`,
    detail: `${engagement.winner} 우세 · 공격 ${engagement.attackersAlive} / 수비 ${engagement.defendersAlive}`,
    accent: engagement.winner === '공격' ? 'attack' : 'defend',
  }));
  const soundEvents = result.engagements
    .filter((_, index) => index > 0 && index % 3 === 1)
    .slice(0, 2)
    .map((engagement, index): ReplayEvent => ({
      id: `sound-${engagement.sequence}`,
      time: (engagementTimes[engagement.sequence - 1] ?? timing.breachEnd) + 0.7,
      kind: '소리',
      headline: '총성 추적',
      detail: index % 2 === 0
        ? '첫 발의 반향을 듣고 다음 각으로 이동합니다'
        : '발사 위치가 바뀌어 수비선이 짧게 재배치됩니다',
      accent: 'gold',
    }));
  const sightEvent: ReplayEvent = {
    id: 'sight-information',
    time: timing.breachEnd,
    kind: '시야',
    headline: result.informationAmount >= 0.35 ? '부분 정보 확보' : '중앙 격벽 너머는 불확실',
    detail: result.informationAmount >= 0.35
      ? `정보량 ${(result.informationAmount * 100).toFixed(0)}% · 우회 각과 월샷 라인이 활성화됩니다`
      : '문틈과 소리만으로 다음 각을 읽습니다',
    accent: 'gold',
  };
  return [...decisionEvents, sightEvent, ...soundEvents, ...engagementEvents]
    .sort((first, second) => first.time - second.time || first.id.localeCompare(second.id))
    .map((event, index) => ({ ...event, id: `${event.id}-${index}` }));
}

/** 결과의 교전 수에 맞춰 장면 길이를 계산합니다. */
function createReplayTiming(result: TacticalRoundResult): ReplayTiming {
  const duration = Math.min(
    REPLAY_DURATION_CAP,
    Math.max(30, 18 + result.engagements.length * 5.1 + result.decisionLogs.length * 0.58),
  );
  const searchEnd = Math.min(duration * 0.2, Math.max(5, duration * 0.16));
  const breachEnd = Math.min(duration * 0.31, searchEnd + 5.5);
  const engagementWindow = Math.max(0, duration - breachEnd - 5);
  const engagementStep = result.engagements.length > 0
    ? engagementWindow / result.engagements.length
    : 0;
  const engagementStarts = result.engagements.map((_, index) => breachEnd + index * engagementStep);
  return {
    searchEnd,
    breachEnd,
    engagementStarts,
    resultStart: duration - 5,
    duration,
  };
}

/** 재생 시간에 따른 현재 단계를 반환합니다. */
function getReplayPhase(time: number, timing: ReplayTiming): typeof REPLAY_PHASES[number] {
  if (time < timing.searchEnd) return '수색';
  if (time < timing.breachEnd) return '브리칭';
  if (time < timing.resultStart) return '교전';
  return '결과';
}

/** 현재까지 처리된 교전 수와 양 팀 생존 수를 계산합니다. */
function deriveScore(
  result: TacticalRoundResult,
  time: number,
  timing: ReplayTiming,
  attackersCount: number,
  defendersCount: number,
): { attackers: number; defenders: number; completed: number } {
  let attackers = Math.max(attackersCount, result.engagements[0]?.attackersAlive ?? 0);
  let defenders = Math.max(defendersCount, result.engagements[0]?.defendersAlive ?? 0);
  let completed = 0;
  result.engagements.forEach((engagement, index) => {
    if (time < (timing.engagementStarts[index] ?? Number.POSITIVE_INFINITY) + 1.6) return;
    completed += 1;
    if (engagement.winner === '공격') defenders = Math.max(0, defenders - 1);
    else attackers = Math.max(0, attackers - 1);
  });
  if (time >= timing.resultStart) {
    attackers = result.attackerSurvivors;
    defenders = result.defenderSurvivors;
    completed = result.engagements.length;
  }
  return { attackers, defenders, completed };
}

/** 화면 좌표를 Pixi 그래픽 좌표로 바꿉니다. */
function drawLine(graphics: any, from: TacticalPoint, to: TacticalPoint, color: number, width: number, alpha = 1): void {
  graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width, alpha });
}

/** 마름모 오퍼레이터 토큰을 그립니다. */
function drawOperatorToken(
  container: Container,
  motion: OperatorMotion,
  scale: number,
): void {
  const graphics = new Graphics();
  const color = motion.operator.side === '공격' ? ATTACKER_COLOR : DEFENDER_COLOR;
  const ringColor = ROLE_RING_COLORS[motion.operator.role];
  const radius = 11 / scale;
  const pulseRadius = radius + (motion.pulse * 5) / scale;
  graphics.circle(motion.position.x, motion.position.y, pulseRadius).stroke({
    color: ringColor,
    width: 1.15 / scale,
    alpha: motion.visible ? 0.58 : 0.18,
  });
  graphics.moveTo(motion.position.x, motion.position.y - radius)
    .lineTo(motion.position.x + radius, motion.position.y)
    .lineTo(motion.position.x, motion.position.y + radius)
    .lineTo(motion.position.x - radius, motion.position.y)
    .closePath()
    .fill({ color, alpha: motion.eliminated ? 0.13 : motion.visible ? 0.93 : 0.2 })
    .stroke({ color: 0xe9f3ec, width: 0.7 / scale, alpha: motion.visible ? 0.75 : 0.22 });
  const label = new Text({
    text: motion.operator.callSign,
    style: {
      fontFamily: 'Space Mono, monospace',
      fontSize: 10 / scale,
      fill: motion.eliminated ? 0x647375 : 0xe0e7dd,
      letterSpacing: 0.7,
    },
  });
  label.anchor.set(0.5, 0);
  label.x = motion.position.x;
  label.y = motion.position.y + 14 / scale;
  container.addChild(graphics, label);
}

/** 지도 지형과 엄폐물을 한 번 그립니다. */
function drawMapLayer(container: Container, map: TacticalMapDefinition, scale: number): void {
  const background = new Graphics();
  background.rect(0, 0, map.width, map.height).fill({ color: MAP_BACKGROUND });
  for (let x = 0; x <= map.width; x += 50) drawLine(background, { x, y: 0 }, { x, y: map.height }, MAP_GRID, 0.6 / scale, 0.25);
  for (let y = 0; y <= map.height; y += 50) drawLine(background, { x: 0, y }, { x: map.width, y }, MAP_GRID, 0.6 / scale, 0.25);
  container.addChild(background);

  const building = new Graphics();
  building.rect(map.building.x, map.building.y, map.building.width, map.building.height).fill({ color: MAP_FLOOR, alpha: 0.92 });
  building.rect(map.entryHall.x, map.entryHall.y, map.entryHall.width, map.entryHall.height).fill({ color: 0x1c3033, alpha: 0.4 });
  building.rect(map.objectiveZone.x, map.objectiveZone.y, map.objectiveZone.width, map.objectiveZone.height).fill({ color: 0x2a2525, alpha: 0.22 });
  building.rect(map.objectiveZone.x + 16, map.objectiveZone.y + 16, map.objectiveZone.width - 32, map.objectiveZone.height - 32).stroke({
    color: MAP_ACCENT,
    width: 1.2 / scale,
    alpha: 0.33,
  });
  container.addChild(building);

  const walls = new Graphics();
  map.walls.forEach((wall) => drawLine(
    walls,
    wall.from,
    wall.to,
    wall.kind === 'outer' ? MAP_WALL : wall.kind === 'door-gap' ? MAP_ACCENT : MAP_INTERIOR,
    wall.kind === 'outer' ? 4 / scale : 3 / scale,
    wall.kind === 'door-gap' ? 0.72 : 0.88,
  ));
  container.addChild(walls);

  map.covers.forEach((cover) => {
    const coverShape = new Graphics();
    const { rect } = cover;
    coverShape.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0x35464a, alpha: 0.9 }).stroke({
      color: 0x718386,
      width: 1 / scale,
      alpha: 0.66,
    });
    container.addChild(coverShape);
    const label = new Text({
      text: cover.label,
      style: { fontFamily: 'Space Mono, monospace', fontSize: 9 / scale, fill: 0x829496, letterSpacing: 0.7 },
    });
    label.x = rect.x;
    label.y = rect.y - 13 / scale;
    container.addChild(label);
  });

  const points = [
    { label: 'ENTRY', point: map.attackerSpawn, color: ATTACKER_COLOR },
    { label: 'BREACH', point: map.breachPoint, color: MAP_ACCENT },
    { label: 'WINDOW', point: map.windowPoint, color: 0x9fc5cb },
    {
      label: 'SITE',
      point: {
        x: map.objectiveZone.x + map.objectiveZone.width / 2,
        y: map.objectiveZone.y + map.objectiveZone.height / 2,
      },
      color: MAP_ACCENT,
    },
  ];
  points.forEach(({ label: pointLabel, point, color }) => {
    const marker = new Graphics();
    if ('x' in point && 'y' in point) {
      marker.circle(point.x, point.y, 5 / scale).stroke({ color, width: 1 / scale, alpha: 0.7 });
      marker.circle(point.x, point.y, 1.3 / scale).fill({ color, alpha: 0.85 });
      const text = new Text({
        text: pointLabel,
        style: { fontFamily: 'Space Mono, monospace', fontSize: 8 / scale, fill: color, letterSpacing: 1 },
      });
      text.x = point.x + 9 / scale;
      text.y = point.y - 5 / scale;
      container.addChild(marker, text);
    }
  });
}

/** 동적 오퍼레이터와 소리, 탄흔을 현재 프레임에 그립니다. */
function renderDynamicLayer(
  container: Container,
  result: TacticalRoundResult,
  map: TacticalMapDefinition,
  timing: ReplayTiming,
  time: number,
  scale: number,
  attackers: Operator[],
  defenders: Operator[],
): void {
  container.removeChildren().forEach((child: any) => child.destroy());
  const score = deriveScore(result, time, timing, attackers.length, defenders.length);
  const activeEngagementIndex = timing.engagementStarts.findIndex((start, index) => (
    time >= start && time < (timing.engagementStarts[index + 1] ?? timing.resultStart)
  ));
  const currentEngagement = activeEngagementIndex >= 0 ? result.engagements[activeEngagementIndex] : undefined;
  const infoHigh = result.informationAmount >= 0.35;
  const phase = getReplayPhase(time, timing);
  const positions = new Map<string, OperatorMotion>();
  const attackerAnchor = phase === '수색' ? map.attackerSpawn
    : phase === '브리칭' ? map.breachPoint
      : map.breachEntryPoint;
  attackers.forEach((operator, index) => {
    const isScout = operator.role === 'SEARCH';
    const scoutProgress = timing.searchEnd > 0 ? Math.min(1, time / timing.searchEnd) : 1;
    const scoutOut = mixPoint(map.attackerSpawn, map.windowPoint, Math.min(1, scoutProgress / 0.68));
    const scoutBack = mixPoint(map.windowPoint, map.returnPoint, Math.max(0, (scoutProgress - 0.68) / 0.32));
    const roaming = offsetAround(attackerAnchor, index, map.width * 0.018 + (operator.stats.aggression / 100) * map.width * 0.012);
    const movementWave = Math.sin(time * (0.72 + operator.stats.aggression / 280) + index * 1.7) * map.width * 0.008;
    const position = isScout && phase === '수색'
      ? (scoutProgress < 0.68 ? scoutOut : scoutBack)
      : { x: roaming.x + movementWave, y: roaming.y + Math.cos(time * 0.8 + index) * map.height * 0.006 };
    const lastAttackerLoss = result.engagements.findIndex((engagement, engagementIndex) => (
      engagementIndex < score.completed && engagement.winner === '수비' && engagement.attackerCallSign === operator.callSign
    ));
    const visible = lastAttackerLoss < 0;
    positions.set(operator.callSign, {
      operator,
      index,
      position,
      visible,
      pulse: visible ? 0.5 + 0.5 * Math.sin(time * 4 + index) : 0.1,
      eliminated: !visible,
    });
  });
  defenders.forEach((operator, index) => {
    const cover = map.covers[index % Math.max(1, map.covers.length)];
    const coverPoint = cover
      ? { x: cover.rect.x + cover.rect.width / 2, y: cover.rect.y + cover.rect.height / 2 }
      : map.defenderSpawn;
    const relocation = operator.stats.aggression > 55 ? Math.sin(time * 0.55 + index) * map.width * 0.025 : 0;
    const position = {
      x: coverPoint.x + relocation,
      y: coverPoint.y + Math.cos(time * 0.46 + index) * map.height * 0.008,
    };
    const lastDefenderLoss = result.engagements.findIndex((engagement, engagementIndex) => (
      engagementIndex < score.completed && engagement.winner === '공격' && engagement.defenderCallSign === operator.callSign
    ));
    const visible = lastDefenderLoss < 0;
    const scoutPosition = attackers.find((candidate) => candidate.role === 'SEARCH');
    const scoutMotion = scoutPosition ? positions.get(scoutPosition.callSign) : undefined;
    const sightBlocked = scoutMotion ? hasBlockedSight(scoutMotion.position, position, map) : true;
    positions.set(operator.callSign, {
      operator,
      index: index + attackers.length,
      position,
      visible: visible && (!sightBlocked || infoHigh),
      pulse: visible ? 0.5 + 0.5 * Math.sin(time * 3.6 + index * 1.3) : 0.08,
      eliminated: !visible,
    });
  });
  positions.forEach((motion) => drawOperatorToken(container, motion, scale));

  if (phase === '브리칭') {
    const shockProgress = Math.max(0, Math.min(1, (time - timing.searchEnd) / Math.max(0.1, timing.breachEnd - timing.searchEnd)));
    const shock = new Graphics();
    const shockRadius = map.width * (0.035 + shockProgress * 0.16);
    shock.circle(map.breachPoint.x, map.breachPoint.y, shockRadius).stroke({
      color: MAP_ACCENT,
      width: (3 - shockProgress * 2) / scale,
      alpha: 0.85 - shockProgress * 0.7,
    });
    shock.circle(map.breachPoint.x, map.breachPoint.y, map.width * 0.022).fill({ color: 0xfff0c6, alpha: 0.25 * (1 - shockProgress) });
    container.addChild(shock);
    for (let index = 0; index < 9; index += 1) {
      const fragment = offsetAround(map.breachPoint, index, map.width * (0.05 + shockProgress * 0.12));
      const fragmentShape = new Graphics();
      fragmentShape.circle(fragment.x, fragment.y, (1.5 + (index % 3)) / scale).fill({ color: 0xf5d59b, alpha: 0.78 * (1 - shockProgress) });
      container.addChild(fragmentShape);
    }
  }

  if (currentEngagement) {
    const attacker = positions.get(currentEngagement.attackerCallSign);
    const defender = positions.get(currentEngagement.defenderCallSign);
    if (attacker && defender) {
      const local = Math.max(0, Math.min(1, (time - (timing.engagementStarts[activeEngagementIndex] ?? time)) / 1.6));
      const flash = new Graphics();
      flash.circle(defender.position.x, defender.position.y, map.width * 0.026 * (1 + local)).fill({
        color: 0xffe9b0,
        alpha: local < 0.2 ? 0.45 : 0.12 * (1 - local),
      });
      container.addChild(flash);
      const blockedByInterior = hasBlockedSight(attacker.position, defender.position, map);
      const informationRoll = (
        Math.sin((activeEngagementIndex + 1) * 24.17 + result.informationAmount * 13.9) + 1
      ) / 2;
      const hasWallshot = infoHigh && blockedByInterior && informationRoll < result.informationAmount;
      const routeMid = hasWallshot
        ? mixPoint(attacker.position, defender.position, 0.5)
        : map.doorGap.from;
      const bullet = new Graphics();
      if (hasWallshot) {
        const shotStart = mixPoint(attacker.position, defender.position, Math.max(0, local - 0.22));
        const shotEnd = mixPoint(attacker.position, defender.position, Math.min(1, local + 0.2));
        drawLine(bullet, shotStart, shotEnd, 0xfff2c2, 2.1 / scale, 0.86);
        drawLine(bullet, mixPoint(shotStart, attacker.position, 0.12), shotStart, 0x8ef0df, 1 / scale, 0.55);
      } else {
        const shotStart = mixPoint(attacker.position, routeMid, Math.max(0, local - 0.2));
        const shotEnd = mixPoint(routeMid, defender.position, Math.min(1, local + 0.12));
        drawLine(bullet, shotStart, shotEnd, 0xfff2c2, 1.8 / scale, 0.85);
        drawLine(bullet, attacker.position, shotStart, 0x8ef0df, 0.9 / scale, 0.42);
      }
      container.addChild(bullet);
      const impact = new Graphics();
      impact.circle(defender.position.x, defender.position.y, map.width * 0.012).stroke({
        color: currentEngagement.winner === '공격' ? ATTACKER_COLOR : DEFENDER_COLOR,
        width: 1.4 / scale,
        alpha: 0.8 * (1 - local),
      });
      container.addChild(impact);
    }
  }

  if (infoHigh && phase === '교전' && activeEngagementIndex >= 0 && activeEngagementIndex % 2 === 1) {
    const route = new Graphics();
    const start = map.breachEntryPoint;
    const door = map.doorGap.from;
    const end = map.objectiveZone;
    drawLine(route, start, door, MAP_ACCENT, 1 / scale, 0.25);
    drawLine(route, door, { x: end.x, y: end.y + end.height / 2 }, MAP_ACCENT, 1 / scale, 0.25);
    container.addChild(route);
  }
}

/** 시간을 분초 표기로 바꿉니다. */
function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
}

/** Pixi 캔버스와 중계 타이머를 연결합니다. */
export function TacticalRoundReplay({ result, operators = OPERATORS }: TacticalRoundReplayProps): ReactElement {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef(0);
  const rateRef = useRef(1);
  const pausedRef = useRef(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [eventLog, setEventLog] = useState<ReplayEvent[]>([]);
  const autoSlowRef = useRef(false);
  const timing = useMemo(() => createReplayTiming(result), [result]);
  const rosters = useMemo(() => deriveRosters(result, operators), [result, operators]);
  const events = useMemo(() => buildReplayEvents(result, timing), [result, timing]);
  const phase = getReplayPhase(playbackTime, timing);
  const score = deriveScore(result, playbackTime, timing, rosters.attackers.length, rosters.defenders.length);
  const currentEvent = events.filter((event) => event.time <= playbackTime).at(-1);
  const autoSlow = events.some((event) => (
    event.time <= playbackTime && playbackTime - event.time < 1.2
    && (event.headline === '주도권 판단' || event.headline === '고립 판단')
  )) || (result.engagements.length > 0 && playbackTime >= timing.engagementStarts.at(-1)! - 0.25 && playbackTime < timing.resultStart);

  // 중요 순간 감속 여부를 Pixi 프레임 루프에 전달합니다.
  useEffect(() => {
    autoSlowRef.current = autoSlow;
  }, [autoSlow]);

  // 재생 시간이 바뀔 때 이벤트 로그를 순서대로 공개합니다.
  useEffect(() => {
    setEventLog(events.filter((event) => event.time <= playbackTime));
  }, [events, playbackTime]);

  // 선택한 재생 속도와 일시정지 상태를 Pixi 루프가 읽도록 보관합니다.
  useEffect(() => {
    playbackRef.current = playbackTime;
    rateRef.current = playbackRate;
    pausedRef.current = paused;
  }, [paused, playbackRate, playbackTime]);

  // Pixi 장면을 생성하고 프레임별 이동과 사격을 그립니다.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let application: any;
    let animationFrame: number | undefined;
    const mapLayer = new Container();
    const dynamicLayer = new Container();

    // 호스트 크기에 맞춰 Pixi 월드의 화면 비율을 맞춥니다.
    const resizeScene = (): void => {
      if (!application?.renderer) return;
      const width = Math.max(320, host.clientWidth);
      const height = Math.max(220, host.clientHeight);
      application.renderer.resize(width, height);
      const scale = Math.min(width / BREACHLINE_MAP.width, height / BREACHLINE_MAP.height);
      const world = application.stage.getChildByName('tactical-world') as Container | undefined;
      if (world) {
        world.scale.set(scale);
        world.x = (width - BREACHLINE_MAP.width * scale) / 2;
        world.y = (height - BREACHLINE_MAP.height * scale) / 2;
      }
    };

    // 현재 시각에 맞춰 화면 상태와 React 이벤트 로그를 진전시킵니다.
    const frame = (now: number): void => {
      if (disposed || !application) return;
      const last = Number(application.__lastFrame ?? now);
      const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
      application.__lastFrame = now;
      if (!pausedRef.current) {
        const effectiveRate = autoSlowRef.current ? Math.min(rateRef.current, 0.42) : rateRef.current;
        playbackRef.current = Math.min(timing.duration, playbackRef.current + delta * effectiveRate);
        setPlaybackTime(playbackRef.current);
        if (playbackRef.current >= timing.duration) {
          pausedRef.current = true;
          setPaused(true);
        }
      }
      const world = application.stage.getChildByName('tactical-world') as Container | undefined;
      const scale = world?.scale.x ?? 1;
      renderDynamicLayer(
        dynamicLayer,
        result,
        BREACHLINE_MAP,
        timing,
        playbackRef.current,
        scale,
        rosters.attackers,
        rosters.defenders,
      );
      animationFrame = requestAnimationFrame(frame);
    };

    // Pixi 애플리케이션을 비동기로 초기화합니다.
    const initialize = async (): Promise<void> => {
      application = new Application();
      await application.init({
        background: MAP_BACKGROUND,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
      });
      if (disposed) {
        application.destroy(true);
        return;
      }
      const canvas = application.canvas ?? application.view;
      host.appendChild(canvas);
      const world = new Container();
      world.label = 'tactical-world';
      world.name = 'tactical-world';
      mapLayer.name = 'map-layer';
      dynamicLayer.name = 'dynamic-layer';
      world.addChild(mapLayer, dynamicLayer);
      application.stage.addChild(world);
      drawMapLayer(mapLayer, BREACHLINE_MAP, 1);
      resizeScene();
      const observer = new ResizeObserver(resizeScene);
      observer.observe(host);
      application.__resizeObserver = observer;
      application.__lastFrame = performance.now();
      animationFrame = requestAnimationFrame(frame);
    };
    void initialize();
    return () => {
      disposed = true;
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      application?.__resizeObserver?.disconnect();
      application?.destroy(true);
      host.replaceChildren();
    };
  }, [result, rosters.attackers, rosters.defenders, timing]);

  // 재생 버튼으로 타임라인을 시작하거나 멈춥니다.
  const togglePlayback = (): void => {
    if (playbackTime >= timing.duration) {
      playbackRef.current = 0;
      setPlaybackTime(0);
    }
    setPaused((current) => !current);
  };

  // 중계 배속을 선택하고 즉시 Pixi 루프에 반영합니다.
  const changeRate = (rate: number): void => {
    rateRef.current = rate;
    setPlaybackRate(rate);
  };

  // 타임라인을 클릭한 위치로 이동합니다.
  const seekPlayback = (value: string): void => {
    const nextTime = Number(value);
    playbackRef.current = nextTime;
    setPlaybackTime(nextTime);
  };

  return (
    <section className="tactical-replay" aria-label="전술 FPS 라운드 중계">
      <header className="tactical-replay-header">
        <div>
          <p className="tactical-eyebrow">LIVE ROUND READOUT / 07</p>
          <h1>소리의 방향이 각도를 바꾼다</h1>
          <p className="tactical-subtitle">BREACHLINE · 중앙 격벽 · 감독실 중계 시점</p>
        </div>
        <div className="tactical-live-indicator">
          <span className={paused ? 'is-paused' : ''} />
          {paused ? '일시정지' : '실시간 중계'}
        </div>
      </header>

      <div className="tactical-statusbar">
        <div className="tactical-clock-block">
          <span>남은 실행 시간</span>
          <strong>{formatClock(result.executionTime * (1 - playbackTime / timing.duration))}</strong>
        </div>
        <div className="tactical-phase-track" aria-label="라운드 단계">
          {REPLAY_PHASES.map((item) => (
            <span key={item} className={item === phase ? 'is-current' : ''}>{item}</span>
          ))}
        </div>
        <div className="tactical-score">
          <strong className="attack-score">{score.attackers}</strong>
          <span>공격 생존</span>
          <i>:</i>
          <strong className="defend-score">{score.defenders}</strong>
          <span>수비 생존</span>
        </div>
      </div>

      <div className="tactical-replay-grid">
        <div className="tactical-map-panel">
          <div className="tactical-map-heading">
            <div>
              <span className="tactical-panel-label">TACTICAL EYE / {phase}</span>
              <h2>{BREACHLINE_MAP.name}</h2>
            </div>
            <span className="tactical-map-readout">
              INFO {(result.informationAmount * 100).toFixed(0)}% · {autoSlow ? '중요 순간 자동 감속' : '정상 속도'}
            </span>
          </div>
          <div ref={canvasHostRef} className="tactical-pixi-host" />
          <div className="tactical-map-footer">
            <span><i className="attacker-key" />공격 이동</span>
            <span><i className="defender-key" />수비 각</span>
            <span><i className="sight-key" />역할 링</span>
            <span className="tactical-map-hint">선분 교차 시야 · 문틈 기준</span>
          </div>
        </div>

        <aside className="tactical-log-panel">
          <div className="tactical-log-heading">
            <div>
              <span className="tactical-panel-label">DIRECTOR'S LOG</span>
              <h2>판단과 소리</h2>
            </div>
            <span>{eventLog.length.toString().padStart(2, '0')} / {events.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="tactical-event-list">
            {eventLog.length === 0 ? (
              <div className="tactical-empty-log">
                <span className="tactical-signal-line" />
                <p>창문 쪽으로 선발조가 움직입니다.</p>
                <small>소리의 첫 방향을 기다리는 중</small>
              </div>
            ) : eventLog.map((event) => (
              <article key={event.id} className={`tactical-event tactical-event-${event.accent} ${event.id === eventLog.at(-1)?.id ? 'is-latest' : ''}`}>
                <div className="tactical-event-meta">
                  <time>{formatClock(event.time)}</time>
                  <span>{event.kind}</span>
                </div>
                <strong>{event.headline}</strong>
                <p>{event.detail}</p>
              </article>
            ))}
          </div>
          <div className="tactical-current-call">
            <span>현재 중계</span>
            <strong>{currentEvent?.headline ?? '창문 접근음'}</strong>
            <small>{currentEvent?.detail ?? '선발조가 짧게 멈춰 내부 반향을 듣습니다.'}</small>
          </div>
        </aside>
      </div>

      <div className="tactical-controls">
        <div className="tactical-control-main">
          <button type="button" className="tactical-play-button" onClick={togglePlayback}>
            {paused ? '재생' : '일시정지'}
          </button>
          <div className="tactical-progress-wrap">
            <div className="tactical-progress-label">
              <span>{formatClock(playbackTime)}</span>
              <span>{formatClock(timing.duration)}</span>
            </div>
            <input
              aria-label="라운드 재생 위치"
              type="range"
              min="0"
              max={timing.duration}
              step="0.1"
              value={playbackTime}
              onChange={(event) => seekPlayback(event.target.value)}
            />
          </div>
        </div>
        <div className="tactical-speed-control">
          <span>배속</span>
          {[0.5, 1, 2, 4].map((rate) => (
            <button
              key={rate}
              type="button"
              className={playbackRate === rate ? 'is-active' : ''}
              onClick={() => changeRate(rate)}
            >
              {rate}x
            </button>
          ))}
        </div>
        <div className="tactical-result-stamp">
          <span>ROUND RESULT</span>
          <strong>{result.attackersWon ? '공격 승리' : '수비 승리'}</strong>
          <small>{result.attackerSurvivors} — {result.defenderSurvivors} 생존</small>
        </div>
      </div>
    </section>
  );
}