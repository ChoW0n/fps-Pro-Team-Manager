const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true}}).outputText, file);
const root = '../artifacts/draft-order-player-generator/src/domain/';
const {nextMatchRound, recordMatchRound, matchScore} = require(root + 'tacticalMatch.ts');
const results = [];
function test(name, run) { try {run(); results.push({name, pass: true}); console.log('PASS', name);} catch(error) {results.push({name, pass: false, error: error.message}); console.error('FAIL', name, error.message);} }
function win(state, home) {const next = nextMatchRound(state); return recordMatchRound(state, next.attempt, home ? next.homeSide : next.homeSide === '공격' ? '수비' : '공격');}
function start() {return {seed: 41, rounds: []};}
test('6라운드 뒤 공수 교대해도 홈·원정 승점 유지', () => {
  let state = start(); for(let i = 0; i < 6; i++) {assert.equal(nextMatchRound(state).homeSide, '공격'); state = win(state, i % 2 === 0);}
  assert.equal(nextMatchRound(state).homeSide, '수비'); state = win(state, true); assert.deepEqual(matchScore(state), [4,3]);
});
test('7:0 및 7:5는 정규 경기 종료, 종료 후 추가 결과 거부', () => {
  for(const losses of [0,5]) {let state = start(); for(let i = 0; i < losses; i++) state = win(state, false); for(let i = 0; i < 7; i++) state = win(state, true);
    assert.equal(nextMatchRound(state).finished, true); assert.equal(win(state, false), state);}
});
test('6:6은 연장, 공수 매 라운드 교대, 8:7에서 종료', () => {
  let state = start(); for(let i = 0; i < 12; i++) state = win(state, i % 2 === 0);
  assert.equal(nextMatchRound(state).overtime, true); assert.equal(nextMatchRound(state).finished, false);
  state = win(state, true); assert.equal(nextMatchRound(state).homeSide, '수비'); assert.equal(nextMatchRound(state).finished, false);
  state = win(state, false); assert.equal(nextMatchRound(state).homeSide, '공격'); state = win(state, false);
  assert.deepEqual(matchScore(state), [7,8]); assert.equal(nextMatchRound(state).finished, true);
});
test('무승부는 점수·공수·라운드 유지, 새 시드로 재경기', () => {
  const state = start(), before = nextMatchRound(state), replay = nextMatchRound(recordMatchRound(state, 0, '무승부'));
  assert.deepEqual(replay.score, [0,0]); assert.equal(replay.round, before.round); assert.equal(replay.homeSide, before.homeSide); assert.notEqual(replay.seed, before.seed);
});
test('동일 종료 콜백·지난 라운드 콜백 중복 집계 방지', () => {
  const state = win(start(), true); assert.equal(recordMatchRound(state, 0, '공격'), state); assert.equal(recordMatchRound(state, 2, '공격'), state); assert.deepEqual(matchScore(state), [1,0]);
});
test('경기 이력 입력 불변·동일 시드와 이력에서 다음 라운드 재현', () => {
  const state = start(), copy = JSON.stringify(state), next = win(state, true); assert.equal(JSON.stringify(state), copy);
  assert.deepEqual(nextMatchRound(next), nextMatchRound(JSON.parse(JSON.stringify(next))));
});
test('공수 교대 입력은 실제 습득 편성과 새 엔진 생존·탄약 상태로 시작', () => {
  const {TeamGenerator} = require(root + 'TeamGenerator.ts'); const {completeOperatorDraft, confirmOperatorDraft} = require(root + 'operatorDraft.ts');
  const {TacticalRealtimeSimulation} = require(root + 'realtime/TacticalRealtimeSimulation.ts');
  const teams = new TeamGenerator().generateTenTeams(), blank = [null,null,null,null,null];
  let state = start(); for(let i = 0; i < 6; i++) state = win(state, i % 2 === 0);
  const next = nextMatchRound(state);
  const attackers = confirmOperatorDraft(teams[1], '공격', completeOperatorDraft(teams[1], '공격', blank));
  const defenders = confirmOperatorDraft(teams[0], next.homeSide, completeOperatorDraft(teams[0], next.homeSide, blank));
  const input = {attackers, defenders, seed: next.seed, maxSeconds: 1};
  const session = new TacticalRealtimeSimulation().createSession(input), first = session.step();
  assert.equal(first.snapshot.units.length, 10); assert(first.snapshot.units.every(unit => unit.alive && unit.hp === unit.maxHp && unit.ammo === unit.magazineSize));
  while(!session.isComplete) session.step(); const result = session.getResult();
  assert.deepEqual(result, new TacticalRealtimeSimulation().run(input));
  assert.equal(recordMatchRound(state, next.attempt, result.winner).rounds.length, 7);
});
fs.writeFileSync('validation/tactical-match-results.json', JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,tests:results},null,2)+'\n');
process.exitCode = results.every(result => result.pass) ? 0 : 1;
