/**
 * 전술 FPS 지도 지형과 전술 지점을 데이터로 보관해 렌더러와 판정 표현을 분리합니다.
 * 좌표는 게임용 월드 단위이며 실제 건물 고증값이 아닙니다.
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
  breachable?: boolean;
  reinforced?: boolean;
}

export interface TacticalCover {
  id: string;
  label: string;
  rect: TacticalRect;
  kind?: 'shield' | 'truck' | 'partition';
}

export interface TacticalRoute {
  id: string;
  label: string;
  points: TacticalPoint[];
  loopId?: string;
}

export interface DefenderSetup {
  id: string;
  label: string;
  position: TacticalPoint;
  fallback: TacticalPoint;
}

export interface TacticalRoom {
  id: string;
  label: string;
  rect: TacticalRect;
  kind: 'room' | 'corridor' | 'yard';
  preferredEngagementDistance?: number;
}

export interface TacticalPortal {
  id: string;
  label: string;
  center: TacticalPoint;
  width: number;
  axis: 'horizontal' | 'vertical';
  traversal?: 'window' | 'vault' | 'crawl';
  fromRoom: string;
  toRoom: string;
}

export interface TacticalEntrance extends TacticalPortal {
  outside: TacticalPoint;
  inside: TacticalPoint;
}

export interface TacticalSite {
  id: 'A' | 'B';
  label: string;
  roomId: string;
  bounds: TacticalRect;
  center: TacticalPoint;
  plantAnchors: TacticalPoint[];
  defendAnchors: TacticalPoint[];
}

export interface TacticalLoop {
  id: string;
  label: string;
  routeIds: string[];
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
  rooms: TacticalRoom[];
  portals: TacticalPortal[];
  entrances: TacticalEntrance[];
  sites: TacticalSite[];
  loops: TacticalLoop[];
}

/** 점 좌표를 간결하게 정의합니다. */
const p = (x: number, y: number): TacticalPoint => ({ x, y });
/** 방과 엄폐의 공통 사각형을 정의합니다. */
const rect = (x: number, y: number, width: number, height: number): TacticalRect => ({ x, y, width, height });
/** 시각과 충돌이 공유할 벽 선분을 정의합니다. */
const wall = (id: string, from: TacticalPoint, to: TacticalPoint, kind: TacticalWall['kind'] = 'interior'): TacticalWall =>
  ({ id, from, to, kind, breachable: kind === 'interior' && !id.includes('boundary-control') });

/** 약 3600×2400 월드의 단층 연구시설. 방·문·벽 좌표는 같은 데이터에서 렌더링과 충돌에 사용합니다. */
export const BREACHLINE_MAP: TacticalMapDefinition = {
  id: 'breachline-02',
  name: 'BREACHLINE / 북부 연구동',
  width: 3600,
  height: 2400,
  building: rect(400, 300, 2800, 1800),
  entryHall: rect(500, 420, 500, 500),
  objectiveZone: rect(2360, 1050, 560, 300),
  breachPoint: p(200, 1040),
  breachEntryPoint: p(420, 1040),
  windowPoint: p(900, 180),
  attackerSpawn: p(200, 1040),
  defenderSpawn: p(2700, 640),
  returnPoint: p(700, 2280),
  doorGap: { from: p(820, 1000), to: p(900, 1000) },
  rooms: [
    { id: 'north-approach', label: '북쪽 외곽 접근로', rect: rect(80, 40, 3040, 220), kind: 'yard' },
    { id: 'west-gate', label: '서문 광장', rect: rect(80, 900, 320, 280), kind: 'yard' },
    { id: 'admin-lobby', label: '행정 로비', rect: rect(500, 420, 500, 500), kind: 'room' },
    { id: 'office-north', label: '북측 사무실', rect: rect(1040, 420, 560, 500), kind: 'room' },
    { id: 'server-lab', label: '서버 실험실', rect: rect(1640, 420, 560, 500), kind: 'room' },
    { id: 'control-room', label: '관제 통제실', rect: rect(2240, 420, 760, 500), kind: 'room' },
    { id: 'central-atrium', label: '중앙 아트리움', rect: rect(500, 1000, 1720, 400), kind: 'corridor', preferredEngagementDistance:480 },
    { id: 'objective-a-hall', label: 'A 연구동 홀', rect: rect(2240, 1000, 760, 400), kind: 'room' },
    { id: 'maintenance', label: '설비 유지보수실', rect: rect(500, 1400, 560, 500), kind: 'room' },
    { id: 'south-service', label: '남측 서비스실', rect: rect(1060, 1400, 560, 500), kind: 'room' },
    { id: 'objective-b-hall', label: 'B 냉각동 홀', rect: rect(1620, 1400, 620, 500), kind: 'room' },
    { id: 'loading-bay', label: '남쪽 적재장', rect: rect(2240, 1400, 760, 500), kind: 'room' },
    { id: 'south-approach', label: '남쪽 외곽 접근로', rect: rect(80, 2140, 3040, 220), kind: 'yard' },
    { id: 'east-courtyard', label: '동쪽 중정', rect: rect(3200, 900, 320, 720), kind: 'yard' },
  ],
  portals: [
    { id: 'portal-maintenance-hatch', traversal: 'crawl', label: '유지보수 낮은 통로', center: p(700,2100), width: 70, axis: 'horizontal', fromRoom: 'south-approach', toRoom: 'maintenance' },
    { id: 'portal-north-window', traversal: 'window', label: '북측 창고 창문', center: p(900, 300), width: 120, axis: 'horizontal', fromRoom: 'north-approach', toRoom: 'admin-lobby' },
    { id: 'portal-west-gate', label: '서문 게이트', center: p(400, 1040), width: 80, axis: 'vertical', fromRoom: 'west-gate', toRoom: 'central-atrium' },
    { id: 'portal-south-dock', traversal: 'vault', label: '남쪽 적재문', center: p(2360, 2100), width: 90, axis: 'horizontal', fromRoom: 'south-approach', toRoom: 'loading-bay' },
    { id: 'portal-east-service', label: '동쪽 서비스문', center: p(3200, 1600), width: 80, axis: 'vertical', fromRoom: 'east-courtyard', toRoom: 'loading-bay' },
    { id: 'portal-lobby-atrium', label: '로비 중앙문', center: p(860, 1000), width: 80, axis: 'horizontal', fromRoom: 'admin-lobby', toRoom: 'central-atrium' },
    { id: 'portal-office-atrium', label: '사무실 복도문', center: p(1480, 1000), width: 80, axis: 'horizontal', fromRoom: 'office-north', toRoom: 'central-atrium' },
    { id: 'portal-server-atrium', label: '서버 복도문', center: p(2080, 1000), width: 80, axis: 'horizontal', fromRoom: 'server-lab', toRoom: 'central-atrium' },
    { id: 'portal-control-a', label: '관제 A 연결문', center: p(2640, 1000), width: 80, axis: 'horizontal', fromRoom: 'control-room', toRoom: 'objective-a-hall' },
    { id: 'portal-maintenance-south', label: '유지보수 남문', center: p(860, 1400), width: 80, axis: 'horizontal', fromRoom: 'central-atrium', toRoom: 'maintenance' },
    { id: 'portal-service-south', label: '서비스 남문', center: p(1340, 1400), width: 80, axis: 'horizontal', fromRoom: 'central-atrium', toRoom: 'south-service' },
    { id: 'portal-b-hall', label: 'B 홀 연결문', center: p(1940, 1400), width: 80, axis: 'horizontal', fromRoom: 'central-atrium', toRoom: 'objective-b-hall' },
    { id: 'portal-loading-south', label: '적재장 연결문', center: p(2640, 1400), width: 80, axis: 'horizontal', fromRoom: 'central-atrium', toRoom: 'loading-bay' },
    { id: 'portal-office-server', label: '실험동 내부문', center: p(1640, 650), width: 90, axis: 'vertical', fromRoom: 'office-north', toRoom: 'server-lab' },
    { id: 'portal-server-control', label: '관제 내부문', center: p(2240, 820), width: 90, axis: 'vertical', fromRoom: 'server-lab', toRoom: 'control-room' },
    { id: 'portal-maintenance-service', label: '남측 내부문', center: p(1060, 1740), width: 80, axis: 'vertical', fromRoom: 'maintenance', toRoom: 'south-service' },
    { id: 'portal-service-b', label: '냉각동 내부문', center: p(1620, 1540), width: 80, axis: 'vertical', fromRoom: 'south-service', toRoom: 'objective-b-hall' },
    { id: 'portal-b-loading', label: '적재장 내부문', center: p(2240, 1840), width: 80, axis: 'vertical', fromRoom: 'objective-b-hall', toRoom: 'loading-bay' },
  ],
  entrances: [
    { id: 'entrance-north', label: '북측 창문 진입', center: p(900, 300), width: 120, axis: 'horizontal', fromRoom: 'north-approach', toRoom: 'admin-lobby', outside: p(900, 180), inside: p(900, 420) },
    { id: 'entrance-west', label: '서문 정문 진입', center: p(400, 1040), width: 80, axis: 'vertical', fromRoom: 'west-gate', toRoom: 'central-atrium', outside: p(260, 1040), inside: p(520, 1040) },
    { id: 'entrance-south', label: '남쪽 적재장 진입', center: p(2360, 2100), width: 90, axis: 'horizontal', fromRoom: 'south-approach', toRoom: 'loading-bay', outside: p(2360, 2240), inside: p(2360, 1960) },
    { id: 'entrance-east', label: '동쪽 서비스 진입', center: p(3200, 1600), width: 80, axis: 'vertical', fromRoom: 'east-courtyard', toRoom: 'loading-bay', outside: p(3340, 1600), inside: p(3060, 1600) },
    { id: 'entrance-maintenance', label: '남서 유지보수 해치', center: p(700, 2100), width: 70, axis: 'horizontal', fromRoom: 'south-approach', toRoom: 'maintenance', outside: p(700, 2240), inside: p(700, 1960) },
  ],
  sites: [
    {
      id: 'A', label: 'A 사이트 · 관제 데이터', roomId: 'objective-a-hall',
      bounds: rect(2360, 1050, 560, 300), center: p(2640, 1200),
      plantAnchors: [p(2480, 1160), p(2750, 1210)], defendAnchors: [p(2460, 1280), p(2820, 1120), p(2700, 1280), p(2350, 1190), p(2900, 1150)],
    },
    {
      id: 'B', label: 'B 사이트 · 냉각 코어', roomId: 'objective-b-hall',
      bounds: rect(1700, 1460, 500, 360), center: p(1950, 1640),
      plantAnchors: [p(1830, 1580), p(2090, 1720)], defendAnchors: [p(1800, 1760), p(2120, 1510), p(1740, 1680), p(2180, 1660), p(2050, 1870)],
    },
  ],
  loops: [
    { id: 'inner-loop', label: '내부 연구동 순환로', routeIds: ['inner-north', 'inner-south', 'b-cross'] },
    { id: 'outer-loop', label: '외곽 접근 순환로', routeIds: ['outer-north', 'outer-south', 'east-service'] },
  ],
  walls: [
    wall('outer-top-west', p(400, 300), p(840, 300), 'outer'),
    wall('outer-top-east', p(960, 300), p(2640, 300), 'outer'),
    {...wall('outer-soft-north', p(2640, 300), p(2860, 300), 'outer'),breachable:true},
    wall('outer-top-corner', p(2860, 300), p(3200, 300), 'outer'),
    wall('outer-right-north', p(3200, 300), p(3200, 1100), 'outer'),
    {...wall('outer-soft-east', p(3200,1100),p(3200,1320),'outer'),breachable:true},
    wall('outer-right-middle',p(3200,1320),p(3200,1560),'outer'),
    wall('outer-right-south', p(3200, 1640), p(3200, 2100), 'outer'),
    wall('outer-bottom-west', p(400, 2100), p(665, 2100), 'outer'),
    wall('maintenance-hatch-gap', p(665, 2100), p(735, 2100), 'door-gap'),
    wall('outer-bottom-middle', p(735, 2100), p(2315, 2100), 'outer'),
    wall('outer-bottom-east', p(2405, 2100), p(3200, 2100), 'outer'),
    wall('outer-left-north', p(400, 300), p(400, 1000), 'outer'),
    wall('outer-left-south', p(400, 1080), p(400, 2100), 'outer'),
    wall('north-window-gap', p(840, 300), p(960, 300), 'door-gap'),
    wall('west-gate-gap', p(400, 1000), p(400, 1080), 'door-gap'),
    wall('south-dock-gap', p(2315, 2100), p(2405, 2100), 'door-gap'),
    wall('east-service-gap', p(3200, 1560), p(3200, 1640), 'door-gap'),
    wall('north-admin-office', p(1040, 300), p(1040, 650)),
    wall('north-admin-office-gap', p(1040, 650), p(1040, 740), 'door-gap'),
    wall('north-admin-office-south', p(1040, 740), p(1040, 1000)),
    wall('north-office-server', p(1640, 300), p(1640, 605)),
    wall('north-office-server-gap', p(1640, 605), p(1640, 695), 'door-gap'),
    wall('north-office-server-south', p(1640, 695), p(1640, 1000)),
    wall('north-server-control', p(2240, 300), p(2240, 775)),
    wall('north-server-control-gap', p(2240, 775), p(2240, 865), 'door-gap'),
    wall('north-server-control-south', p(2240, 865), p(2240, 1000)),
    wall('north-south-boundary-west', p(500, 1000), p(820, 1000)),
    wall('north-south-boundary-lobby-gap', p(820, 1000), p(900, 1000), 'door-gap'),
    wall('north-south-boundary-middle', p(900, 1000), p(1440, 1000)),
    wall('north-south-boundary-office-gap', p(1440, 1000), p(1520, 1000), 'door-gap'),
    wall('north-south-boundary-server', p(1520, 1000), p(2040, 1000)),
    wall('north-south-boundary-server-gap', p(2040, 1000), p(2120, 1000), 'door-gap'),
    wall('north-south-boundary-right', p(2120, 1000), p(2600, 1000)),
    wall('north-south-boundary-a-gap', p(2600, 1000), p(2680, 1000), 'door-gap'),
    wall('north-south-boundary-control', p(2680, 1000), p(3000, 1000)),
    wall('south-boundary-west', p(500, 1400), p(820, 1400)),
    wall('south-boundary-maintenance-gap', p(820, 1400), p(900, 1400), 'door-gap'),
    wall('south-boundary-service', p(900, 1400), p(1300, 1400)),
    wall('south-boundary-service-gap', p(1300, 1400), p(1380, 1400), 'door-gap'),
    wall('south-boundary-b', p(1380, 1400), p(1900, 1400)),
    wall('south-boundary-b-gap', p(1900, 1400), p(1980, 1400), 'door-gap'),
    wall('south-boundary-loading', p(1980, 1400), p(2600, 1400)),
    wall('south-boundary-loading-gap', p(2600, 1400), p(2680, 1400), 'door-gap'),
    wall('south-boundary-east', p(2680, 1400), p(3000, 1400)),
    wall('south-maintenance-service-vertical', p(1060, 1400), p(1060, 1700)),
    wall('south-maintenance-service-gap', p(1060, 1700), p(1060, 1780), 'door-gap'),
    wall('south-maintenance-service-bottom', p(1060, 1780), p(1060, 1900)),
    wall('south-service-b-vertical', p(1620, 1400), p(1620, 1500)),
    wall('south-service-b-gap', p(1620, 1500), p(1620, 1580), 'door-gap'),
    wall('south-service-b-bottom', p(1620, 1580), p(1620, 1900)),
    wall('south-b-loading-vertical', p(2240, 1400), p(2240, 1800)),
    wall('south-b-loading-gap', p(2240, 1800), p(2240, 1880), 'door-gap'),
    wall('south-b-loading-bottom', p(2240, 1880), p(2240, 1900)),
  ],
  covers: [
    // 실제 차체와 교차 차폐판이 사선을 끊습니다. 보이지 않는 무적·굴곡은 사용하지 않습니다.
    {id:'spawn-north-truck',label:'북측 접근 차폐 트럭',kind:'truck',rect:rect(750,240,160,45)},
    {id:'spawn-west-truck',label:'서측 접근 차폐 트럭',kind:'truck',rect:rect(300,925,42,240)},
    {id:'spawn-south-truck',label:'남측 접근 차폐 트럭',kind:'truck',rect:rect(2270,2155,240,42)},
    {id:'spawn-east-truck',label:'동측 접근 차폐 트럭',kind:'truck',rect:rect(3270,1490,42,230)},
    {id:'spawn-maintenance-truck',label:'해치 접근 차폐 트럭',kind:'truck',rect:rect(590,2155,240,42)},
    {id:'atrium-partition-west',label:'아트리움 서측 차폐판',kind:'partition',rect:rect(1020,1030,24,215)},
    {id:'atrium-partition-east',label:'아트리움 동측 차폐판',kind:'partition',rect:rect(1740,1160,24,210)},
    { id: 'cover-admin-desk', label: '로비 안내 데스크', rect: rect(600, 560, 170, 42) },
    { id: 'cover-admin-cabinet', label: '행정 캐비닛', rect: rect(840, 470, 42, 150) },
    { id: 'cover-office-desks', label: '사무실 책상', rect: rect(1160, 520, 180, 42) },
    { id: 'cover-office-rack', label: '사무실 자료랙', rect: rect(1450, 760, 42, 120) },
    { id: 'cover-server-rack-north', label: '북측 서버랙', rect: rect(1740, 440, 52, 160) },
    { id: 'cover-server-rack-south', label: '남측 서버랙', rect: rect(1980, 760, 52, 120) },
    { id: 'cover-control-console', label: '관제 콘솔', rect: rect(2460, 520, 210, 42) },
    { id: 'cover-control-rack', label: '통제실 장비랙', rect: rect(2830, 700, 50, 140) },
    { id: 'cover-atrium-north', label: '아트리움 북측 화물', rect: rect(1160, 1080, 180, 44) },
    { id: 'cover-atrium-south', label: '아트리움 남측 화물', rect: rect(1500, 1270, 180, 44) },
    { id: 'cover-a-console', label: 'A 사이트 콘솔', rect: rect(2460, 1090, 190, 42) },
    { id: 'cover-a-rack', label: 'A 사이트 랙', rect: rect(2810, 1250, 46, 90) },
    { id: 'cover-maintenance-pipes', label: '유지보수 배관', rect: rect(600, 1510, 190, 44) },
    { id: 'cover-maintenance-crate', label: '유지보수 상자', rect: rect(880, 1780, 48, 100) },
    { id: 'cover-service-bench', label: '서비스 작업대', rect: rect(1160, 1510, 180, 44) },
    { id: 'cover-service-cabinet', label: '서비스 캐비닛', rect: rect(1450, 1760, 48, 100) },
    { id: 'cover-b-core', label: 'B 냉각 코어', rect: rect(1850, 1570, 190, 48) },
    { id: 'cover-b-rack', label: 'B 냉각 랙', rect: rect(2110, 1740, 48, 110) },
    { id: 'cover-loading-crates', label: '적재장 화물', rect: rect(2450, 1520, 210, 48) },
    { id: 'cover-loading-forklift', label: '적재장 장비', rect: rect(2840, 1740, 48, 120) },
    { id: 'cover-yard-north', label: '북쪽 공사자재', rect: rect(1300, 150, 220, 46) },
    { id: 'cover-yard-east', label: '동쪽 외곽 컨테이너', rect: rect(3270, 1120, 48, 180) },
  ],
  attackerRoutes: [
    { id: 'north-roof', label: '북측 창문 진입', loopId: 'outer-loop', points: [p(650, 180), p(900, 180), p(900, 420), p(900, 760), p(860, 960), p(860, 1060), p(1400, 1200), p(2500, 1200)] },
    { id: 'west-gate', label: '서문 정문 진입', loopId: 'inner-loop', points: [p(260, 1040), p(520, 1040), p(820, 1040), p(900, 1040), p(1400, 1200), p(2500, 1200)] },
    { id: 'south-dock', label: '남쪽 적재장 진입', loopId: 'inner-loop', points: [p(2360, 2240), p(2360, 1960), p(2600, 1840), p(1980, 1840), p(1940, 1360), p(1940, 1200), p(2600, 1200)] },
    { id: 'east-service', label: '동쪽 서비스 진입', loopId: 'outer-loop', points: [p(3340, 1600), p(3060, 1600), p(3060, 1200), p(2800, 1200), p(2500, 1200)] },
    { id: 'maintenance-hatch', label: '남서 유지보수 해치', loopId: 'outer-loop', points: [p(700, 2240), p(700, 1960), p(780, 1800), p(860, 1360), p(860, 1200), p(1400, 1200), p(2500, 1200)] },
    { id: 'inner-north', label: '내부 북측 순환', loopId: 'inner-loop', points: [p(900, 760), p(1280, 820), p(1480, 1040), p(1800, 1200), p(2080, 1040), p(2480, 820), p(2640, 1040)] },
    { id: 'inner-south', label: '내부 남측 순환', loopId: 'inner-loop', points: [p(860, 1360), p(1100, 1200), p(1340, 1360), p(1700, 1640), p(1940, 1360), p(2300, 1200), p(2640, 1360)] },
    { id: 'b-cross', label: 'B 사이트 우회 합류', loopId: 'inner-loop', points: [p(1400, 1200), p(1700, 1360), p(1980, 1360), p(1980, 1840), p(2300, 1840), p(2600, 1840)] },
    { id: 'outer-north', label: '북쪽 외곽 우회', loopId: 'outer-loop', points: [p(900, 180), p(1700, 180), p(2500, 180), p(3100, 500), p(3100, 900), p(2800, 1200)] },
    { id: 'outer-south', label: '남쪽 외곽 우회', loopId: 'outer-loop', points: [p(700, 2240), p(1400, 2240), p(2200, 2240), p(3000, 2240), p(3060, 1900), p(2800, 1600)] },
  ],
  defenderSetups: [
    { id: 'north-roof-watch', label: '북측 창문 감시', position: p(760, 820), fallback: p(930, 540) },
    { id: 'gate-crossfire', label: '서문 교차각', position: p(700, 760), fallback: p(900, 820) },
    { id: 'a-site-anchor', label: 'A 사이트 앵커', position: p(2700, 1280), fallback: p(2360, 1160) },
    { id: 'b-site-anchor', label: 'B 사이트 앵커', position: p(1800, 1720), fallback: p(1740, 1840) },
    { id: 'control-a-left', label: 'A 좌측 통제', position: p(2460, 700), fallback: p(2360, 1160) },
    { id: 'a-hall-right', label: 'A 홀 우측', position: p(2820, 1160), fallback: p(2700, 1280) },
    { id: 'atrium-rotate', label: '아트리움 회전', position: p(1500, 1200), fallback: p(1300, 1320) },
    { id: 'maintenance-flank', label: '유지보수 측면', position: p(700, 1680), fallback: p(920, 1840) },
    { id: 'loading-b-anchor', label: 'B 적재장 앵커', position: p(2600, 1680), fallback: p(2820, 1840) },
    { id: 'b-hall-left', label: 'B 홀 좌측', position: p(1800, 1720), fallback: p(2100, 1840) },
    { id: 'service-cross', label: '서비스 교차각', position: p(1300, 1680), fallback: p(1480, 1840) },
    { id: 'east-courtyard', label: '동쪽 중정 감시', position: p(3060, 1200), fallback: p(3000, 1500) },
  ],
  searchPoints: [
    p(760, 560), p(900, 820), p(1280, 560), p(1900, 560), p(2500, 600), p(2800, 820),
    p(1100, 1200), p(1500, 1200), p(2050, 1200), p(2700, 1200), p(760, 1680), p(1300, 1680),
    p(1900, 1680), p(2600, 1680), p(3000, 1600),
  ],
};
