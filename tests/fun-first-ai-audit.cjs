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
  const kills={};for(const death of deaths)if(death.actor)kills[death.actor]=(kills[death.actor]??0)+1;
  const liveTicks=result.snapshots.flatMap(snapshot=>snapshot.units.filter(unit=>unit.alive));
  const decisions=new Set(liveTicks.map(unit=>unit.decision).filter(Boolean));
  const speeds=input.attackers.map(unit=>operatorBaseSpeed(unit.operator.callSign)+unit.player.teamSynergy/20);
  rows.push({seed:input.seed,winner:result.winner,seconds:result.executionTime,shots:shots.length,hits:hits.length,heads:heads.length,deaths:deaths.length,
    fourKills:Math.max(0,...Object.values(kills))>=4,decisionKinds:decisions.size,undefinedDecisionTicks:liveTicks.filter(unit=>!unit.decision).length,totalLiveTicks:liveTicks.length,
    attackSpeedVariation:(Math.max(...speeds)-Math.min(...speeds))/(speeds.reduce((sum,value)=>sum+value,0)/speeds.length)});
  if(seed%4===0||seed===games)console.log('실행',seed+'/'+games);
}
const total=key=>rows.reduce((sum,row)=>sum+row[key],0),rate=(part,whole)=>part/Math.max(1,whole);
const metrics={games,accuracy:rate(total('hits'),total('shots')),headRate:rate(total('heads'),total('hits')),medianDeaths:median(rows.map(row=>row.deaths)),fourKillRate:rate(rows.filter(row=>row.fourKills).length,games),
  medianAttackSpeedVariation:median(rows.map(row=>row.attackSpeedVariation)),attackWinRate:rate(rows.filter(row=>row.winner==='공격').length,games),
  minimumDecisionKinds:Math.min(...rows.map(row=>row.decisionKinds)),undefinedDecisionRate:rate(total('undefinedDecisionTicks'),total('totalLiveTicks'))};
const gates={accuracy:metrics.accuracy<=.6,headRate:metrics.headRate<=.12,medianDeaths:metrics.medianDeaths>=4&&metrics.medianDeaths<=5,fourKillRate:metrics.fourKillRate<=.12,
  attackSpeedVariation:metrics.medianAttackSpeedVariation>=.25,attackWinRate:metrics.attackWinRate>=.4&&metrics.attackWinRate<=.6,decisionKinds:metrics.minimumDecisionKinds>=12,undefinedDecisionRate:metrics.undefinedDecisionRate<=.15};
const report={note:'고정 편성에 진입로와 시드만 바꾼 Phase A/B 엔진 표본. 브라우저 검증을 포함하지 않습니다.',metrics,gates,rows};
fs.writeFileSync('validation/fun-first-ai-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({metrics,gates},null,2));
process.exitCode=Object.values(gates).every(Boolean)?0:1;
