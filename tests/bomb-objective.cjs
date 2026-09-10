// 실제 앱의 목표 상태 기계를 불러와 시간 경계·중단·전멸 규칙을 검증합니다.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { BombObjective } = require('../artifacts/draft-order-player-generator/src/domain/realtime/BombObjective.ts');
const sites = ['A','B'].map((id,i)=>({id,label:id,zone:{x:i*200,y:0,width:100,height:100},plantPoint:{x:i*200+50,y:50}}));
const actor = (id,side,x=50,y=50)=>({id,side,alive:true,position:{x,y},canInteract:true});
const fixture = ()=>({objective:new BombObjective(sites,'a'),actors:[actor('a','공격'),actor('b','공격',80),actor('d','수비',600)]});
const plant = {actorId:'a',type:'plant',siteId:'A'};
const disable = {actorId:'d',type:'disable'};
const results=[];
function test(name,run){try{run();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
function activate(f){f.objective.step(0,f.actors,plant);f.objective.step(7,f.actors,plant);assert.equal(f.objective.snapshot().phase,'active');}
test('운반자와 사이트 안에서만 설치',()=>{const f=fixture();f.objective.step(0,f.actors,{...plant,actorId:'b'});assert.equal(f.objective.snapshot().phase,'carried');f.actors[0].position.x=150;f.objective.step(1,f.actors,plant);assert.equal(f.objective.snapshot().phase,'carried');});
test('7초 연속 설치 후 실제 위치에서 가동',()=>{const f=fixture();activate(f);assert.equal(f.objective.snapshot().activeUntil,52);assert.deepEqual(f.objective.snapshot().devicePosition,{x:50,y:50});});
test('이동·발사 등 상호작용 불가 시 설치 진행 초기화',()=>{const f=fixture();f.objective.step(0,f.actors,plant);f.objective.step(3,f.actors,plant);f.actors[0].canInteract=false;assert(f.objective.step(4,f.actors,plant).some(e=>e.kind==='plant-cancelled'));assert.equal(f.objective.snapshot().progress,0);f.actors[0].canInteract=true;f.objective.step(5,f.actors,plant);f.objective.step(8,f.actors,plant);assert.equal(f.objective.snapshot().phase,'planting');});
test('설치 중 위치 이동 시 중단',()=>{const f=fixture();f.objective.step(0,f.actors,plant);f.actors[0].position.x+=2;assert(f.objective.step(2,f.actors,plant).some(e=>e.kind==='plant-cancelled'));assert.equal(f.objective.snapshot().interactionStartedAt,2);});
test('운반자 사망 위치에 유실되고 동료만 회수',()=>{const f=fixture();f.actors[0].alive=false;f.objective.step(1,f.actors);assert.equal(f.objective.snapshot().phase,'dropped');f.actors[2].position={x:50,y:50};f.objective.step(2,f.actors,{actorId:'d',type:'pickup'});assert.equal(f.objective.snapshot().phase,'dropped');f.objective.step(3,f.actors,{actorId:'b',type:'pickup'});assert.equal(f.objective.snapshot().carrierId,'b');});
test('설치 전 공격 전멸은 수비 승리',()=>{const f=fixture();f.actors.filter(a=>a.side==='공격').forEach(a=>a.alive=false);f.objective.step(1,f.actors);assert.equal(f.objective.snapshot().reason,'attackers-eliminated');});
test('설치 후 공격 전멸은 장치 가동 유지',()=>{const f=fixture();activate(f);f.actors.filter(a=>a.side==='공격').forEach(a=>a.alive=false);f.objective.step(8,f.actors);assert.equal(f.objective.snapshot().phase,'active');f.objective.step(52,f.actors);assert.equal(f.objective.snapshot().reason,'bombs-defused');});
test('수비 전멸은 공격 승리',()=>{const f=fixture();f.actors[2].alive=false;f.objective.step(1,f.actors);assert.equal(f.objective.snapshot().winner,'공격');});
test('설치 없는 시간 초과는 인원과 무관하게 수비 승리',()=>{const f=fixture();f.objective.step(180,f.actors);assert.equal(f.objective.snapshot().reason,'time-expired');});
test('시간 종료 직전 시작한 설치는 연장 가능',()=>{const f=fixture();f.objective.step(179.9,f.actors,plant);f.objective.step(180,f.actors,plant);assert.equal(f.objective.snapshot().phase,'planting');f.objective.step(186.9,f.actors,plant);assert.equal(f.objective.snapshot().phase,'active');});
test('연장 설치 중단 즉시 수비 승리',()=>{const f=fixture();f.objective.step(179,f.actors,plant);f.objective.step(181,f.actors);assert.equal(f.objective.snapshot().reason,'time-expired');});
test('제한 시각에 새 설치 시작 금지',()=>{const f=fixture();f.objective.step(180,f.actors,plant);assert.equal(f.objective.snapshot().reason,'time-expired');});
test('수비가 장치 옆에서 7초 무력화',()=>{const f=fixture();activate(f);f.actors[2].position={x:70,y:50};f.objective.step(10,f.actors,disable);f.objective.step(17,f.actors,disable);assert.equal(f.objective.snapshot().reason,'device-disabled');});
test('무력화 중단은 장치 가동 시간을 늘리지 않음',()=>{const f=fixture();activate(f);f.actors[2].position={x:70,y:50};f.objective.step(10,f.actors,disable);f.objective.step(13,f.actors);assert.equal(f.objective.snapshot().phase,'active');assert.equal(f.objective.snapshot().activeUntil,52);});
test('해체 완료와 무력화 완료 동시 틱 우선순위',()=>{const f=fixture();activate(f);f.actors[2].position={x:70,y:50};f.objective.step(45,f.actors,disable);f.objective.step(52,f.actors,disable);assert.equal(f.objective.snapshot().reason,'bombs-defused');});
test('스냅샷 수정과 중복 틱이 엔진을 바꾸지 않음',()=>{const f=fixture();activate(f);f.objective.snapshot().devicePosition.x=999;assert.equal(f.objective.snapshot().devicePosition.x,50);assert.deepEqual(f.objective.step(7,f.actors),[]);assert.throws(()=>f.objective.step(6,f.actors));});
test('잘못된 규칙 수치 거부',()=>{assert.throws(()=>new BombObjective(sites,'a',{activeSeconds:NaN}));assert.throws(()=>new BombObjective(sites.slice(0,1),'a'));});
fs.writeFileSync(require('node:path').join(__dirname,'../validation/bomb-objective-results.json'),JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,tests:results},null,2)+'\n');
process.exitCode=results.every(r=>r.pass)?0:1;
