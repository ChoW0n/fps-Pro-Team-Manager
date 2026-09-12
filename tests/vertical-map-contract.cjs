const assert=require('node:assert/strict'),fs=require('node:fs');require('./qa-preparation-batch.cjs');
const root='../artifacts/draft-order-player-generator/src/domain/';
const {NAMSAN_MAP,layer,floorPoint}=require(root+'tacticalMaps.ts'),{TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const engine=new TacticalRealtimeSimulation(),report=[];
for(const floor of NAMSAN_MAP.floors){const map=layer(NAMSAN_MAP,floor.id),points=[];
 for(let x=1000;x<1920;x+=40)for(let y=1000;y<1920;y+=40){const p=floorPoint({x,y},floor.id);if(engine.canStand(p,map))points.push(p);}
 let longest=0,open=0;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(engine.hasLineOfSight(points[i],points[j],map)){open++;longest=Math.max(longest,Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)/40);}
 assert(longest<=25,`${floor.label} 사선 ${longest}`);
 const rooms=map.rooms.filter(r=>r.kind!=='yard');assert.equal(rooms.length,16);assert.equal(new Set(rooms.map(r=>r.callout)).size,rooms.length);
 for(const room of rooms){const r=room.rect;assert(r.width<=320&&r.height<=320&&r.width*r.height/1600>=25&&r.width*r.height/1600<=60);assert(room.callout.startsWith((floor.id+1)+'F '));assert(map.portals.filter(p=>p.fromRoom===room.id||p.toRoom===room.id).length>=2,room.id+' 출입구');}
 const nodes=engine.buildNavigationNodes(map),st=NAMSAN_MAP.stairs;
 for(const a of st)for(const b of st){const from=floorPoint(a.center,floor.id),to=floorPoint(b.center,floor.id),path=engine.findPath(from,to,map,nodes);assert(path.length);let prev=from;for(const p of path){assert(engine.canTraverse(prev,p,map));prev=p;}assert(Math.hypot(prev.x-to.x,prev.y-to.y)<.1);}
 report.push({floor:floor.id,rooms:rooms.length,samples:points.length,openPairs:open,longestMetres:longest,connectionPairs:st.length**2});
}
fs.writeFileSync('validation/vertical-map-contract.json',JSON.stringify(report,null,2)+'\n');console.log(report);
