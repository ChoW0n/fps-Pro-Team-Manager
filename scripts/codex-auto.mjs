#!/usr/bin/env node
// Node 기본 기능만 사용합니다. 실행 중인 ChatGPT를 바꾸는 도구가 아니라,
// 로그인된 Codex에서 작업마다 모델을 선택하고 새 작업을 실행하는 진입점입니다.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const POLICY = Object.freeze({
  forced_login_method: 'chatgpt',
  model_provider: 'openai',
  service_tier: 'default',
  'features.fast_mode': false,
  'features.multi_agent': false, // 하위 에이전트가 다른 속도 등급을 쓰는 경로를 열지 않습니다.
});

// 분류는 보수적인 기본값입니다. 알 수 없는 일은 NORMAL, 고위험 단어는 먼저 처리합니다.
export function classify(task) {
  if (/(마이그레이션|데이터.{0,12}(손상|삭제)|보안|인증|결제|핵심.{0,8}구조|아키텍처|교착|race condition|migration|security|authentication|architecture|deadlock|시뮬레이션.{0,12}(엔진|구조)|복합.{0,8}버그)/i.test(task)) return 'DEEP';
  if (/(기능|저장|불러오기|상태|규칙|경기|AI|로직|리팩터|feature|state|logic|refactor|save|load)/i.test(task)) return 'NORMAL';
  if (/(오탈자|문구|라벨|간격|여백|인사|typo|label|spacing|padding|margin|greeting)/i.test(task)) return 'FAST';
  return 'NORMAL';
}

export function selectModel(models, level) {
  const choices = {
    FAST: [/luna/i, /mini/i, /terra/i, /sol/i, /astra/i],
    NORMAL: [/terra/i, /sol/i, /astra/i, /mini/i, /luna/i],
    DEEP: [/astra/i, /sol/i, /terra/i, /mini/i, /luna/i],
  };
  if (!choices[level]) throw new Error('작업 강도는 FAST, NORMAL, DEEP 중 하나여야 합니다.');
  const available = models.filter(m => !m.hidden && typeof m.model === 'string');
  // 표시 이름을 API 모델 ID로 추측하지 않고 런타임 목록의 model 값을 그대로 씁니다.
  const model = choices[level].map(re => available.find(m => re.test(m.model))).find(Boolean)
    ?? available.find(m => m.isDefault) ?? available[0];
  if (!model) throw new Error('Codex가 사용 가능한 모델을 반환하지 않았습니다.');
  const supported = (model.supportedReasoningEfforts ?? []).map(e => e.reasoningEffort);
  const target = { FAST: ['low', 'minimal', 'none', 'medium'], NORMAL: ['medium', 'low', 'high'], DEEP: ['high', 'xhigh', 'medium'] }[level];
  const effort = target.find(e => supported.includes(e)) ?? model.defaultReasoningEffort;
  if (!effort || !supported.includes(effort)) throw new Error('이 모델의 추론 설정을 검증할 수 없습니다.');
  return { model: model.model, effort, level };
}

export function verifyRuntime(runtime, selected) {
  if (runtime.model !== selected.model || runtime.modelProvider !== 'openai') throw new Error('요청 모델과 Codex 런타임 모델이 일치하지 않습니다. 실행 중단.');
  if (!Object.hasOwn(runtime, 'serviceTier') || ![null, 'default'].includes(runtime.serviceTier)) throw new Error('표준 속도 등급을 확인하지 못했습니다. 추가 크레딧 가속을 피하기 위해 실행 중단.');
  if (runtime.reasoningEffort !== selected.effort) throw new Error('요청한 추론 강도와 런타임 설정이 다릅니다. 실행 중단.');
  if (!runtime.thread?.id) throw new Error('유효한 Codex 작업 ID가 없습니다.');
}

// JSON-RPC 줄 단위 통신. 모델 출력 문장은 모델 확인 근거로 사용하지 않습니다.
export function connect(command = 'codex', args = ['app-server', ...Object.entries(POLICY).flatMap(([k, v]) => ['-c', `${k}=${JSON.stringify(v)}`])]) {
  const env = { ...process.env, DRAFT_ORDER_ROUTED: '1' };
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
  let sequence = 0, failure;
  const pending = new Map(), listeners = new Set();
  const fail = error => {
    failure = error;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
    pending.clear();
    for (const listen of listeners) listen({ method: 'connection/failed', error });
  };
  child.on('error', e => fail(new Error(e.code === 'ENOENT' ? 'CODEX_NOT_INSTALLED: 이 실행 환경에 Codex 실행기가 없습니다.' : 'Codex 실행기를 시작하지 못했습니다.')));
  child.on('exit', () => fail(new Error('Codex 실행기가 종료되었습니다.')));
  child.stdin.on('error', () => fail(new Error('Codex 통신이 끊겼습니다.')));
  child.stderr.resume(); // 자격정보가 포함될 수 있는 원시 로그를 임의 출력/저장하지 않습니다.
  const send = value => { if (failure) throw failure; child.stdin.write(JSON.stringify(value) + '\n'); };
  createInterface({ input: child.stdout }).on('line', line => {
    let msg;
    try { msg = JSON.parse(line); } catch { fail(new Error('Codex 프로토콜 응답이 올바른 JSON이 아닙니다.')); return; }
    if (msg.method && Object.hasOwn(msg, 'id')) {
      // 별도 권한 승인이나 외부 인증을 자동 허용하지 않습니다.
      try { send({ id: msg.id, error: { code: -32601, message: 'This client does not grant extra permissions.' } }); } catch {}
      return;
    }
    if (pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
      msg.error ? p.reject(new Error(`Codex 요청 실패: ${p.method} (${msg.error.code ?? 'unknown'})`)) : p.resolve(msg.result);
    } else for (const listen of listeners) listen(msg);
  });
  return {
    request(method, params = {}) {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex 응답 제한 시간 초과: ${method}`)); }, 30_000);
        pending.set(id, { resolve, reject, timer, method });
        try { send({ id, method, params }); } catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
      });
    },
    notify: (method, params = {}) => send({ method, params }),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => { child.stdin.end(); child.kill(); },
  };
}

export async function prepare(client) {
  await client.request('initialize', { clientInfo: { name: 'draft_order_auto', version: '1.0.0' } });
  client.notify('initialized');
  const { account } = await client.request('account/read', { refreshToken: false });
  if (account?.type !== 'chatgpt') throw new Error('CHATGPT_LOGIN_REQUIRED: 같은 실행 환경에서 ChatGPT 계정으로 Codex에 로그인해야 합니다. API 키 과금으로 우회하지 않습니다.');
  const models = [], cursors = new Set();
  let cursor;
  do {
    const page = await client.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.data)) throw new Error('Codex 모델 목록 형식이 다릅니다.');
    models.push(...page.data); cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('모델 목록 페이지가 반복됩니다.');
    cursors.add(cursor);
  } while (cursor);
  return models;
}

export async function runTask(client, models, task, { level = classify(task), cwd = process.cwd(), readOnly = false, announce = console.log, timeoutMs = 300_000 } = {}) {
  if (!task.trim()) throw new Error('빈 작업은 실행하지 않습니다.');
  const selected = selectModel(models, level);
  const runtime = await client.request('thread/start', {
    model: selected.model, modelProvider: 'openai', serviceTier: 'default', cwd,
    approvalPolicy: 'never', sandbox: readOnly ? 'read-only' : 'workspace-write',
    config: { ...POLICY, model_reasoning_effort: selected.effort, 'sandbox_workspace_write.network_access': false },
    developerInstructions: 'DRAFT_ORDER_ROUTED=1인 하위 작업입니다. codex-auto를 재귀 호출하지 마세요. 저장소 지침과 사용자 목표를 지키세요. 모델 표시는 실행기가 담당하므로 반복하지 마세요. 추가 크레딧 속도 가속, 새 서비스 결제, 외부 공개, 권한 확대는 금지합니다.',
  });
  verifyRuntime(runtime, selected); // 확인 실패 시 생성 요청 자체를 보내지 않습니다.
  const label = `Codex/${runtime.model}/${level}`;
  announce(label);
  const started = Date.now();
  let unsubscribe, timer, activeTurnId;
  const done = new Promise((resolve, reject) => {
    unsubscribe = client.subscribe(msg => {
      if (msg.method === 'connection/failed') return reject(msg.error);
      if (msg.params?.threadId !== runtime.thread.id) return;
      if (msg.method === 'turn/completed') {
        const turn = msg.params.turn;
        if (turn.status !== 'completed') return reject(new Error(`Codex 작업 미완료: ${turn.status}`));
        resolve(turn);
      }
    });
    timer = setTimeout(() => reject(new Error('작업 제한 시간 초과. 자동 재시도하지 않습니다.')), timeoutMs);
  });
  // turn/start 실패와 동시에 이벤트 대기가 남더라도 미처리 거부가 생기지 않게 합니다.
  done.catch(() => {});
  try {
    const { turn: initial } = await client.request('turn/start', {
      threadId: runtime.thread.id, input: [{ type: 'text', text: task }],
      model: selected.model, effort: selected.effort, serviceTier: 'default',
    });
    activeTurnId = initial.id;
    if (['failed', 'interrupted'].includes(initial.status)) throw new Error(`Codex 작업 미완료: ${initial.status}`);
    const turn = initial.status === 'completed' ? initial : await done;
    if (turn.status !== 'completed') throw new Error('Codex 작업이 완료되지 않았습니다.');
    // 일부 버전의 완료 알림에는 items가 없으므로 저장된 턴을 확인합니다.
    const { thread } = await client.request('thread/read', { threadId: runtime.thread.id, includeTurns: true });
    const recorded = thread.turns?.find(t => t.id === turn.id);
    if (!recorded || recorded.status !== 'completed') throw new Error('완료된 턴 기록을 확인하지 못했습니다.');
    const text = (recorded.items ?? []).filter(i => i.type === 'agentMessage').map(i => i.text).join('\n');
    return { text, model: runtime.model, effort: runtime.reasoningEffort, serviceTier: runtime.serviceTier, level, threadId: runtime.thread.id, turnId: turn.id, elapsedMs: Date.now() - started, evidence: 'codex-client-runtime' };
  } catch (error) {
    if (activeTurnId) await client.request('turn/interrupt', { threadId: runtime.thread.id, turnId: activeTurnId }).catch(() => {});
    throw error;
  } finally { clearTimeout(timer); unsubscribe(); }
}

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) {
    console.log('node scripts/codex-auto.mjs "작업 목표"\nnode scripts/codex-auto.mjs --verify\nnode scripts/codex-auto.mjs --check\n선택: --level FAST|NORMAL|DEEP, --audit /로컬/기록.jsonl\nCodex 실행기와 동일 환경의 ChatGPT 로그인이 필요합니다.'); return;
  }
  if (process.env.DRAFT_ORDER_ROUTED === '1') throw new Error('하위 작업에서 자동 라우터를 재귀 실행하지 않습니다.');
  const options = {}, words = [];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--level', '--audit', '--file'].includes(key)) {
      const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`${key} 값이 필요합니다.`);
      options[key.slice(2)] = value;
    } else if (['--verify', '--check'].includes(key)) options[key.slice(2)] = true;
    else if (key.startsWith('--')) throw new Error(`지원하지 않는 옵션: ${key}`);
    else words.push(key);
  }
  if (options.level && !['FAST', 'NORMAL', 'DEEP'].includes(options.level)) throw new Error('잘못된 작업 강도입니다.');
  const goal = options.file ? readFileSync(resolve(options.file), 'utf8') : words.join(' ');
  if (!options.check && !options.verify && !goal.trim()) throw new Error('작업 목표가 없습니다.');
  if (options.audit) appendFileSync(resolve(options.audit), '', { mode: 0o600 });
  const client = connect();
  try {
    const models = await prepare(client);
    if (options.check) { console.log(JSON.stringify({ authenticated: true, models: models.map(m => m.model), generationExecuted: false })); return; }
    const tasks = options.verify ? [
      ['버튼 라벨 확인. 도구 사용이나 파일 변경 없이 정확히 OK_FAST만 답하세요.', 'OK_FAST'],
      ['목록 필터 기능 확인. 도구 사용이나 파일 변경 없이 정확히 OK_NORMAL만 답하세요.', 'OK_NORMAL'],
      ['저장 데이터 마이그레이션 검토. 도구 사용이나 파일 변경 없이 정확히 OK_DEEP만 답하세요.', 'OK_DEEP'],
    ] : [[goal, null]];
    let previous;
    const results = [];
    for (const [task, expected] of tasks) {
      const result = await runTask(client, models, task, {
        level: options.verify ? classify(task) : options.level ?? classify(task), readOnly: Boolean(options.verify),
        announce: line => { if (line !== previous) console.log(line); previous = line; },
      });
      const { text, ...evidence } = result;
      if (options.audit) appendFileSync(resolve(options.audit), JSON.stringify({ at: new Date().toISOString(), ...evidence }) + '\n', { mode: 0o600 });
      if (expected && text.trim() !== expected) throw new Error(`${result.level} 응답 검증 실패. 자동 전환 완료로 판정하지 않습니다.`);
      results.push(evidence);
      console.log(text);
    }
    if (options.verify) {
      const switched = new Set(results.map(r => r.model)).size > 1;
      console.log(JSON.stringify({ runtimeVerified: true, modelSwitchVerified: switched, results }));
      if (!switched) throw new Error('모든 작업이 같은 모델이므로 모델 전환 검증은 미통과입니다.');
    }
  } finally { client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
