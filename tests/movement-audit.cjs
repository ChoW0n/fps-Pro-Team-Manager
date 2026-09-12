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
  const input={attackers:side('공격'),defenders:side('수비'),seed,maxSeconds:180};
  if(process.argv[3])input.scoutPlan={indices:process.argv[3]==='scout'?[0,1]:[],seconds:40,entryRoute:0};
  return input;
}
// 정당한 수비 대기와 구분하기 위해 이동 상태의 정지, 실제 반전, 반복 이동만 집계합니다.
function audit(seed) {
  const started=performance.now(), result=new TacticalRealtimeSimulation().run(fixture(seed));
  let reversals=0, movingButStationaryTicks=0, loopWindows=0, blockedEvents=0;
  const priorSteps=new Map();
  for(let t=1;t<result.snapshots.length;t++) {
    const current=result.snapshots[t], previous=result.snapshots[t-1];
    for(let i=0;i<current.units.length;i++) {
      const u=current.units[i], p=previous.units[i];
      if(!u.alive)continue;
      const dx=u.position.x-p.position.x,dy=u.position.y-p.position.y,len=Math.hypot(dx,dy);
      const prior=priorSteps.get(u.id);
      if(len>.5&&prior&&prior.len>.5&&(dx*prior.dx+dy*prior.dy)/(len*prior.len)<-.5)reversals++;
      priorSteps.set(u.id,{dx,dy,len});
      if(['approach','search','reposition'].includes(u.action)&&len<.05)movingButStationaryTicks++;
      if(t>=30&&t%30===0) {
        const history=result.snapshots.slice(t-30,t+1).map(s=>s.units[i]);
        const travelled=history.slice(1).reduce((sum,v,k)=>sum+separation(v.position,history[k].position),0);
        if(travelled>60&&separation(history[0].position,u.position)<12)loopWindows++;
      }
    }
  }
  blockedEvents=result.events.filter(e=>/통과 순서|경로 없음|경로 차단/.test(e.goal??'')).length;
  return {seed,ms:Math.round(performance.now()-started),duration:result.executionTime,winner:result.winner,
    reason:result.objective.reason,plantedAt:result.events.find(event=>event.goal==='planted')?.time??null,
    operationTransitions:result.events.filter(event=>event.goal?.startsWith('operation:')).map(event=>({time:event.time,phase:event.goal})),
    firstShot:result.events.find(e=>e.type==='shot')?.time??null,shots:result.validation.shots,
    reversals,movingButStationaryTicks,loopWindows,blockedEvents};
}
const seeds=[3,11,23,41,51,81,107,149];
const report={scenario:process.argv[3]??'distributed-starts',map:{id:NAMSAN_MAP.id,width:NAMSAN_MAP.width,height:NAMSAN_MAP.height},rows:seeds.map(audit)};
const name=process.argv[2]??'movement-audit.json';
fs.writeFileSync(path.join(__dirname,'../validation',path.basename(name)),JSON.stringify(report,null,2)+'\n');
console.table(report.rows);
