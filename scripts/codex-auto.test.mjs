// 네트워크·실제 모델·크레딧을 사용하지 않는 단위/프로토콜 모의 테스트입니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { POLICY, classify, selectModel, verifyRuntime, prepare, runTask, connect, main } from './codex-auto.mjs';

const models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-6-astra'].map(model => ({
  model, hidden: false, defaultReasoningEffort: 'medium',
  supportedReasoningEfforts: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort })),
}));
const selected = selectModel(models, 'FAST');
const valid = { thread: { id: 'test-thread' }, model: selected.model, modelProvider: 'openai', serviceTier: 'default', reasoningEffort: selected.effort };

function mock(overrides = {}) {
  const calls = [], subscribers = new Set();
  let runtime = valid;
  const client = {
    calls, notify() {}, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    async request(method, params) {
      calls.push({ method, params });
      if (method in overrides) return overrides[method](params, subscribers);
      if (method === 'initialize' || method === 'turn/interrupt') return {};
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'account/rateLimits/read') return { rateLimits: { primary: null, secondary: null } };
      if (method === 'model/list') return { data: models, nextCursor: null };
      if (method === 'thread/start') return runtime = { ...valid, model: params.model, reasoningEffort: params.config.model_reasoning_effort };
      if (method === 'turn/start') return { turn: { id: 'test-turn', status: 'completed' } };
      if (method === 'thread/read') return { thread: { id: runtime.thread.id, model: runtime.model, modelProvider: 'openai', reasoningEffort: runtime.reasoningEffort, turns: [{ id: 'test-turn', status: 'completed', items: [{ type: 'agentMessage', text: 'OK' }] }] } };
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
  for (const serviceTier of [null, 'fast', 'priority', undefined, 'unknown']) assert.throws(() => verifyRuntime({ ...valid, serviceTier }, selected));
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
  await assert.rejects(runTask(mock({ 'thread/read': () => ({ thread: { turns: [] } }) }), models, '인사', { announce() {} }), /기록|스레드/);
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

test('로컬 로그인 정보가 있어도 서버 인증 실패 시 목록·생성을 중단한다', async () => {
  for (const failure of [() => { throw new Error('HTTP 401'); }, () => ({})]) {
    const client = mock({ 'account/rateLimits/read': failure });
    await assert.rejects(prepare(client), /401|AUTH_UNVERIFIED/);
    assert.equal(client.calls.some(c => ['model/list', 'thread/start', 'turn/start'].includes(c.method)), false);
  }
});
test('check와 verify를 섞어 실검증이 생략되는 것을 막는다', async () => {
  await assert.rejects(main(['--check', '--verify']), /함께/);
});
test('서비스 null은 생성 전에 차단한다', async () => {
  const client = mock({ 'thread/start': () => ({ ...valid, serviceTier: null }) });
  await assert.rejects(runTask(client, models, '인사', { announce() {} }), /가속/);
  assert.equal(client.calls.some(c => c.method === 'turn/start'), false);
});
test('턴별 표준 등급과 모델 대체 금지를 명시한다', async () => {
  const client = mock();
  const result = await runTask(client, models, '인사', { announce() {} });
  assert.equal(client.calls.find(c => c.method === 'thread/start').params.allowProviderModelFallback, false);
  assert.equal(client.calls.find(c => c.method === 'turn/start').params.serviceTierForTurn, 'default');
  assert.equal(result.status, 'completed');
  assert.equal(result.metadataScope, 'thread-settings-and-turn-completion');
});
test('다른 턴의 완료 알림을 현재 실행의 증거로 사용하지 않는다', async () => {
  const client = mock({ 'turn/start': (_, subscribers) => {
    for (const fn of subscribers) fn({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id: 'other-turn', status: 'completed' } } });
    return { turn: { id: 'test-turn', status: 'inProgress' } };
  } });
  await assert.rejects(runTask(client, models, '인사', { announce() {} }), /턴 ID/);
  assert.equal(client.calls.some(c => c.method === 'turn/interrupt'), true);
});
test('턴 ID가 없으면 완료를 인정하지 않는다', async () => {
  await assert.rejects(runTask(mock({ 'turn/start': () => ({ turn: { status: 'completed' } }) }), models, '인사', { announce() {} }), /턴 ID/);
});
test('완료 후 저장 모델·추론 설정 변경을 거부한다', async () => {
  for (const patch of [{ id: 'other' }, { model: 'other' }, { reasoningEffort: 'high' }, { modelProvider: 'other' }]) {
    const client = mock({ 'thread/read': () => ({ thread: { id: 'test-thread', model: selected.model, reasoningEffort: selected.effort, modelProvider: 'openai', ...patch } }) });
    await assert.rejects(runTask(client, models, '인사', { announce() {} }), /스레드/);
  }
});
test('실행 중 재라우팅·가속·미확인 등급 알림은 즉시 실패한다', async () => {
  for (const event of [
    { method: 'model/rerouted', params: { fromModel: selected.model, toModel: 'other' } },
    ...[null, 'priority', 'fast', undefined].map(serviceTier => ({ method: 'thread/settings/updated', params: { threadSettings: { model: selected.model, modelProvider: 'openai', serviceTier, effort: selected.effort } } })),
  ]) {
    const client = mock({ 'turn/start': (_, subscribers) => {
      for (const fn of subscribers) fn({ ...event, params: { ...event.params, threadId: 'test-thread' } });
      return { turn: { id: 'test-turn', status: 'completed' } };
    } });
    await assert.rejects(runTask(client, models, '인사', { announce() {} }), /재라우팅|가속/);
    assert.equal(client.calls.some(c => c.method === 'turn/interrupt'), true);
  }
});
test('RPC 오류에서 HTTP 상태만 남기고 원문 토큰을 출력하지 않는다', async () => {
  const source = `import {createInterface} from 'node:readline'; createInterface({input:process.stdin}).on('line', line => { const m=JSON.parse(line); console.log(JSON.stringify({id:m.id,error:{code:-32603,message:'401 Unauthorized Bearer SECRET_VALUE'}})); });`;
  const client = connect(process.execPath, ['--input-type=module', '-e', source]);
  try { await assert.rejects(client.request('account/rateLimits/read'), e => e.httpStatus === 401 && e.rpcCode === -32603 && !e.message.includes('SECRET_VALUE')); } finally { client.close(); }
});

test('CLI --verify 모의 통합: 3단계 완료와 2개 이상 모델일 때만 성공한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-auto-test-')), binary = join(dir, 'mock-codex.mjs');
  writeFileSync(binary, `#!/usr/bin/env node
import {createInterface} from 'node:readline';
let runtime, turn, count = 0;
createInterface({input:process.stdin}).on('line', line => {
  const m=JSON.parse(line), p=m.params; if(!m.id)return; let result;
  if(m.method==='initialize')result={};
  if(m.method==='account/read')result={account:{type:'chatgpt'}};
  if(m.method==='account/rateLimits/read')result={rateLimits:{}};
  if(m.method==='model/list')result={data:(process.env.MOCK_SINGLE ? ['mock-luna'] : ['mock-luna','mock-terra','mock-astra']).map(model=>({model,supportedReasoningEfforts:['low','medium','high'].map(reasoningEffort=>({reasoningEffort}))})),nextCursor:null};
  if(m.method==='thread/start')result=runtime={thread:{id:'thread-'+(++count)},model:p.model,modelProvider:'openai',reasoningEffort:p.config.model_reasoning_effort,serviceTier:'default'};
  if(m.method==='turn/start')result={turn:turn={id:'turn-'+count,status:'completed',items:[{type:'agentMessage',text:p.input[0].text.match(/OK_(FAST|NORMAL|DEEP)/)[0]}]}};
  if(m.method==='thread/read')result={thread:{...runtime,...runtime.thread,turns:[turn]}};
  console.log(JSON.stringify({id:m.id,result}));
});`, { mode: 0o700 });
  try {
    for (const single of [false, true]) {
      const env = { ...process.env, CODEX_BIN: binary }; delete env.DRAFT_ORDER_ROUTED; delete env.MOCK_SINGLE;
      if (single) env.MOCK_SINGLE = '1';
      const result = spawnSync(process.execPath, [new URL('./codex-auto.mjs', import.meta.url).pathname, '--verify'], { env, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, single ? 1 : 0, result.stderr);
      const report = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('{"runtimeVerified"')));
      assert.equal(report.modelSwitchVerified, !single);
      assert.deepEqual(report.results.map(r => r.level), ['FAST', 'NORMAL', 'DEEP']);
      assert.ok(report.results.every(r => r.status === 'completed' && r.serviceTier === 'default'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
