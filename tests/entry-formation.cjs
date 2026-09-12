// 실제 준비 화면의 0명 선발조 입력에서 간격과 출발 시차를 검사합니다.
const assert=require('node:assert/strict');
const {fixture}=require('./qa-preparation-batch.cjs');
const {TacticalRealtimeSimulation}=require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
/** 같은 진입로의 출발 시점·거리와 관측 없는 대기 중 사격 가능 상태를 구분합니다. */
function check(route){const input=fixture(1,0,route),s=new TacticalRealtimeSimulation().createSession(input),start=s.step().snapshot,allies=start.units.filter(u=>u.side==='공격'),departures=new Map();let last=start;
 for(let i=0;i<allies.length;i++)for(let j=i+1;j<allies.length;j++)assert(Math.hypot(allies[i].position.x-allies[j].position.x,allies[i].position.y-allies[j].position.y)>=70,'출발부터 0.85m 밀집 금지');
 for(let frame=0;frame<150&&!s.isComplete;frame++){const t=s.step();last=t.snapshot;for(const u of t.snapshot.units.filter(u=>u.side==='공격')){const original=allies.find(v=>v.id===u.id);if(!departures.has(u.id)&&Math.hypot(u.position.x-original.position.x,u.position.y-original.position.y)>15)departures.set(u.id,t.time);}}
 const times=[...departures.values()].sort((a,b)=>a-b);assert(times.length===5,'출발 누락: '+JSON.stringify({route,departures:[...departures],units:last.units.filter(u=>u.side==='공격').map(u=>({id:u.id,position:u.position,goal:u.goal,action:u.action}))}));assert(times.at(-1)-times[0]>=2.5,'다섯 명 동시 출발 금지');return {route,departureTimes:times};}
const rows=[0,1,2,3,4].map(check);require('node:fs').writeFileSync('validation/entry-formation.json',JSON.stringify(rows,null,2)+'\n');console.log(rows);
