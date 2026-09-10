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

export interface TacticalRoute {
  id: string;
  label: string;
  points: TacticalPoint[];
}

export interface DefenderSetup {
  id: string;
  label: string;
  position: TacticalPoint;
  fallback: TacticalPoint;
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
  attackerRoutes: TacticalRoute[];
  defenderSetups: DefenderSetup[];
  searchPoints: TacticalPoint[];
}

/** 외곽 진입로와 내부 방·복도를 가진 전술 FPS 경기장을 정의합니다. */
export const BREACHLINE_MAP: TacticalMapDefinition = {
  id: 'breachline-01',
  name: 'BREACHLINE / 북부 연구동',
  width: 1600,
  height: 1000,
  building: { x: 300, y: 120, width: 1000, height: 760 },
  entryHall: { x: 300, y: 300, width: 390, height: 440 },
  objectiveZone: { x: 920, y: 300, width: 320, height: 400 },
  breachPoint: { x: 250, y: 520 },
  breachEntryPoint: { x: 330, y: 520 },
  windowPoint: { x: 340, y: 220 },
  attackerSpawn: { x: 120, y: 520 },
  defenderSpawn: { x: 1120, y: 500 },
  returnPoint: { x: 180, y: 820 },
  doorGap: {
    from: { x: 690, y: 480 },
    to: { x: 690, y: 540 },
  },
  walls: [
    { id: 'outer-top', from: { x: 300, y: 120 }, to: { x: 1300, y: 120 }, kind: 'outer' },
    { id: 'outer-right', from: { x: 1300, y: 120 }, to: { x: 1300, y: 880 }, kind: 'outer' },
    { id: 'outer-bottom', from: { x: 1300, y: 880 }, to: { x: 300, y: 880 }, kind: 'outer' },
    { id: 'outer-left-north', from: { x: 300, y: 120 }, to: { x: 300, y: 200 }, kind: 'outer' },
    { id: 'outer-left-upper', from: { x: 300, y: 260 }, to: { x: 300, y: 340 }, kind: 'outer' },
    { id: 'outer-left-center', from: { x: 300, y: 400 }, to: { x: 300, y: 480 }, kind: 'outer' },
    { id: 'outer-left-lower', from: { x: 300, y: 540 }, to: { x: 300, y: 620 }, kind: 'outer' },
    { id: 'outer-left-south', from: { x: 300, y: 680 }, to: { x: 300, y: 760 }, kind: 'outer' },
    { id: 'outer-left-bottom', from: { x: 300, y: 820 }, to: { x: 300, y: 880 }, kind: 'outer' },
    { id: 'central-split-north', from: { x: 690, y: 120 }, to: { x: 690, y: 200 }, kind: 'interior' },
    { id: 'central-split-upper', from: { x: 690, y: 260 }, to: { x: 690, y: 340 }, kind: 'interior' },
    { id: 'central-split-center', from: { x: 690, y: 400 }, to: { x: 690, y: 480 }, kind: 'interior' },
    { id: 'central-split-lower', from: { x: 690, y: 540 }, to: { x: 690, y: 620 }, kind: 'interior' },
    { id: 'central-split-south', from: { x: 690, y: 680 }, to: { x: 690, y: 760 }, kind: 'interior' },
    { id: 'central-split-bottom', from: { x: 690, y: 820 }, to: { x: 690, y: 880 }, kind: 'interior' },
    { id: 'door-gap', from: { x: 690, y: 430 }, to: { x: 690, y: 570 }, kind: 'door-gap' },
    { id: 'north-room', from: { x: 690, y: 300 }, to: { x: 920, y: 300 }, kind: 'interior' },
    { id: 'north-room-side', from: { x: 920, y: 300 }, to: { x: 920, y: 210 }, kind: 'interior' },
    { id: 'south-room', from: { x: 690, y: 700 }, to: { x: 920, y: 700 }, kind: 'interior' },
    { id: 'east-partition', from: { x: 1240, y: 120 }, to: { x: 1240, y: 300 }, kind: 'interior' },
    { id: 'east-partition-bottom', from: { x: 1240, y: 700 }, to: { x: 1240, y: 880 }, kind: 'interior' },
  ],
  covers: [
    { id: 'cover-a', label: '북쪽 책장', rect: { x: 430, y: 190, width: 150, height: 38 } },
    { id: 'cover-b', label: '북쪽 서버 랙', rect: { x: 1010, y: 180, width: 52, height: 150 } },
    { id: 'cover-c', label: '중앙 콘크리트', rect: { x: 790, y: 420, width: 48, height: 170 } },
    { id: 'cover-d', label: '관제 책상', rect: { x: 970, y: 430, width: 180, height: 42 } },
    { id: 'cover-e', label: '남쪽 캐비닛', rect: { x: 420, y: 750, width: 180, height: 38 } },
    { id: 'cover-f', label: '남쪽 장비', rect: { x: 1030, y: 730, width: 58, height: 120 } },
    { id: 'cover-g', label: '목표 엄폐', rect: { x: 1140, y: 500, width: 48, height: 150 } },
    { id: 'cover-h', label: '복도 바리케이드', rect: { x: 560, y: 470, width: 80, height: 30 } },
  ],
  attackerRoutes: [
    { id: 'north', label: '북쪽 사무실 진입', points: [{ x: 120, y: 230 }, { x: 260, y: 230 }, { x: 400, y: 230 }, { x: 640, y: 230 }, { x: 790, y: 230 }] },
    { id: 'upper', label: '상부 복도 진입', points: [{ x: 120, y: 370 }, { x: 260, y: 370 }, { x: 430, y: 370 }, { x: 640, y: 370 }, { x: 790, y: 390 }] },
    { id: 'center', label: '중앙 문 진입', points: [{ x: 120, y: 510 }, { x: 260, y: 510 }, { x: 420, y: 510 }, { x: 640, y: 530 }, { x: 870, y: 520 }] },
    { id: 'lower', label: '하부 복도 진입', points: [{ x: 120, y: 650 }, { x: 260, y: 650 }, { x: 430, y: 650 }, { x: 640, y: 650 }, { x: 790, y: 650 }] },
    { id: 'south', label: '남쪽 서비스 진입', points: [{ x: 120, y: 790 }, { x: 260, y: 790 }, { x: 390, y: 790 }, { x: 640, y: 790 }, { x: 790, y: 790 }] },
  ],
  defenderSetups: [
    { id: 'north-watch', label: '북쪽 방 감시', position: { x: 1150, y: 220 }, fallback: { x: 1180, y: 360 } },
    { id: 'upper-cross', label: '상부 교차각', position: { x: 1000, y: 360 }, fallback: { x: 1080, y: 410 } },
    { id: 'site-left', label: '목표 좌측', position: { x: 950, y: 540 }, fallback: { x: 1040, y: 560 } },
    { id: 'site-right', label: '목표 우측', position: { x: 1220, y: 560 }, fallback: { x: 1160, y: 650 } },
    { id: 'south-watch', label: '남쪽 출구 감시', position: { x: 1120, y: 790 }, fallback: { x: 950, y: 720 } },
  ],
  searchPoints: [{ x: 850, y: 360 }, { x: 850, y: 510 }, { x: 850, y: 650 }],
};