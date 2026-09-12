// 실제 편성 확인과 UI의 즉시 진입 입력을 사용해 같은 5개 진입로·2개 시드를 측정합니다.
const fs=require('node:fs');
const {fixture}=require('./qa-preparation-batch.cjs');
const file='../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts';
const {TacticalRealtimeSimulation}=require(file);const rows=[];
for(let route=0;route<5;route++)for(let seed=1;seed<=2;seed++){
const input=fixture(seed,0,route),result=new TacticalRealtimeSimulation().run(input);let cycles=0,wait=0,longest=0;const streak=new Map();
for(const s of result.snapshots){const edges=new Map(s.units.filter(u=>u.alive).map(u=>[u.callSign,/통과 순서 대기 · (\S+) 선행/.exec(u.goal)?.[1]]));let cycle=false;
for(const u of s.units.filter(u=>u.alive)){const waiting=/통과 순서 대기/.test(u.goal);streak.set(u.id,waiting?(streak.get(u.id)||0)+.1:0);longest=Math.max(longest,streak.get(u.id));if(waiting)wait++;let n=u.callSign;const visited=new Set();while(edges.get(n)){if(visited.has(n)){cycle=true;break;}visited.add(n);n=edges.get(n);}}
if(cycle)cycles++;}
rows.push({route,seed,winner:result.winner,cycles,wait,longest:+longest.toFixed(1)});
}
const report={games:rows.length,attackWins:rows.filter(r=>r.winner==='공격').length,cycleTicks:rows.reduce((n,r)=>n+r.cycles,0),waitingUnitTicks:rows.reduce((n,r)=>n+r.wait,0),longestWait:Math.max(...rows.map(r=>r.longest)),rows};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
