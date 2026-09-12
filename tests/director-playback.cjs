// 실제 세션과 가상 타이머로 감독 지시의 전달 순서·일시정지·취소를 검사합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {startRoundPlayback}=require(root+'realtime/roundPlayback.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {fixture}=require('./qa-preparation-batch.cjs');
const originalSet=global.setTimeout,originalClear=global.clearTimeout;let tasks=[];
global.setTimeout=fn=>{tasks.push(fn);return fn;};global.clearTimeout=fn=>{tasks=tasks.filter(task=>task!==fn);};
try{
 const input=fixture(41,0,0),session=new TacticalRealtimeSimulation().createSession(input);
 const orders=[{side:'공격',mode:'hold',label:'대기'},{side:'공격',mode:'push',label:'진입'},{side:'공격',mode:'retreat',label:'후퇴'},{side:'공격',mode:'route',routeIndex:2,label:'경로 변경'}];
 const controls={paused:true,speed:1},events=[];
 const stop=startRoundPlayback(session,()=>controls,tick=>events.push(...tick.events),()=>{},()=>orders.shift());
 for(let i=0;i<5;i++)tasks.shift()();assert.equal(orders.length,4,'정지 중 지시 보존');
 controls.paused=false;for(let i=0;i<8;i++)tasks.shift()();
 assert.deepEqual(events.filter(event=>event.actor==='director').map(event=>event.goal),['대기','진입','후퇴','경로 변경']);
 stop();assert.equal(tasks.length,0,'취소 후 추가 계산 금지');
 console.log('PASS 실제 엔진 4개 감독 명령 · 정지 보존 · 취소');
}finally{global.setTimeout=originalSet;global.clearTimeout=originalClear;}
