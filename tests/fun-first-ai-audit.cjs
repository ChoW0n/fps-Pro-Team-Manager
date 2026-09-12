const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation,operatorBaseSpeed}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {fixture}=require('./qa-preparation-batch.cjs');
const games=Number(process.argv[2]??12),rows=[];
if(!Number.isInteger(games)||games<1||games>80)throw Error('경기 수는 1~80 정수여야 합니다.');
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;};
for(let seed=1;seed<=games;seed++){
  const input=fixture(7000+seed*17,0,seed%5),result=new TacticalRealtimeSimulation().run(input);
  const shots=result.events.filter(event=>event.type==='shot'),hits=result.events.filter(event=>event.type==='impact'&&event.hit);
  const heads=hits.filter(event=>event.hitRegion==='head'),deaths=result.events.filter(event=>event.type==='death');
  const unitSides=new Map(result.snapshots[0].units.map(unit=>[unit.id,unit.side]));
  const partialReloads=result.events.filter(event=>event.type==='reload'&&event.message.includes('전술 재장전 시작'));
  const exposedPartialReloads=partialReloads.filter(event=>event.seenBy?.includes(unitSides.get(event.actor)==='공격'?'수비':'공격'));
  const kills={};for(const death of deaths)if(death.actor)kills[death.actor]=(kills[death.actor]??0)+1;
  const liveTicks=result.snapshots.flatMap(snapshot=>snapshot.units.filter(unit=>unit.alive));
  const decisions=new Set(liveTicks.map(unit=>unit.decision).filter(Boolean));
  const speeds=input.attackers.map(unit=>operatorBaseSpeed(unit.operator.callSign)+unit.player.teamSynergy/20);
  const entrySnapshots=result.snapshots.filter(snapshot=>snapshot.operation.phase==='entering');
  const entrySeparations=[],leadTail=[];let loopWindows=0,totalWindows=0;
  for(const snapshot of entrySnapshots){const attack=snapshot.units.filter(unit=>unit.side==='공격'&&unit.alive&&!unit.downed).sort((a,b)=>a.formationIndex-b.formationIndex);if(attack.length>1){for(const unit of attack)entrySeparations.push(Math.min(...attack.filter(other=>other.id!==unit.id).map(other=>Math.hypot(unit.position.x-other.position.x,unit.position.y-other.position.y))));leadTail.push(Math.hypot(attack[0].position.x-attack.at(-1).position.x,attack[0].position.y-attack.at(-1).position.y));}}
  for(let index=30;index<result.snapshots.length;index+=10){const start=result.snapshots[index-30],end=result.snapshots[index];for(const unit of end.units.filter(candidate=>candidate.alive)){const prior=start.units.find(candidate=>candidate.id===unit.id);if(!prior)continue;let travelled=0,last=prior.position;for(const snapshot of result.snapshots.slice(index-29,index+1)){const point=snapshot.units.find(candidate=>candidate.id===unit.id)?.position;if(point){travelled+=Math.hypot(point.x-last.x,point.y-last.y);last=point;}}const displacement=Math.hypot(unit.position.x-prior.position.x,unit.position.y-prior.position.y);if(travelled>30){totalWindows++;if(displacement/travelled<.3)loopWindows++;}}}
  rows.push({seed:input.seed,winner:result.winner,seconds:result.executionTime,shots:shots.length,hits:hits.length,heads:heads.length,deaths:deaths.length,
    fourKills:Math.max(0,...Object.values(kills))>=4,decisionKinds:decisions.size,undefinedDecisionTicks:liveTicks.filter(unit=>!unit.decision).length,totalLiveTicks:liveTicks.length,
    attackSpeedVariation:(Math.max(...speeds)-Math.min(...speeds))/(speeds.reduce((sum,value)=>sum+value,0)/speeds.length),
    entrySeparationSum:entrySeparations.reduce((sum,value)=>sum+value,0),entrySeparationCount:entrySeparations.length,leadTailDistanceMedian:median(leadTail),
    cornerChecks:result.events.filter(event=>event.goal==='point-corner-check').length,soundReactionTicks:liveTicks.filter(unit=>unit.decision==='소리 추적 · 마지막 위치 확인').length,
    dangerReactions:result.events.filter(event=>event.goal==='danger-zone-avoided').length,reroutes:result.events.filter(event=>event.goal==='intel-reroute').length,
    wallBangs:result.events.filter(event=>event.goal==='wall-bang').length,partialReloads:partialReloads.length,exposedPartialReloads:exposedPartialReloads.length,loopWindows,totalWindows});
  if(seed%4===0||seed===games)console.log('실행',seed+'/'+games);
}
const total=key=>rows.reduce((sum,row)=>sum+row[key],0),rate=(part,whole)=>part/Math.max(1,whole);
const metrics={games,accuracy:rate(total('hits'),total('shots')),headRate:rate(total('heads'),total('hits')),medianDeaths:median(rows.map(row=>row.deaths)),fourKillRate:rate(rows.filter(row=>row.fourKills).length,games),
  medianAttackSpeedVariation:median(rows.map(row=>row.attackSpeedVariation)),attackWinRate:rate(rows.filter(row=>row.winner==='공격').length,games),
  minimumDecisionKinds:Math.min(...rows.map(row=>row.decisionKinds)),undefinedDecisionRate:rate(total('undefinedDecisionTicks'),total('totalLiveTicks')),
  averageEntrySeparation:total('entrySeparationSum')/Math.max(1,total('entrySeparationCount')),
  medianLeadTailDistance:median(rows.map(row=>row.leadTailDistanceMedian)),cornerChecksPerGame:total('cornerChecks')/games,soundReactionsPerGame:total('soundReactionTicks')/games,
  dangerReactionsPerGame:total('dangerReactions')/games,reroutesPerGame:total('reroutes')/games,wallBangsPerGame:total('wallBangs')/games,
  exposedPartialReloadRate:rate(total('exposedPartialReloads'),total('partialReloads')),loopWindowRate:rate(total('loopWindows'),total('totalWindows'))};
const gates={accuracy:metrics.accuracy<=.6,headRate:metrics.headRate<=.12,medianDeaths:metrics.medianDeaths>=4&&metrics.medianDeaths<=5,fourKillRate:metrics.fourKillRate<=.12,
  attackSpeedVariation:metrics.medianAttackSpeedVariation>=.25,attackWinRate:metrics.attackWinRate>=.4&&metrics.attackWinRate<=.6,decisionKinds:metrics.minimumDecisionKinds>=12,undefinedDecisionRate:metrics.undefinedDecisionRate<=.15,
  entrySeparation:metrics.averageEntrySeparation>=70,leadTail:metrics.medianLeadTailDistance>=150&&metrics.medianLeadTailDistance<=280,cornerChecks:metrics.cornerChecksPerGame>=8,
  soundReactions:metrics.soundReactionsPerGame>=15,dangerReactions:metrics.dangerReactionsPerGame>=6,reroutes:metrics.reroutesPerGame>=1&&metrics.reroutesPerGame<=3,
  wallBangs:metrics.wallBangsPerGame>=1&&metrics.wallBangsPerGame<=4,combatReloads:metrics.exposedPartialReloadRate<=.25,looping:metrics.loopWindowRate<=.06};
const report={note:'고정 편성에 진입로와 시드만 바꾼 Phase A~F 엔진 표본. 브라우저 검증을 포함하지 않습니다.',metrics,gates,rows};
fs.writeFileSync('validation/fun-first-ai-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({metrics,gates},null,2));
process.exitCode=Object.values(gates).every(Boolean)?0:1;
