// 동일한 준비 입력 20경기에서 중계가 실제 사건과 적 접촉을 얼마나 전달하는지 측정합니다.
const fs=require('node:fs');
const {fixture}=require('./qa-preparation-batch.cjs');
const {TacticalRealtimeSimulation}=require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');

const GAMES=20;
const renderedEvent=event=>event.type==='shot'||event.type==='impact'||(event.type==='utility'&&['grenade-exploded','wall-breached'].includes(event.goal));
const totals={eventCounts:{},renderedEvents:0,eventCount:0,actions:{},enemyAliveTicks:0,enemyVisibleTicks:0,enemyVisibleSnapshots:0,rememberedOneSecondTicks:0,rememberedThreeSecondTicks:0,snapshots:0,knownEventCount:0};
const rows=[];
for(let seed=1;seed<=GAMES;seed++){
  const result=new TacticalRealtimeSimulation().run(fixture(seed,0,0));
  const byType={};
  for(const event of result.events){byType[event.type]=(byType[event.type]??0)+1;totals.eventCounts[event.type]=(totals.eventCounts[event.type]??0)+1;totals.eventCount++;if(renderedEvent(event))totals.renderedEvents++;if(event.seenBy?.includes('공격'))totals.knownEventCount++;}
  let visibleEnemyTicks=0,enemyAliveTicks=0,visibleSnapshots=0,rememberedOneSecondTicks=0,rememberedThreeSecondTicks=0;
  const lastSeen=new Map();
  for(const snapshot of result.snapshots){
    totals.snapshots++;
    const attackers=snapshot.units.filter(unit=>unit.side==='공격'&&unit.alive);
    const defenders=snapshot.units.filter(unit=>unit.side==='수비'&&unit.alive);
    const visible=new Set(snapshot.visibleTo?.공격??[]);
    const visibleEnemies=defenders.filter(unit=>visible.has(unit.id));
    enemyAliveTicks+=defenders.length;visibleEnemyTicks+=visibleEnemies.length;
    if(visibleEnemies.length)visibleSnapshots++;
    for(const unit of visibleEnemies)lastSeen.set(unit.id,snapshot.time);
    for(const unit of defenders){const age=snapshot.time-(lastSeen.get(unit.id)??-Infinity);if(age<=1)rememberedOneSecondTicks++;if(age<=3)rememberedThreeSecondTicks++;}
    totals.enemyAliveTicks+=defenders.length;totals.enemyVisibleTicks+=visibleEnemies.length;
    if(visibleEnemies.length)totals.enemyVisibleSnapshots++;
    for(const unit of attackers)totals.actions[unit.action]=(totals.actions[unit.action]??0)+1;
  }
  totals.rememberedOneSecondTicks+=rememberedOneSecondTicks;totals.rememberedThreeSecondTicks+=rememberedThreeSecondTicks;
  rows.push({seed,seconds:result.executionTime,events:byType,renderedEvents:result.events.filter(renderedEvent).length,enemyVisibleRate:enemyAliveTicks?visibleEnemyTicks/enemyAliveTicks:0,enemyVisibleSnapshotRate:result.snapshots.length?visibleSnapshots/result.snapshots.length:0,lastContactOneSecondRate:enemyAliveTicks?rememberedOneSecondTicks/enemyAliveTicks:0,lastContactThreeSecondRate:enemyAliveTicks?rememberedThreeSecondTicks/enemyAliveTicks:0});
}
const report={
  scope:'현재 main의 실제 준비 입력(즉시 진입·진입로 0) 20개 고정 시드. 브라우저/기기 플레이 측정이 아닙니다.',
  games:GAMES,
  eventTotals:totals.eventCounts,
  renderedEventRate:totals.eventCount?totals.renderedEvents/totals.eventCount:0,
  attackerKnownEventRate:totals.eventCount?totals.knownEventCount/totals.eventCount:0,
  actionTicks:totals.actions,
  holdRate:(totals.actions.hold??0)/Math.max(1,Object.values(totals.actions).reduce((sum,value)=>sum+value,0)),
  enemyVisibleRate:totals.enemyAliveTicks?totals.enemyVisibleTicks/totals.enemyAliveTicks:0,
  enemyVisibleSnapshotRate:totals.snapshots?totals.enemyVisibleSnapshots/totals.snapshots:0,
  lastContactOneSecondRate:totals.enemyAliveTicks?totals.rememberedOneSecondTicks/totals.enemyAliveTicks:0,
  lastContactThreeSecondRate:totals.enemyAliveTicks?totals.rememberedThreeSecondTicks/totals.enemyAliveTicks:0,
  rows,
};
fs.writeFileSync('validation/presentation-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
