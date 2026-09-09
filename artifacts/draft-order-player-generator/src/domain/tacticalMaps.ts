/**
 * 전술 FPS 지도 지형과 전술 지점을 데이터로 보관해 렌더러와 판정 표현을 분리합니다.
 */

export interface TacticalPoint {
  x: number;
  y: number;
}

export interface TacticalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TacticalWall {
  id: string;
  from: TacticalPoint;
  to: TacticalPoint;
  kind: 'outer' | 'interior' | 'door-gap';
}

export interface TacticalCover {
  id: string;
  label: string;
  rect: TacticalRect;
}

export interface TacticalMapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  building: TacticalRect;
  entryHall: TacticalRect;
  objectiveZone: TacticalRect;
  breachPoint: TacticalPoint;
  breachEntryPoint: TacticalPoint;
  windowPoint: TacticalPoint;
  attackerSpawn: TacticalPoint;
  defenderSpawn: TacticalPoint;
  returnPoint: TacticalPoint;
  doorGap: { from: TacticalPoint; to: TacticalPoint };
  walls: TacticalWall[];
  covers: TacticalCover[];
}

/** 직사각형 건물과 중앙 목표 구역을 가진 첫 번째 전술 지도를 정의합니다. */
export const BREACHLINE_MAP: TacticalMapDefinition = {
  id: 'breachline-01',
  name: 'BREACHLINE / 중앙 격벽',
  width: 1000,
  height: 700,
  building: { x: 220, y: 110, width: 620, height: 480 },
  entryHall: { x: 220, y: 110, width: 300, height: 480 },
  objectiveZone: { x: 520, y: 110, width: 320, height: 480 },
  breachPoint: { x: 145, y: 370 },
  breachEntryPoint: { x: 250, y: 370 },
  windowPoint: { x: 775, y: 145 },
  attackerSpawn: { x: 85, y: 370 },
  defenderSpawn: { x: 750, y: 535 },
  returnPoint: { x: 175, y: 585 },
  doorGap: {
    from: { x: 520, y: 315 },
    to: { x: 520, y: 385 },
  },
  walls: [
    { id: 'outer-top', from: { x: 220, y: 110 }, to: { x: 840, y: 110 }, kind: 'outer' },
    { id: 'outer-right', from: { x: 840, y: 110 }, to: { x: 840, y: 590 }, kind: 'outer' },
    { id: 'outer-bottom', from: { x: 840, y: 590 }, to: { x: 220, y: 590 }, kind: 'outer' },
    { id: 'outer-left-top', from: { x: 220, y: 110 }, to: { x: 220, y: 325 }, kind: 'outer' },
    { id: 'outer-left-bottom', from: { x: 220, y: 415 }, to: { x: 220, y: 590 }, kind: 'outer' },
    { id: 'inner-top', from: { x: 520, y: 110 }, to: { x: 520, y: 315 }, kind: 'interior' },
    { id: 'inner-bottom', from: { x: 520, y: 385 }, to: { x: 520, y: 590 }, kind: 'interior' },
    { id: 'door-gap', from: { x: 520, y: 315 }, to: { x: 520, y: 385 }, kind: 'door-gap' },
  ],
  covers: [
    { id: 'cover-a', label: '목재 엄폐', rect: { x: 610, y: 205, width: 92, height: 30 } },
    { id: 'cover-b', label: '콘크리트 엄폐', rect: { x: 720, y: 300, width: 36, height: 112 } },
    { id: 'cover-c', label: '낮은 캐비닛', rect: { x: 570, y: 465, width: 118, height: 28 } },
    { id: 'cover-d', label: '서버 랙', rect: { x: 755, y: 470, width: 42, height: 72 } },
  ],
};