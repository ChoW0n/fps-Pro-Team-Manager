// 가상 타이머로 실제 경기의 틱 전달·취소를 검사합니다. 브라우저 플레이 검사가 아닙니다.
const fs = require('node:fs'), assert = require('node:assert/strict'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
}).outputText, file);
const root = '../artifacts/draft-order-player-generator/src/domain/';
const { startRoundPlayback } = require(root + 'realtime/roundPlayback.ts');
const { cameraViewport, combatCamera } = require(root + 'realtime/spectatorView.ts');
const { TacticalRealtimeSimulation } = require(root + 'realtime/TacticalRealtimeSimulation.ts');
const { OPERATORS } = require(root + 'Operator.ts'), { Player } = require(root + 'Player.ts');
const { NAMSAN_MAP: map } = require(root + 'tacticalMaps.ts');
const rows = [];
function test(name, run) { run(); rows.push({ name, passed: true }); console.log('PASS', name); }
function side(name) { return OPERATORS.filter(o => o.side === name).slice(0, 5).map((operator, i) => ({
  operator, side: name, teamName: name,
  player: new Player('선수' + i, '검사' + i, operator.role, 20, 75, 75, 75, 75, 75, OPERATORS, 20, 75, 65, 70, 70, 70, 70),
})); }
const input = { attackers: side('공격'), defenders: side('수비'), seed: 41, maxSeconds: 180,
  scoutPlan: { indices: [0, 1], seconds: 40, entryRoute: 0 }, defenseStyle: 'crossfire', anticipatedEntry: 0 };
const engine = new TacticalRealtimeSimulation(), expected = engine.run(input);
const originalSet = global.setTimeout, originalClear = global.clearTimeout;
let queue = [], serial = 0;
global.setTimeout = (fn, delay) => { const id = ++serial; queue.push({ id, fn, delay }); return id; };
global.clearTimeout = id => { queue = queue.filter(item => item.id !== id); };
try {
  for (const speed of [1, 2, 4]) test(`${speed}배속에서도 모든 틱을 각각 전달하고 최종 결과·사건 순서를 보존`, () => {
    const ticks = [], session = engine.createSession(input); let completed = 0;
    startRoundPlayback(session, () => ({ speed, paused: false }), tick => ticks.push(tick), result => {
      completed++; assert.deepEqual(result, expected);
    });
    let callbacks = 0;
    while (queue.length) {
      assert(callbacks++ < 2500);
      const before = ticks.length, task = queue.shift(); assert.equal(task.delay, 100 / speed); task.fn();
      assert(ticks.length - before <= 1, '한 화면 갱신에 여러 틱을 몰아넣지 않습니다');
    }
    assert.equal(completed, 1);
    assert.deepEqual(ticks.map(tick => tick.snapshot), expected.snapshots);
  });
  test('일시정지·배속 변경·해제 후 취소가 추가 틱이나 중복 완료를 만들지 않음', () => {
    const controls = { speed: 1, paused: false }; let count = 0;
    const stop = startRoundPlayback(engine.createSession(input), () => controls, () => count++, () => assert.fail('조기 완료'));
    assert.equal(count, 1); controls.paused = true;
    for (let i = 0; i < 10; i++) queue.shift().fn();
    assert.equal(count, 1); controls.speed = 4; controls.paused = false;
    queue.shift().fn(); assert.equal(count, 2); assert.equal(queue[0].delay, 25);
    const staleCallback = queue[0].fn; stop(); assert.equal(queue.length, 0); staleCallback(); assert.equal(count, 2);
  });
} finally { global.setTimeout = originalSet; global.clearTimeout = originalClear; }
test('전체 전황은 지도 네 모서리를 포함하고 확대는 지도 경계 안에 머무름', () => {
  assert.deepEqual(cameraViewport(map, { x: 50, y: 50, width: 430 }, true), { x: 0, y: 0, width: map.width, height: map.height });
  for (const x of [-100, 0, 1800, 3700]) for (const y of [-100, 0, 1200, 2500]) {
    const view = cameraViewport(map, { x, y, width: 430 }, false);
    assert(view.x >= 0 && view.y >= 0 && view.x + view.width <= map.width && view.y + view.height <= map.height);
  }
});
test('아군 전멸 뒤에도 마지막 사망자 또는 최근 실제 사건을 관전',()=>{
  const fallen=expected.snapshots[0].units.filter(unit=>unit.side==='공격').slice(0,2).map((unit,index)=>({...unit,alive:false,position:{x:900+index*80,y:700}}));
  const last=fallen[1],view=combatCamera(fallen,[],'공격',20,last.id,false);
  assert.equal(view.focusId,last.id);assert.equal(view.x,last.position.x);assert.equal(view.y,last.position.y);
  const eventView=combatCamera([], [{time:18,type:'objective',message:'설치',position:{x:2100,y:1300},seenBy:['공격']}], '공격',20,null,false);
  assert.equal(eventView.focusId,null);assert.equal(eventView.x,2100);assert.equal(eventView.y,1300);
});
test('동료에게 막힌 이동 시도는 위치와 몸 방향을 바꾸지 않음', () => {
  const unit = { ...expected.snapshots[0].units[0], position: { x: 1000, y: 1000 }, facing: 1.2 };
  const blocker = { ...unit, id: 'blocker', position: { x: 1028, y: 1000 }, velocity: { x: 5, y: 0 } };
  const terrain = { ...map, walls: [], covers: [], portals: [] };
  engine.move(unit, { x: 1200, y: 1000 }, input.attackers[0], terrain, 1, [unit, blocker], [], new Map(), new Map(), new Map(), () => {});
  assert.deepEqual(unit.position, { x: 1000, y: 1000 }); assert.equal(unit.facing, 1.2);
});
test('실제 수류탄 회피는 착지 후 시작하며 위험이 남아 있는 동안 임무를 유지', () => {
  const utilityResult = require('./fixtures/utility-encounter.cjs').utilityEncounter();
  let checked = 0;
  for (let i = 0; i < utilityResult.snapshots.length - 1; i++) {
    const snapshot = utilityResult.snapshots[i];
    for (const unit of snapshot.units.filter(unit => unit.goal.includes('수류탄 회피'))) {
      const grenade = snapshot.gadgets.find(gadget => gadget.kind === 'grenade' && snapshot.time >= gadget.landedAt);
      assert(grenade, '공중의 수류탄이 도착할 비공개 위치를 미리 사용하지 않습니다');
      const next = utilityResult.snapshots[i + 1], nextUnit = next.units.find(other => other.id === unit.id);
      if (nextUnit.alive && next.gadgets.some(gadget => gadget.id === grenade.id)) {
        assert(nextUnit.goal.includes('수류탄') || nextUnit.action === 'reload', nextUnit.goal); checked++;
      }
    }
  }
  assert(checked > 0, '실제 연속 회피 틱이 있어야 합니다');
});
test('재탈환 접촉 경계에서 0.5초 이상 매 틱 앞뒤로 되돌아가지 않음', () => {
  const scenario = { ...input, seed: 107, defenseStyle: undefined, anticipatedEntry: undefined };
  const result = engine.run(scenario), previousSteps = new Map(), streaks = new Map();
  let maximum = 0;
  for (let t = 1; t < result.snapshots.length; t++) {
    for (const unit of result.snapshots[t].units) {
      const previous = result.snapshots[t - 1].units.find(other => other.id === unit.id);
      const dx = unit.position.x - previous.position.x, dy = unit.position.y - previous.position.y;
      const length = Math.hypot(dx, dy), prior = previousSteps.get(unit.id);
      const reversal = unit.alive && length > .5 && prior?.length > .5
        && (dx * prior.dx + dy * prior.dy) / (length * prior.length) < -.5;
      const streak = reversal ? (streaks.get(unit.id) ?? 0) + 1 : 0;
      streaks.set(unit.id, streak); maximum = Math.max(maximum, streak);
      previousSteps.set(unit.id, { dx, dy, length });
    }
  }
  assert(maximum < 5, `연속 방향 반전 ${maximum}틱`);
  assert.equal(result.objective.phase, 'resolved');
});
fs.writeFileSync('validation/playback-navigation-results.json', JSON.stringify({ passed: rows.length, total: rows.length, tests: rows, note: '가상 타이머·실제 엔진 검사. 브라우저 플레이 검사가 아닙니다.' }, null, 2) + '\n');
