// 같은 편성·시드에서 판단 문구와 실제 이동을 함께 추적합니다. --audit도 실패 수치를 보존합니다.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fixture } = require('./qa-preparation-batch.cjs');
const { TacticalRealtimeSimulation } = require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
const rows = [], transitions = new Map(), holdSamples = [], trafficSamples = [];
for (let g = 0; g < Number(process.argv[3] ?? 8); g++) {
  const input = { ...fixture(7017 + g * 17, 0, g % 5), maxSeconds: 150 };
  const engine = new TacticalRealtimeSimulation(), move = engine.move;
  engine.move = function (...args) {
    const [unit, goal, , , time, , , plans, , , , reservations] = args;
    const before = { position: { ...unit.position }, action: unit.action, goal: unit.goal, decision: unit.decision };
    move.apply(this, args);
    if (unit.action === 'hold' && Math.hypot(unit.velocity.x, unit.velocity.y) > 1 && holdSamples.length < 30)
      holdSamples.push({ seed: input.seed, time, id: unit.id, before, after: { position: unit.position, action: unit.action, goal: unit.goal }, destination: goal, traversal: unit.traversal });
    const plan = plans.get(unit.id);
    if (plan && plan.points.length - plan.index > 20 && trafficSamples.length < 30)
      trafficSamples.push({ seed: input.seed, time, id: unit.id, remainingPoints: plan.points.length - plan.index, reservations: [...(reservations ?? [])] });
  };
  const result = engine.run(input), history = new Map();
  let changes = 0, returns = 0, holdMoving = 0, longestWait = 0;
  const waits = new Map();
  for (const snap of result.snapshots) for (const unit of snap.units.filter(unit => unit.alive && !unit.downed)) {
    if (unit.action === 'hold' && Math.hypot(unit.velocity.x, unit.velocity.y) > 1) holdMoving++;
    if (/통과 순서 대기|문 통과 순서 대기|통행 경로 재탐색/.test(unit.goal)) {
      if (!waits.has(unit.id)) waits.set(unit.id, snap.time);
      longestWait = Math.max(longestWait, snap.time - waits.get(unit.id));
    } else waits.delete(unit.id);
    const h = history.get(unit.id) ?? [];
    if (h.at(-1)?.decision === unit.decision) continue;
    if (h.length) {
      changes++;
      if (h.at(-2)?.decision === unit.decision && snap.time - h.at(-1).time < 2) {
        returns++;
        const key = h.at(-1).decision + ' → ' + unit.decision;
        transitions.set(key, (transitions.get(key) ?? 0) + 1);
      }
    }
    h.push({ decision: unit.decision, time: snap.time }); history.set(unit.id, h.slice(-2));
  }
  rows.push({ seed: input.seed, inputSha256: crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'), changes, returns, holdMoving, longestWait, winner: result.winner, duration: result.executionTime });
  console.log(rows.at(-1));
}
const changes = rows.reduce((n, row) => n + row.changes, 0), returns = rows.reduce((n, row) => n + row.returns, 0);
const engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname, '../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts'))).digest('hex');
const report = { engineSha256, games: rows.length, changes, returns, returnPercent: 100 * returns / Math.max(1, changes), holdMoving: rows.reduce((n, row) => n + row.holdMoving, 0), longestWait: Math.max(...rows.map(row => row.longestWait)), rows, transitions: [...transitions].sort((a,b) => b[1]-a[1]), holdSamples, trafficSamples };
fs.writeFileSync(process.argv[2] ?? 'validation/ai-traffic-continuity.json', JSON.stringify(report, null, 2) + '\n');
console.log({ ...report, rows: undefined, transitions: report.transitions.slice(0, 8), holdSamples: undefined, trafficSamples: undefined });
if (!process.argv.includes('--audit')) assert.equal(report.holdMoving, 0, '실제로 이동하는 유닛을 정지 행동으로 기록하지 않아야 합니다');
