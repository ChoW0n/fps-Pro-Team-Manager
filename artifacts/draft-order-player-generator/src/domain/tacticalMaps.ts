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
  callout?: string;
  floorColor?: string;
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
  roomIds?: string[];
  bounds: TacticalRect;
  center: TacticalPoint;
  plantAnchors: TacticalPoint[];
  defendAnchors: TacticalPoint[];
  approaches?: {id:string;label:string;point:TacticalPoint}[];
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

/** 남산 관광·방송 시설을 모티브로 한 가상 중계관. 실제 시설 평면과 무관합니다.
 * 40단위=1m, 실내 24×24m. 문을 엇갈리게 두어 방을 가로지르는 긴 사선을 끊습니다.
 * 층간 이동은 별도 검증 단계이며 이 지도는 현재 플레이 가능한 1층입니다.
 */
const rooms: TacticalRoom[] = [];
const walls: TacticalWall[] = [];
const portals: TacticalPortal[] = [];
const xs = [960, 1160, 1440, 1720, 1920];
const ys = [960, 1200, 1440, 1680, 1920];
const names = [
  ['매표', '기념품', '카페', '전망'],
  ['안내', '송출', '관제', '전시'],
  ['정비', '전원', '배전', '자료'],
  ['반입', '휴게', '준비', '테라스'],
];
/** 경계에 실제 문 폭만큼 틈을 내고 포털도 같은 좌표에서 만듭니다. */
function doorway(id: string, from: TacticalPoint, to: TacticalPoint, center: TacticalPoint,
  axis: TacticalPortal['axis'], fromRoom: string, toRoom: string, outer = false,
  traversal?: TacticalPortal['traversal']): TacticalPortal {
  const half = traversal === 'crawl' ? 36 : 48;
  const before = axis === 'horizontal' ? p(center.x-half, center.y) : p(center.x, center.y-half);
  const after = axis === 'horizontal' ? p(center.x+half, center.y) : p(center.x, center.y+half);
  walls.push(wall(id+'-left', from, before, outer?'outer':'interior'),
    wall(id+'-gap', before, after, 'door-gap'), wall(id+'-right', after, to, outer?'outer':'interior'));
  const portal: TacticalPortal = {id, label: `${fromRoom.startsWith('room')?names[Number(fromRoom.split('-')[1])][Number(fromRoom.split('-')[2])]:fromRoom} 연결문`, center, width: half*2, axis, fromRoom, toRoom, traversal};
  portals.push(portal);
  return portal;
}
for (let row=0; row<4; row++) for (let col=0; col<4; col++) {
  const id = `room-${row}-${col}`;
  rooms.push({id, label: names[row][col], callout: `1F ${names[row][col]}`,
    rect: rect(xs[col],ys[row],xs[col+1]-xs[col],240), kind:'room', floorColor: row===0?'#726b58':col===0||col===3?'#68766b':row===1?'#465f69':'#696452'});
  if(col<3) doorway(`link-v-${row}-${col}`,p(xs[col+1],ys[row]),p(xs[col+1],ys[row+1]),
    p(xs[col+1],ys[row]+(col===1?120:col%2===row%2?80:160)),'vertical',id,`room-${row}-${col+1}`);
  if(row<3) doorway(`link-h-${row}-${col}`,p(xs[col],ys[row+1]),p(xs[col+1],ys[row+1]),
    p(xs[col]+(row%2===col%2?70:xs[col+1]-xs[col]-70),ys[row+1]),'horizontal',id,`room-${row+1}-${col}`);
}
// 외벽의 빈 틈은 모두 명시한 진입구입니다. 저상 통로는 지하·수직 해치가 아닙니다.
const entrances: TacticalEntrance[] = [];
const entryData: {id:string; label:string; center:TacticalPoint; axis:TacticalPortal['axis']; room:string;
  outside:TacticalPoint; inside:TacticalPoint; spawn:TacticalPoint; traversal?:TacticalPortal['traversal']}[] = [
  {id:'ticket',label:'매표소 진입',center:p(1040,960),axis:'horizontal',room:'room-0-0',outside:p(1040,920),inside:p(1040,1010),spawn:p(520,520),traversal:'window'},
  {id:'view',label:'전망창 진입',center:p(1840,960),axis:'horizontal',room:'room-0-3',outside:p(1840,920),inside:p(1840,1010),spawn:p(2360,520)},
  {id:'terrace',label:'테라스 진입',center:p(1840,1920),axis:'horizontal',room:'room-3-3',outside:p(1840,1960),inside:p(1840,1870),spawn:p(2360,2360),traversal:'vault'},
  {id:'delivery',label:'반입구 진입',center:p(1040,1920),axis:'horizontal',room:'room-3-0',outside:p(1040,1960),inside:p(1040,1870),spawn:p(520,2360),traversal:'crawl'},
  {id:'cafe',label:'카페 진입',center:p(1530,960),axis:'horizontal',room:'room-0-2',outside:p(1530,920),inside:p(1530,1010),spawn:p(1440,650),traversal:'crawl'},
];
for(const [side,y] of [['north',960],['south',1920]] as const) {
  const entries=entryData.filter(e=>e.center.y===y).sort((a,b)=>a.center.x-b.center.x);
  let start=960;
  for(const e of entries) {
    const half=e.traversal==='crawl'?36:48;
    walls.push(wall(`outer-${e.id}-before`,p(start,y),p(e.center.x-half,y),'outer'));
    walls.push(wall(`outer-${e.id}-gap`,p(e.center.x-half,y),p(e.center.x+half,y),'door-gap'));
    const portal:TacticalPortal={id:`portal-${e.id}`,label:e.label,center:e.center,width:half*2,axis:e.axis,fromRoom:`yard-${side}`,toRoom:e.room,traversal:e.traversal};
    portals.push(portal);entrances.push({...portal,id:`entrance-${e.id}`,outside:e.outside,inside:e.inside});
    start=e.center.x+half;
  }
  walls.push(wall(`outer-${side}-end`,p(start,y),p(1920,y),'outer'));
}
// 경로 선택 인덱스와 진입구는 같은 순서를 사용합니다.
entrances.sort((a,b)=>entryData.findIndex(e=>'entrance-'+e.id===a.id)-entryData.findIndex(e=>'entrance-'+e.id===b.id));
for(let row=0;row<4;row++) for(const [side,x] of [['west',960],['east',1920]] as const)
  walls.push({...wall(`outer-${side}-${row}`,p(x,ys[row]),p(x,ys[row+1]),'outer'),breachable:true});
rooms.push({id:'yard-north',label:'산책광장',rect:rect(400,400,2080,520),kind:'yard'},
  {id:'yard-south',label:'성곽산책로',rect:rect(400,1960,2080,520),kind:'yard'});
const covers:TacticalCover[] = rooms.filter(r=>r.kind==='room').map((r,i)=>({
  id:`${[1,5,9,10,11].includes(i)?'rack':'desk'}-${r.id}`,label: ['안내대','진열장','커피바','전망안내판','관광지도','송출랙','관제책상','서울모형','정비대','전원반','배전반','기록함','운반상자','휴게벤치','준비대','잠금쇠전시대'][i],
  rect:rect(r.rect.x+r.rect.width/2-35,r.rect.y+105,70,30),
}));
// 광장 입구의 불투명 안내벽이 스폰에서 문틈을 통해 실내를 엿보는 각을 가립니다.
for(const e of entryData) covers.push({id:`screen-${e.id}`,label:'관광 안내벽',kind:'partition',
  rect:rect(e.center.x-200,e.center.y===960?850:1990,400,28)});
// 스폰 대기 공간 앞의 성곽 안내판: 다섯 선수의 대형은 뒤쪽에 서고 양끝으로 우회합니다.
for(const [i,e] of entryData.entries()) {
  const north=e.spawn.y<1440, signY=e.spawn.y+(north?120:-148);
  covers.push({id:`spawn-screen-${i}`,label:'성곽 안내판',kind:'partition',rect:rect(e.spawn.x-314,signY,628,28)});
  for(const side of [-1,1]) covers.push({id:`spawn-wing-${i}-${side}`,label:'성곽 안내판 측벽',kind:'partition',
    rect:rect(e.spawn.x+(side<0?-314:300),e.spawn.y+(north?-80:-120),14,200)});
}
const site = (id:'A'|'B', row:number, label:string):TacticalSite => ({
  id,label,roomId:`room-${row}-1`,roomIds:[`room-${row}-1`,`room-${row}-2`],
  bounds:rect(1185,ys[row]+25,510,190),center:p(1440,ys[row]+120),
  plantAnchors:[p(1300,ys[row]+175),p(1580,ys[row]+175)],
  defendAnchors:[p(1220,ys[row]+55),p(1380,ys[row]+185),p(1500,ys[row]+55),p(1660,ys[row]+185),p(1300,ys[row]+55)],
  approaches:[{id:'west',label:'서측 연결문',point:p(1160,ys[row]+(row%2?160:80))},
    {id:'east',label:'동측 연결문',point:p(1720,ys[row]+(row%2?160:80))},
    {id:'north',label:'북측 연결문',point:p(row%2?1370:1230,ys[row])}],
});
const sites=[site('A',1,'A · 송출 / 관제'),site('B',2,'B · 전원 / 배전')];
const attackerRoutes:TacticalRoute[]=entryData.map((e,i)=>({id:e.id,label:e.label,loopId:'outer-loop',
  points:[e.spawn,p(e.center.x+(i%2?-240:240),e.outside.y),e.outside,e.inside,
    p(xs[i===1||i===2?3:i===4?2:0]+60,e.inside.y),sites[i===2||i===3?1:0].plantAnchors[0]]}));
attackerRoutes.push({id:'inner-north',label:'전시 순환',loopId:'inner-loop',points:[p(1040,1120),p(1300,1120),p(1580,1120),p(1840,1120)]},
  {id:'inner-south',label:'설비 순환',loopId:'inner-loop',points:[p(1040,1760),p(1300,1760),p(1580,1760),p(1840,1760)]});
export const NAMSAN_MAP:TacticalMapDefinition = {
  id:'namsan-relay-01',name:'남산 중계관',width:2880,height:2880,
  building:rect(960,960,960,960),entryHall:rooms[0].rect,objectiveZone:sites[0].bounds,
  breachPoint:p(920,1320),breachEntryPoint:p(1000,1320),windowPoint:entryData[0].outside,
  attackerSpawn:entryData[0].spawn,defenderSpawn:sites[0].defendAnchors[0],returnPoint:entryData[0].spawn,
  doorGap:{from:p(992,960),to:p(1088,960)},rooms,walls,covers,portals,entrances,sites,attackerRoutes,
  defenderSetups:sites.flatMap(s=>s.defendAnchors.map((position,i)=>({id:`${s.id}-guard-${i}`,label:`${s.id} 수비 ${i+1}`,position,fallback:s.plantAnchors[i%2]}))),
  searchPoints:rooms.filter(r=>r.kind==='room').map(r=>p(r.rect.x+60,r.rect.y+60)),
  loops:[{id:'inner-loop',label:'실내 양측 회전',routeIds:['inner-north','inner-south']},
    {id:'outer-loop',label:'산책로 접근',routeIds:entryData.map(e=>e.id)}],
};
