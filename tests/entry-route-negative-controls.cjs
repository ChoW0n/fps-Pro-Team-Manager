// 테스트 입력 수정이 실제 결함을 숨기지 않는지, 메모리 안에서만 결함을 주입합니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const enginePath=path.resolve(__dirname,'../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
const source=fs.readFileSync(enginePath,'utf8');
const cases=[
 {name:'출발 시차 제거',test:'entry-formation',engineFrom:'entryGroup.indexOf(unit)*.9',engineTo:'entryGroup.indexOf(unit)*0',expected:'자기 출발 시차 전에 진입 이동 금지'},
 {name:'격리 스폰 누락',test:'vertical-routes',testFrom:'defenderSpawn:{x:2630,y:2630}',testTo:'defenderSpawn:NAMSAN_MAP.defenderSpawn',expected:'격리 수비수의 실제 스폰·이동 유지'},
 {name:'설치 행동 차단',test:'vertical-routes',engineFrom:'if (!openingSearch && objectiveTask && withinReach',engineTo:'if (false && !openingSearch && objectiveTask && withinReach',expected:'설치 5'},
];
const loader=`const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const input=JSON.parse(fs.readFileSync(0,'utf8')),read=fs.readFileSync;
fs.readFileSync=function(p,...args){return typeof p==='string'&&path.resolve(p)===input.enginePath?input.engineSource:read.call(this,p,...args)};
const m=new Module(input.testPath,module);m.filename=input.testPath;m.paths=Module._nodeModulePaths(path.dirname(input.testPath));m._compile(input.testSource,input.testPath);`;
const rows=[];
for(const c of cases){
 const testPath=path.resolve(__dirname,c.test+'.cjs'),testSource=fs.readFileSync(testPath,'utf8');
 const from=c.engineFrom??c.testFrom,target=c.engineFrom?source:testSource;
 assert.equal(target.split(from).length,2,'정확히 한 곳에만 결함 주입');
 const input={enginePath,testPath,engineSource:c.engineFrom?source.replace(c.engineFrom,c.engineTo):source,testSource:c.testFrom?testSource.replace(c.testFrom,c.testTo):testSource};
 const r=spawnSync(process.execPath,['-e',loader],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:4*1024*1024});
 const detected=r.status===1&&r.stderr.includes(c.expected);
 rows.push({name:c.name,exitCode:r.status,expected:c.expected,detected});console.log(rows.at(-1));
 if(!detected)console.error(r.stdout,r.stderr);
}
fs.writeFileSync('validation/entry-route-negative-controls.json',JSON.stringify(rows,null,2)+'\n');
assert(rows.every(row=>row.detected),'모든 실제 결함 주입을 잡아야 합니다');
