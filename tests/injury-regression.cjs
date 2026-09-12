// 실제 부상 함수와 동일 틱 엔진을 실행합니다. 의료·레식 고증 검사가 아닙니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root='../artifacts/draft-order-player-generator/src/domain/';
const {injure,bleed,revive,hitRegion}=require(root+'realtime/injury.ts');
const {TacticalRealtimeSimulation}=require(root+'realtime/TacticalRealtimeSimulation.ts');
const {OPERATORS}=require(root+'Operator.ts'),{Player}=require(root+'Player.ts');
let passed=0;
/** 검사마다 독립된 선수를 생성합니다. */
function unit(id='casualty'){return {id,side:'공격',alive:true,hp:100,position:{x:100,y:100},velocity:{x:0,y:0},facing:0,action:'hold',reloadRemaining:0};}
/** 실패 시 즉시 종료해 부분 통과를 전체 통과로 표시하지 않습니다. */
function test(name,fn){fn();passed++;console.log('PASS',name);}
test('첫 몸통 치명상은 다운, 장전·방패 중단',()=>{const u=unit();u.reloadRemaining=2;u.shieldRaised=true;assert.equal(injure(u,110,false,0),'downed');assert(u.alive&&u.downed);assert.equal(u.reloadRemaining,0);assert.equal(u.shieldRaised,false);});
test('머리 명중은 다운 없이 즉사',()=>{const u=unit();assert.equal(injure(u,25,true,0),'death');assert(!u.alive&&!u.downed);});
test('다운 추가 치명상은 사망, 중복 사망 없음',()=>{const u=unit();injure(u,110,false,0);assert.equal(injure(u,25,false,1),'death');assert.equal(injure(u,25,false,2),undefined);});
test('지혈은 출혈을 늦추지만 무한 생존 불가',()=>{const u=unit();injure(u,110,false,0);assert.equal(bleed(u,30),false);assert.equal(u.downed.remaining,15);assert.equal(bleed(u,30),true);});
test('포복 출혈·기간 종료',()=>{const u=unit();injure(u,110,false,0);u.downed.mode='crawl';assert.equal(bleed(u,30),true);});
test('4초 정지 소생과 재다운 사망',()=>{const u=unit(),h=unit('helper');h.position.x=135;injure(u,110,false,0);assert(!revive(h,u,1,true));assert(!revive(h,u,4.9,true));assert(revive(h,u,5,true));assert.equal(u.hp,20);assert(!u.downed&&u.alive);assert.equal(injure(u,25,false,6),'death');});
test('이동·피격·위협·거리로 소생 초기화',()=>{for(const reason of ['move','damage','danger','range']){const u=unit(),h=unit('helper');h.position.x=135;injure(u,110,false,0);revive(h,u,1,true);if(reason==='move')h.position.y+=2;if(reason==='damage')injure(h,1,false,4);if(reason==='range')h.position.x=300;assert(!revive(h,u,4,reason!=='danger'));assert(!revive(h,u,5,reason!=='danger'));}});
test('자신·상대·다운된 구조자·사망자 소생 금지',()=>{for(const reason of ['self','enemy','down','dead']){const u=unit(),h=reason==='self'?u:unit('helper');injure(u,110,false,0);if(reason==='enemy')h.side='수비';if(reason==='down')injure(h,110,false,0);if(reason==='dead')injure(u,25,true,.1);assert(!revive(h,u,1,true));assert(!revive(h,u,10,true));}});
test('현재 자세와 실제 탄착 높이로 머리·몸·빗나감 구분',()=>{const u=unit();assert.equal(hitRegion(64,u),'head');assert.equal(hitRegion(42,u),'body');assert.equal(hitRegion(80,u),undefined);u.locomotion='crouch';assert.equal(hitRegion(64,u),undefined);assert.equal(hitRegion(44,u),'head');u.locomotion='crawl';assert.equal(hitRegion(14,u),'head');assert.equal(hitRegion(5,u),'body');});
/** 선수 생성기의 난수와 경기 시드를 분리합니다. */
function input(seed){const side=name=>OPERATORS.filter(o=>o.side===name).slice(0,5).map((operator,i)=>({operator,side:name,teamName:name,player:new Player('검사'+i,'부상'+i,operator.role,20,75,75,75,75,75,[operator],20,75,65,70,70,70,70)}));return {attackers:side('공격'),defenders:side('수비'),seed,maxSeconds:90,scoutPlan:{indices:[],seconds:25,entryRoute:0}};}
test('동일 시드 run/session 사건·스냅샷 일치',()=>{const args=input(41),sim=new TacticalRealtimeSimulation(),a=sim.run(args),session=new TacticalRealtimeSimulation().createSession(args);for(let i=0;i<2000&&!session.isComplete;i++)session.step();assert(session.isComplete);assert.deepEqual(a,session.getResult());});
test('실제 경기의 다운·행동 제한·스냅샷 사본·종료',()=>{let downs=0,revives=0;for(const seed of [1,7,19,41]){const result=new TacticalRealtimeSimulation().run(input(seed));downs+=result.events.filter(e=>e.type==='downed').length;revives+=result.events.filter(e=>e.type==='revive').length;for(const snap of result.snapshots)for(const u of snap.units){if(u.downed){assert(u.alive);assert.equal(u.action,'downed');assert.equal(u.reloadRemaining,0);assert(!result.events.some(e=>e.time===snap.time&&e.actor===u.id&&e.type==='shot'));}if(!u.alive)assert.equal(u.action,'dead');}assert.equal(result.objective.phase,'resolved');}assert(downs>0,'검사 경기에서 실제 다운이 발생해야 함');console.log({downs,revives});});
// 일반 경기의 소생 빈도와 분리하여, 실제 사격·엄폐·구조가 발생하는 고정 입력도 검증합니다.
test('실제 소생 사건은 구조자의 정지 시간·대상 회복과 일치',()=>{let count=0;for(const result of [...[1,7,19,41].map(seed=>new TacticalRealtimeSimulation().run(input(seed))),require('./fixtures/rescue-under-cover.cjs').rescueUnderCover()]){for(const e of result.events.filter(e=>e.type==='revive')){count++;const now=result.snapshots.find(s=>s.time===e.time),prior=result.snapshots.find(s=>s.time===Math.round((e.time-.1)*10)/10);const helper=prior.units.find(u=>u.id===e.actor),target=now.units.find(u=>u.id===e.target);assert(helper.reviving);assert(e.time-helper.reviving.startedAt>=4-1e-6);assert(target.alive&&!target.downed&&target.hp===20);}}assert(count>0);});
console.log(`${passed} injury checks passed`);
fs.writeFileSync(require('node:path').join(__dirname,'../validation/injury-results.json'),JSON.stringify({passed,total:12,seeds:[1,7,19,41],additionalFixture:{name:'rescue-under-cover',seed:41},scope:'Injury unit checks, four normal matches and a separate real combat rescue fixture; not browser play or Siege rules verification'},null,2)+'\n');
