// 지도 교체 때 실제 엔진의 몸 반경·경로·사선을 검사합니다. 층 규칙은 별도 단계로 남깁니다.
const assert=require('node:assert/strict'),fs=require('node:fs');
require('./qa-preparation-batch.cjs');
const root='../artifacts/draft-order-player-generator/src/domain/';
const {NAMSAN_MAP:map}=require(root+'tacticalMaps.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const engine=new TacticalRealtimeSimulation(),nodes=engine.buildNavigationNodes(map),inside=(p,r)=>p.x>r.x&&p.x<r.x+r.width&&p.y>r.y&&p.y<r.y+r.height;
const rooms=map.rooms.filter(r=>r.kind!=='yard'),points=[];
for(let x=40;x<map.width;x+=40)for(let y=40;y<map.height;y+=40)if(rooms.some(r=>inside({x,y},r.rect))&&engine.canStand({x,y},map))points.push({x,y});
for(const room of rooms){const r=room.rect,area=r.width*r.height/1600;assert(r.width>=160&&r.width<=320&&r.height>=160&&r.height<=320,room.id+' 방 크기');assert(area>=25&&area<=60,room.id+' 면적');assert(room.callout?.startsWith('1F '));}
assert.equal(new Set(rooms.map(r=>r.callout)).size,rooms.length);
let longest=0,open=0,over=0;
for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(engine.hasLineOfSight(points[i],points[j],map)){const d=Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)/40;longest=Math.max(longest,d);open++;if(d>25)over++;}
assert(longest<=25,'최장 사선 25m');assert(over/open<=.1,'장거리 사선 10%');
const siteRows=[];
for(const site of map.sites){
 assert.equal(site.roomIds.length,2);assert(map.portals.some(p=>site.roomIds.includes(p.fromRoom)&&site.roomIds.includes(p.toRoom)),'사이트 두 방 직접 연결');
 for(let i=0;i<2;i++){const room=rooms.find(r=>r.id===site.roomIds[i]);assert(inside(site.plantAnchors[i],room.rect));assert(engine.canStand(site.plantAnchors[i],map));
  assert(map.portals.filter(p=>p.fromRoom===room.id||p.toRoom===room.id).length>=2,'방당 출입구 2개');
  const soft=map.walls.filter(w=>w.breachable&&(w.from.x===room.rect.x||w.from.x===room.rect.x+room.rect.width||w.from.y===room.rect.y||w.from.y===room.rect.y+room.rect.height));assert(soft.length>=2,'연질 벽');
 }
 const distances=[];
 map.entrances.forEach((entry,i)=>{
  const route=map.attackerRoutes[i],start=route.points[0];assert.equal(points.filter(p=>engine.hasLineOfSight(start,p,map)).length,0,entry.id+' 스폰 피크');
  assert(engine.canTraverse(entry.outside,entry.inside,map),entry.id+' 문 통행');
  const anchor=[...site.plantAnchors].sort((a,b)=>Math.hypot(a.x-entry.inside.x,a.y-entry.inside.y)-Math.hypot(b.x-entry.inside.x,b.y-entry.inside.y))[0];
  const path=engine.findPath(start,anchor,map,nodes);assert(path.length);let previous=start,length=0;
  for(const point of path){assert(engine.canTraverse(previous,point,map),entry.id+' 이동 선분');length+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point;}
  assert(Math.hypot(previous.x-anchor.x,previous.y-anchor.y)<.001);distances.push(length/40);
 });
 const ratio=Math.max(...distances)/Math.min(...distances);assert(ratio<=1.2,site.id+' 실제 스폰→설치 경로 편차 '+ratio);siteRows.push({id:site.id,distancesMetres:distances,ratio});
}
// 실내 서측/동측을 각각 거치는 독립 회전로를 방 그래프에서 찾습니다.
const connections=map.portals.filter(p=>rooms.some(r=>r.id===p.fromRoom)&&rooms.some(r=>r.id===p.toRoom));
function reachable(start,goal,excluded){const seen=new Set([start]),queue=[start];while(queue.length){const here=queue.shift();if(here===goal)return true;for(const link of connections){const next=link.fromRoom===here?link.toRoom:link.toRoom===here?link.fromRoom:undefined;if(next&&!excluded.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}}}return false;}
assert(reachable(map.sites[0].roomIds[0],map.sites[1].roomIds[0],new Set([map.sites[0].roomIds[1],map.sites[1].roomIds[1]])));
assert(reachable(map.sites[0].roomIds[1],map.sites[1].roomIds[1],new Set([map.sites[0].roomIds[0],map.sites[1].roomIds[0]])));
assert(map.portals.filter(p=>p.traversal==='crawl').length>=2);
const report={map:map.id,indoorAreaMetres:rooms.reduce((sum,r)=>sum+r.rect.width*r.rect.height/1600,0),rooms:rooms.length,gridStep:40,standableSamples:points.length,lineOfSight:{longestMetres:longest,openPairs:open,over25mPairs:over},spawnIndoorSightLines:0,sites:siteRows,interiorRotations:2,crawlPortals:map.portals.filter(p=>p.traversal==='crawl').length,pending:['2층·계단·수직 해치','팀 보강 자원 배분','층간 교전']};
fs.writeFileSync('validation/namsan-map-contract.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
// 방 이름만 둘로 나뉜 것이 아니라 실제 운반자가 양쪽 방에 각각 설치할 수 있어야 합니다.
const {fixture}=require('./qa-preparation-batch.cjs');
const plantRows=[];
for(const site of map.sites)for(let roomIndex=0;roomIndex<2;roomIndex++){
 const anchor=site.plantAnchors[roomIndex],input=fixture(41,0);input.attackers=input.attackers.slice(0,1);input.defenders=input.defenders.slice(0,1);delete input.scoutPlan;
 input.targetSite=site.id;input.maxSeconds=65;
 const box=[[2600,2500,2800,2500],[2800,2500,2800,2800],[2800,2800,2600,2800],[2600,2800,2600,2500]].map(([x,y,tx,ty],i)=>({id:'quiet-'+i,kind:'outer',from:{x,y},to:{x:tx,y:ty}}));
 input.map={...map,walls:[...map.walls,...box],attackerRoutes:[{id:'plant-room',label:'설치 방 검사',points:[anchor,anchor]}],defenderSetups:[{id:'quiet',label:'차폐된 수비',position:{x:2700,y:2700},fallback:{x:2700,y:2600}}]};
 const round=engine.run(input),planted=round.events.find(e=>e.goal==='planted');assert(planted,site.id+' '+roomIndex+' 실제 설치');
 const room=rooms.find(r=>r.id===site.roomIds[roomIndex]);assert(inside(planted.position,room.rect),'선택한 방에 설치');plantRows.push({site:site.id,room:room.id,time:planted.time,position:planted.position});
}
report.planting=plantRows;fs.writeFileSync('validation/namsan-map-contract.json',JSON.stringify(report,null,2)+'\n');console.log('PASS 실제 네 방 설치',plantRows);
