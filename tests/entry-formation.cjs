// 준비 대기선 이동과 진입 출발을 구분합니다. 진입 이후 검사 시간은 기존 15초 그대로입니다.
const assert=require('node:assert/strict');
const {fixture}=require('./qa-preparation-batch.cjs');
const {TacticalRealtimeSimulation}=require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
const {NAMSAN_MAP}=require('../artifacts/draft-order-player-generator/src/domain/tacticalMaps.ts');
/** 같은 진입로의 출발 시점·거리와 관측 없는 대기 중 사격 가능 상태를 구분합니다. */
function check(route){const input=fixture(1,0,route),s=new TacticalRealtimeSimulation().createSession(input),start=s.step().snapshot,allies=start.units.filter(u=>u.side==='공격'),departures=new Map();let last=start,entryAt;let origins=new Map(allies.map(u=>[u.id,{...u.position}]));
 // 진입 대기자가 실내에서 생성되어 출발 전에 사격받는 배치 회귀를 차단합니다.
 for(const unit of allies)assert(!NAMSAN_MAP.rooms.some(room=>room.kind!=='yard'&&unit.position.x>room.rect.x&&unit.position.x<room.rect.x+room.rect.width&&unit.position.y>room.rect.y&&unit.position.y<room.rect.y+room.rect.height),'대기 선수 실내 생성 금지');
 for(let i=0;i<allies.length;i++)for(let j=i+1;j<allies.length;j++)assert(Math.hypot(allies[i].position.x-allies[j].position.x,allies[i].position.y-allies[j].position.y)>=70,'출발부터 0.85m 밀집 금지');
 for(let frame=0;frame<450&&!s.isComplete;frame++){
  const t=s.step();last=t.snapshot;
  if(last.operation.phase!=='entering'){
   assert(t.time<=30,'준비 단계 종료 누락');
   origins=new Map(last.units.filter(u=>u.side==='공격').map(u=>[u.id,{...u.position}]));continue;
  }
  entryAt??=last.operation.phaseStartedAt;
  for(const u of last.units.filter(u=>u.side==='공격')){
   const original=origins.get(u.id),moved=Math.hypot(u.position.x-original.x,u.position.y-original.y),rank=allies.findIndex(v=>v.id===u.id);
   if(t.time<entryAt+rank*.9-1e-9)assert(moved<.01,'자기 출발 시차 전에 진입 이동 금지');
   if(!departures.has(u.id)&&moved>15)departures.set(u.id,t.time-entryAt);
  }
  if(t.time>=entryAt+15)break;
 }
 const times=[...departures.values()].sort((a,b)=>a-b);assert(entryAt!==undefined,'실제 entering 단계 도달');assert(times.length===5,'출발 누락: '+JSON.stringify({route,departures:[...departures],units:last.units.filter(u=>u.side==='공격').map(u=>({id:u.id,position:u.position,goal:u.goal,action:u.action}))}));assert(times.at(-1)-times[0]>=2.5,'다섯 명 동시 출발 금지');return {route,entryAt,departureTimes:times};}
const rows=[0,1,2,3,4].map(check);require('node:fs').writeFileSync('validation/entry-formation.json',JSON.stringify(rows,null,2)+'\n');console.log(rows);
