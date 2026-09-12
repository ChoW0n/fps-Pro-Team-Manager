// 같은 선수·시드에서 이동 정체와 방향 반전을 관찰합니다. 지표 자체는 합격 판정이 아닙니다.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
}).outputText, filename);
const root = '../artifacts/draft-order-player-generator/src/domain/';
const { TacticalRealtimeSimulation } = require(root + 'realtime/TacticalRealtimeSimulation.ts');
const { OPERATORS } = require(root + 'Operator.ts');
const { Player } = require(root + 'Player.ts');
const { NAMSAN_MAP } = require(root + 'tacticalMaps.ts');
const separation = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
// 선수 생성 난수를 쓰지 않고 같은 공개·내부 입력을 직접 구성합니다.
function fixture(seed) {
  const side = name => OPERATORS.filter(o=>o.side===name).slice(0,5).map((o,i)=>({
    operator:o, side:name, teamName:name,
    player:new Player(`선수${i}`,`검사${i}`,o.role,20,75,75,75,75,75,[o],20,75,65,70,70,70,70),
  }));
  // UI의 기본 준비도 scoutPlan을 명시합니다. 생략 경로를 기본 밸런스 근거로 사용하지 않습니다.
  const input={attackers:side('공격'),defenders:side('수비'),seed,maxSeconds:180,scoutPlan:{indices:process.argv.includes('scout')?[0,1]:[],seconds:40,entryRoute:0}};
  return input;
}

const rows=[];
for(const seed of [211,317,419,523])for(const targetSite of ['A','B'])for(const siteApproach of [0,1,2])for(const composition of [0,1]){
 const input=fixture(seed);Object.assign(input,{targetSite,siteApproach});
 if(composition){for(const side of ['attackers','defenders']){const operators=OPERATORS.filter(o=>o.side===input[side][0].side);input[side]=input[side].map((m,i)=>({...m,operator:operators[(i+1)%operators.length]}));}}
 const r=new TacticalRealtimeSimulation().run(input);rows.push({seed,scoutPlan:input.scoutPlan,targetSite,siteApproach,composition,winner:r.winner,reason:r.objective.reason,duration:r.executionTime,planted:r.events.some(e=>e.goal==='planted')});
}
const summary=['A','B'].map(site=>{const r=rows.filter(r=>r.targetSite===site);return{site,games:r.length,attackWins:r.filter(r=>r.winner==='공격').length,defenseWins:r.filter(r=>r.winner==='수비').length,planted:r.filter(r=>r.planted).length};});
fs.writeFileSync('validation/route-balance-matrix.json',JSON.stringify({summary,rows,limits:'48 deterministic cases with explicit UI scoutPlan, one map, equal player stats, two compositions, three approach choices, four new seeds; not production balance approval.'},null,2)+'\n');console.table(summary);
