const assert=require('node:assert/strict'),fs=require('node:fs');const {fixture}=require('./qa-preparation-batch.cjs');const root='../artifacts/draft-order-player-generator/src/domain/';const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts'),{NAMSAN_MAP}=require(root+'tacticalMaps.ts');const rows=[];
// 교전 없이 각 상층 경로가 실제 출발→상행→해치 하강→설치를 끝내는지 검사합니다.
for(const route of [5,6]){const input=fixture(41,0,route);input.attackers=input.attackers.slice(0,1);input.defenders=input.defenders.slice(0,1);input.maxSeconds=150;input.targetSite=route===5?'A':'B';
 const box=[[2500,2500,2800,2500],[2800,2500,2800,2800],[2800,2800,2500,2800],[2500,2800,2500,2500]].map(([x,y,tx,ty],i)=>({id:'quiet-'+i,kind:'outer',from:{x,y},to:{x:tx,y:ty}}));
 input.map={...NAMSAN_MAP,walls:[...NAMSAN_MAP.walls,...box],defenderSetups:[{id:'quiet',position:{x:2700,y:2700},fallback:{x:2700,y:2600}}]};
 const result=new TacticalRealtimeSimulation().run(input),transitions=result.events.filter(e=>e.goal==='floor-changed'),planted=result.events.find(e=>e.goal==='planted');assert(transitions.some(e=>e.position.floor===1),'상행 '+route);assert(transitions.some(e=>(e.position.floor??0)===0),'하강 '+route);assert(result.events.some(e=>e.goal==='hatch-opened'),'해치 개방 '+route);assert(planted,'설치 '+route);rows.push({route,transitions,planted:planted.time});
}
fs.writeFileSync('validation/vertical-routes.json',JSON.stringify(rows,null,2)+'\n');console.log('PASS 상층 두 경로 실제 상행·해치 개방·하강·설치');
