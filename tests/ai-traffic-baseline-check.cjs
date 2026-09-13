// 현재 파일을 덮어쓰지 않고 기준 엔진 소스만 로더에 주입해 동일 회귀의 실패를 비교합니다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const base='7fb158140321185853f0c0516e0edcaa7be4a8e0';
const engine='artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts';
const source=execFileSync('git',['show',base+':'+engine],{encoding:'utf8'}),results=[];
for(const test of ['entry-formation','vertical-routes'])for(const version of ['baseline','current']){
 const loader=`const fs=require('node:fs'),path=require('node:path');const source=fs.readFileSync(0,'utf8'),read=fs.readFileSync;fs.readFileSync=function(p,...a){return typeof p==='string'&&path.resolve(p)===path.resolve(${JSON.stringify(engine)})?source:read.call(this,p,...a)};require(${JSON.stringify('./tests/'+test+'.cjs')});`;
 const run=version==='baseline'?spawnSync(process.execPath,['-e',loader],{input:source,encoding:'utf8'}):spawnSync(process.execPath,['tests/'+test+'.cjs'],{encoding:'utf8'});
 results.push({test,version,exitCode:run.status,stdout:run.stdout,stderr:run.stderr});console.log({test,version,exitCode:run.status});
}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(__dirname,'../validation/ai-traffic-baseline-check.json'),JSON.stringify({base,baselineEngineSha256:hash(source),currentEngineSha256:hash(fs.readFileSync(engine)),results},null,2)+'\n');
process.exitCode=results.every(row=>row.exitCode===0)?0:1;
