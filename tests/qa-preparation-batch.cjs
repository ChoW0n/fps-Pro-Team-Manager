// 같은 실제 편성·시드·UI 준비 입력으로 수정 전후 승패와 재진입을 측정합니다.
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts');
const {completeOperatorDraft,confirmOperatorDraft}=require(root+'operatorDraft.ts');
/** 난수 선수 생성에 의한 입력 차이를 없애고 실제 편성 확인 함수를 통과시킵니다. */
function team(side){const ops=OPERATORS.filter(o=>o.side===side).slice(0,5);return {name:side,players:ops.map((o,i)=>new Player('검사'+i,'선수'+i,o.role,20,75,75,75,75,75,[o],20,75,65,70,70,70,70))};}
/** 준비 화면과 동일하게 명시적 선발조·수색 시간·진입로를 전달합니다. */
function fixture(seed,count,entryRoute=0){const units=side=>{const t=team(side);return confirmOperatorDraft(t,side,completeOperatorDraft(t,side,[null,null,null,null,null]));};return {attackers:units('공격'),defenders:units('수비'),seed,maxSeconds:180,scoutPlan:{indices:Array.from({length:count},(_,i)=>i),seconds:25,entryRoute}};}
/** 전멸도 원래 결과대로 기록하며 재진입 불능과 구별합니다. */
function measure(input){const r=new TacticalRealtimeSimulation().run(input),initial=r.snapshots[0];return {seed:input.seed,scoutPlan:input.scoutPlan,winner:r.winner,reason:r.objective.reason,entering:r.snapshots.some(s=>s.operation.phase==='entering'),duration:r.executionTime,rally:initial.operation.rally,finalPhase:r.snapshots.at(-1).operation.phase};}
module.exports={fixture,measure};
if(require.main===module){const rows=[],count=Number(process.argv[3]??2),games=Number(process.argv[4]??20),routes=Number(process.argv[5]??1);for(let route=0;route<routes;route++)for(let seed=1;seed<=games;seed++)rows.push(measure(fixture(seed,count,route)));const summary={games:rows.length,entering:rows.filter(r=>r.entering).length,attackWins:rows.filter(r=>r.winner==='공격').length,eliminated:rows.filter(r=>r.reason==='attackers-eliminated').length};fs.writeFileSync(process.argv[2]??'validation/qa-preparation-batch.json',JSON.stringify({summary,rows},null,2)+'\n');console.log(summary);}
