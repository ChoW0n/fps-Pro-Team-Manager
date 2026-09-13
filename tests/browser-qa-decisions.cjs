// 실제 경기의 판단 왕복과 행동·이동 불일치를 같은 입력으로 비교합니다. 브라우저 검사가 아닙니다.
const fs=require('node:fs');
const {fixture}=require('./qa-preparation-batch.cjs');
const {TacticalRealtimeSimulation}=require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
const rows=[];
for(let g=0;g<Number(process.argv[3]??2);g++){
 const input={...fixture(7017+g*17,0,g%5),maxSeconds:150},result=new TacticalRealtimeSimulation().run(input);
 const history=new Map();let changes=0,returns=0,holdMoving=0;
 for(const snap of result.snapshots)for(const u of snap.units.filter(u=>u.alive&&!u.downed)){
  if(u.action==='hold'&&Math.hypot(u.velocity.x,u.velocity.y)>1)holdMoving++;
  const h=history.get(u.id)??[];
  if(h.at(-1)?.decision===u.decision)continue;
  if(h.length){changes++;if(h.at(-2)?.decision===u.decision&&snap.time-h.at(-1).time<2)returns++;}
  h.push({decision:u.decision,time:snap.time});history.set(u.id,h.slice(-2));
 }
 rows.push({seed:input.seed,changes,returns,holdMoving,winner:result.winner,duration:result.executionTime});
 console.log(rows.at(-1));
}
const changes=rows.reduce((n,r)=>n+r.changes,0),returns=rows.reduce((n,r)=>n+r.returns,0);
const report={games:rows.length,changes,returns,returnPercent:100*returns/Math.max(1,changes),holdMoving:rows.reduce((n,r)=>n+r.holdMoving,0),rows};
fs.writeFileSync(process.argv[2]??'validation/browser-qa-decisions.json',JSON.stringify(report,null,2)+'\n');console.log(report);
