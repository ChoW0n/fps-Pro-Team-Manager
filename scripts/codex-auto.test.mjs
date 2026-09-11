// 네트워크·실제 모델·크레딧을 사용하지 않는 단위/프로토콜 모의 테스트입니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, classify, selectModel, verifyRuntime, prepare, runTask, connect } from './codex-auto.mjs';

const models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-6-astra'].map(model => ({
  model, hidden: false, defaultReasoningEffort: 'medium',
  supportedReasoningEfforts: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort })),
}));
const selected = selectModel(models, 'FAST');
const valid = { thread: { id: 'test-thread' }, model: selected.model, modelProvider: 'openai', serviceTier: 'default', reasoningEffort: selected.effort };

function mock(overrides = {}) {
  const calls = [], subscribers = new Set();
  const client = {
    calls, notify() {}, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    async request(method, params) {
      calls.push({ method, params });
      if (method in overrides) return overrides[method](params, subscribers);
      if (method === 'initialize' || method === 'turn/interrupt') return {};
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: models, nextCursor: null };
      if (method === 'thread/start') return { ...valid, model: params.model, reasoningEffort: params.config.model_reasoning_effort };
      if (method === 'turn/start') return { turn: { id: 'test-turn', status: 'completed' } };
      if (method === 'thread/read') return { thread: { turns: [{ id: 'test-turn', status: 'completed', items: [{ type: 'agentMessage', text: 'OK' }] }] } };
      throw new Error('Unexpected mock request: ' + method);
    },
  };
  return client;
}

test('작업 분류: 위험을 단순 문구보다 우선한다', () => {
  assert.equal(classify('버튼 라벨 변경'), 'FAST');
  assert.equal(classify('목록 필터 기능 추가'), 'NORMAL');
  assert.equal(classify('인증 보안 오류 문구 수정'), 'DEEP');
  assert.equal(classify('알 수 없는 새로운 요청'), 'NORMAL');
});
test('모델 목록에서 실제 ID와 지원 강도를 선택한다', () => {
  assert.equal(selectModel(models, 'FAST').model, 'gpt-5.6-luna');
  assert.equal(selectModel(models, 'NORMAL').model, 'gpt-5.6-terra');
  assert.equal(selectModel(models, 'DEEP').model, 'gpt-6-astra');
  assert.equal(selectModel(models, 'DEEP').effort, 'high');
});
test('숨김 모델과 임의 모델 ID를 사용하지 않는다', () => {
  const catalog = models.map(m => ({ ...m, hidden: m.model.includes('astra') }));
  assert.equal(selectModel(catalog, 'DEEP').model, 'gpt-5.6-terra');
  assert.throws(() => selectModel([], 'FAST'));
  assert.throws(() => selectModel(models, 'TURBO'));
});
test('지원하지 않는 추론 설정은 요청하지 않는다', () => {
  assert.throws(() => selectModel([{ model: 'new-model', supportedReasoningEfforts: [] }], 'NORMAL'));
});
test('표준 서비스만 통과하며 가속·미노출 서비스는 거부한다', () => {
  assert.doesNotThrow(() => verifyRuntime(valid, selected));
  assert.doesNotThrow(() => verifyRuntime({ ...valid, serviceTier: null }, selected));
  for (const serviceTier of ['fast', 'priority', undefined, 'unknown']) assert.throws(() => verifyRuntime({ ...valid, serviceTier }, selected));
  const missing = { ...valid }; delete missing.serviceTier;
  assert.throws(() => verifyRuntime(missing, selected));
});
test('모델·공급자·추론 강도 불일치와 누락을 거부한다', () => {
  for (const patch of [{ model: 'other' }, { modelProvider: 'other' }, { reasoningEffort: 'high' }, { thread: {} }]) assert.throws(() => verifyRuntime({ ...valid, ...patch }, selected));
});
test('API 과금·로그아웃 상태에서는 모델 요청을 보내지 않는다', async () => {
  for (const account of [null, { type: 'apiKey' }, { type: 'amazonBedrock' }]) {
    const client = mock({ 'account/read': () => ({ account }) });
    await assert.rejects(prepare(client), /CHATGPT_LOGIN_REQUIRED/);
    assert.equal(client.calls.some(c => c.method === 'model/list'), false);
  }
});
test('모델 목록 페이지를 빠짐없이 읽고 반복 커서는 차단한다', async () => {
  let page = 0;
  const client = mock({ 'model/list': () => ++page === 1 ? { data: models.slice(0, 1), nextCursor: 'next' } : { data: models.slice(1), nextCursor: null } });
  assert.equal((await prepare(client)).length, 3);
  await assert.rejects(prepare(mock({ 'model/list': () => ({ data: [], nextCursor: 'same' }) })), /반복/);
});
test('모의 실행: 실제 모델·등급 응답 확인 후에만 생성 요청한다', async () => {
  const client = mock(), labels = [];
  const result = await runTask(client, models, '버튼 라벨 수정', { announce: line => labels.push(line) });
  assert.equal(result.text, 'OK');
  assert.equal(result.evidence, 'codex-client-runtime');
  assert.deepEqual(labels, ['Codex/gpt-5.6-luna/FAST']);
  const start = client.calls.find(c => c.method === 'thread/start').params;
  assert.equal(start.config['features.fast_mode'], false);
  assert.equal(start.config['features.multi_agent'], false);
  assert.equal(start.config.forced_login_method, 'chatgpt');
  assert.equal(start.sandbox, 'workspace-write');
  assert.equal(client.calls.find(c => c.method === 'turn/start').params.serviceTier, 'default');
});
test('가속 등급이 반환되면 출력·생성 전에 멈춘다', async () => {
  const client = mock({ 'thread/start': () => ({ ...valid, serviceTier: 'priority' }) });
  const labels = [];
  await assert.rejects(runTask(client, models, '버튼 라벨', { announce: line => labels.push(line) }), /가속/);
  assert.equal(labels.length, 0);
  assert.equal(client.calls.some(c => c.method === 'turn/start'), false);
});
test('모의 검증 작업은 읽기 전용으로 실행한다', async () => {
  const client = mock();
  await runTask(client, models, '인사', { readOnly: true, announce() {} });
  assert.equal(client.calls.find(c => c.method === 'thread/start').params.sandbox, 'read-only');
});
test('완료 알림이 응답보다 먼저 와도 놓치지 않는다', async () => {
  const client = mock({ 'turn/start': (_, subscribers) => {
    for (const fn of subscribers) fn({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id: 'test-turn', status: 'completed' } } });
    return { turn: { id: 'test-turn', status: 'inProgress' } };
  } });
  assert.equal((await runTask(client, models, '인사', { announce() {} })).text, 'OK');
});
test('완료 증거가 없으면 성공이라고 보고하지 않는다', async () => {
  await assert.rejects(runTask(mock({ 'thread/read': () => ({ thread: { turns: [] } }) }), models, '인사', { announce() {} }), /기록/);
});
test('실행기 누락은 명확한 오류로 종료한다', async () => {
  const client = connect('/__not_a_real_codex_binary__', []);
  try { await assert.rejects(prepare(client), /CODEX_NOT_INSTALLED/); } finally { client.close(); }
});
test('실제 자식 프로세스와 JSON-RPC 줄 단위 통신을 모의 검증한다', async () => {
  const source = `import {createInterface} from 'node:readline'; createInterface({input:process.stdin}).on('line', line => { const m=JSON.parse(line); if(m.id) console.log(JSON.stringify({id:m.id,result:{method:m.method}})); });`;
  const client = connect(process.execPath, ['--input-type=module', '-e', source]);
  try { assert.deepEqual(await client.request('test/ping'), { method: 'test/ping' }); } finally { client.close(); }
});
test('비용 정책에는 API 인증·가속·하위 에이전트 실행이 없다', () => {
  assert.equal(POLICY.forced_login_method, 'chatgpt');
  assert.equal(POLICY.service_tier, 'default');
  assert.equal(POLICY['features.fast_mode'], false);
  assert.equal(POLICY['features.multi_agent'], false);
});

test('시간 초과 시 중단을 요청하고 재시도하지 않는다', async () => {
  const client = mock({ 'turn/start': () => ({ turn: { id: 'slow', status: 'inProgress' } }) });
  await assert.rejects(runTask(client, models, '인사', { announce() {}, timeoutMs: 5 }), /제한 시간/);
  assert.equal(client.calls.filter(c => c.method === 'turn/start').length, 1);
  assert.equal(client.calls.some(c => c.method === 'turn/interrupt'), true);
});
test('즉시 실패한 턴을 오래 기다리지 않는다', async () => {
  const client = mock({ 'turn/start': () => ({ turn: { id: 'failed-turn', status: 'failed' } }) });
  await assert.rejects(runTask(client, models, '인사', { announce() {} }), /미완료/);
});
