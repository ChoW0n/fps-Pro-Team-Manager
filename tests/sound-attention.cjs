// 소리를 기억하는 수명과 새 소리에 몸을 돌리는 조건은 다릅니다.
const assert = require('node:assert/strict');
require('./qa-preparation-batch.cjs');
const { TacticalRealtimeSimulation } = require('../artifacts/draft-order-player-generator/src/domain/realtime/TacticalRealtimeSimulation.ts');
const engine = new TacticalRealtimeSimulation();
const unit = () => ({ position: { x: 100, y: 100 }, facing: 0, lookDirection: 0, decision: '짧은 점사 · 사선 유지', knowledge: { lastKnownAt: 10, source: 'self-visual', confidence: 1 } });
const sound = at => ({ at, source: { x: 100, y: 200 }, kind: 'gunshot', loudness: 1, owner: 'enemy' });
{
 const u=unit(), before=structuredClone(u);
 engine.orientToSound(u,sound(9.9),10.1,0);
 assert.deepEqual(u,before,'최근 직접 관측보다 오래된 소리로 조준을 되돌리지 않음');
}
{
 const u=unit();u.knowledge={confidence:0};const before=structuredClone(u);
 engine.orientToSound(u,sound(9),10,0);
 assert.deepEqual(u,before,'기억 버퍼에 남은 소리를 새 반응으로 반복하지 않음');
}
{
 const u=unit();engine.orientToSound(u,sound(10.1),10.2,0);
 assert(u.facing>0&&u.facing<=Math.PI/4,'새 소리는 같은 틱에 회전 한도 안에서 반응');
 assert.equal(u.lookDirection,Math.PI/2);
 assert.equal(u.decision,'소리 추적 · 마지막 위치 확인');
}
console.log('PASS sound attention freshness, observation priority, bounded same-tick response');
