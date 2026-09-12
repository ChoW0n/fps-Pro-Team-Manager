// 엔진의 실제 기하로 맵 수정 전후를 측정합니다. 목표 미달을 합격으로 바꾸지 않습니다.
const fs=require('node:fs');require('./qa-preparation-batch.cjs');
const root='../artifacts/draft-order-player-generator/src/domain/';
const {BREACHLINE_MAP:map}=require(root+'tacticalMaps.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const engine=new TacticalRealtimeSimulation(),metre=40,points=[];
// 실내 표본은 방 경계 안이며 실제 몸 반경으로 설 수 있는 지점으로 제한합니다.
for(let x=40;x<map.width;x+=40)for(let y=40;y<map.height;y+=40){const point={x,y};if(map.rooms.some(r=>r.kind!=='yard'&&x>r.rect.x&&x<r.rect.x+r.rect.width&&y>r.rect.y&&y<r.rect.y+r.rect.height)&&engine.canStand(point,map))points.push(point);}
let longest=0,pair,open=0,over=0;
for(let i=0;i<points.length;i+=3)for(let j=i+3;j<points.length;j+=7){const a=points[i],b=points[j],distance=Math.hypot(a.x-b.x,a.y-b.y)/metre;if(!engine.hasLineOfSight(a,b,map))continue;open++;if(distance>25)over++;if(distance>longest){longest=distance;pair=[a,b];}}
// outside는 문 바로 앞 기준점이므로 스폰 거리 측정에는 실제 경로 시작점을 사용합니다.
const spawnDistances=map.attackerRoutes.slice(0,map.entrances.length).flatMap(route=>map.sites.map(site=>Math.hypot(route.points[0].x-site.center.x,route.points[0].y-site.center.y)/metre));
const report={map:map.id,indoorSamples:points.length,lineOfSight:{longestMetres:longest,pair,openPairs:open,over25mPairs:over,over25mPercent:100*over/Math.max(1,open),targetLongestMetres:25,targetOverPercent:10},oversizedRooms:map.rooms.filter(r=>r.kind!=='yard'&&(r.rect.width>320||r.rect.height>320)).map(r=>({id:r.id,widthMetres:r.rect.width/metre,heightMetres:r.rect.height/metre})),siteEntrances:map.sites.map(s=>({site:s.id,portals:map.portals.filter(p=>p.fromRoom===s.roomId||p.toRoom===s.roomId).map(p=>p.id)})),spawnStraightLineMetres:{min:Math.min(...spawnDistances),max:Math.max(...spawnDistances),ratio:Math.max(...spawnDistances)/Math.min(...spawnDistances)},verticalConnections:map.stairs?.length??0};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
