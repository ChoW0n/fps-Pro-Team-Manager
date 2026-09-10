// 같은 공격 작전을 반복할 때 이전 관측에 따른 상대의 편성·배치와 실제 결과를 기록합니다.
const fs=require('node:fs'),ts=require('typescript'),path=require('node:path');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const root='../artifacts/draft-order-player-generator/src/domain/';const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts'),{OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts');
const {planOpponent,observeRound,opponentDraft}=require(root+'opponentAdaptation.ts'),{confirmOperatorDraft}=require(root+'operatorDraft.ts');
const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,index)=>({operator,side:name,teamName:name,player:new Player('선수'+index,'감사'+index,operator.role,20,75,75,75,75,75,OPERATORS,20,75,65,70,70,70,70)}));
const rows=[];
for(let entry=0;entry<5;entry++){
 const history=[],team={name:'수비',players:side('수비').map(unit=>unit.player)};
 for(let round=0;round<3;round++){
  const seed=41+round*10,plan=planOpponent(history,'수비',seed),lineup=opponentDraft(team,'수비',plan);
  const input={attackers:side('공격'),defenders:confirmOperatorDraft(team,'수비',lineup),seed,maxSeconds:180,scoutPlan:{indices:[],seconds:25,entryRoute:entry},attackStyle:'balanced',defenseStyle:plan.defenseStyle,anticipatedEntry:plan.anticipatedEntry};
  const result=new TacticalRealtimeSimulation().run(input),observed=observeRound(result,'수비');history.push(observed);
  rows.push({entry,round:round+1,seed,defense:plan.defenseStyle,anticipatedEntry:plan.anticipatedEntry??null,observedEntry:observed.entry??null,lineup,winner:result.winner,reason:result.objective.reason,seconds:result.executionTime,shots:result.validation.shots,minimumTeamSeparation:result.validation.minimumTeamSeparation});
 }
}
fs.writeFileSync(path.join(__dirname,'../validation/adaptation-audit.json'),JSON.stringify({note:'동일 능력치·다섯 진입 방향별 3회 반복 작전. 전체 승률 균형 검증은 아님.',rows},null,2)+'\n');console.table(rows.map(({lineup,...row})=>row));
