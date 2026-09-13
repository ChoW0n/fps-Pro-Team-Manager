// 이번 변경이 건드리는 감각·이동·전투 계약을 실패 즉시 중단 방식으로 검증합니다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const tests=['sound-attention','navigation-traffic','unit-action-rules','fun-first-ai','realtime-regression',
 'combat-overhaul','injury-regression','preparation-operation','tactical-pressure','spectator-continuity',
 'movement-audit','playback-navigation','bomb-objective','entry-formation','vertical-routes'];
const logDirectory=fs.mkdtempSync('/tmp/ai-traffic-validation-'),results=[];
for(const test of tests){
 const started=Date.now(),run=spawnSync(process.execPath,[path.join(__dirname,test+'.cjs')],{encoding:'utf8',maxBuffer:16*1024*1024});
 fs.writeFileSync(path.join(logDirectory,test+'.log'),(run.stdout??'')+(run.stderr??''));
 results.push({test,exitCode:run.status,seconds:(Date.now()-started)/1000,error:run.error?.message});
 console.log(results.at(-1));
 if(run.status!==0){console.error((run.stdout??'')+(run.stderr??''));break;}
}
const engine=fs.readFileSync(path.join(__dirname,'../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts'));
const report={engineSha256:crypto.createHash('sha256').update(engine).digest('hex'),planned:tests.length,passed:results.filter(r=>r.exitCode===0).length,results};
fs.writeFileSync(path.join(__dirname,'../validation/ai-traffic-regressions.json'),JSON.stringify(report,null,2)+'\n');
console.log({passed:report.passed,planned:report.planned,logDirectory});
process.exitCode=report.passed===report.planned?0:1;
