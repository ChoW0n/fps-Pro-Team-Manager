# QA 반영 검증 체크리스트

용도: 지금까지 전달한 QA 문서의 항목들이 **실제로 반영됐는지 수치로 확인**한다.
기준선: `319c199` 시점에 직접 측정한 값. 이 값보다 나아졌는지로 판정한다.

## 사용 규칙

**"했습니다"를 근거로 통과 처리하지 않는다.** 구현 에이전트의 자기 보고, 타입 검사 통과, 빌드 성공은 모두 판정 근거가 아니다. 아래 세 가지만 근거로 쓴다.

1. `tests/qa-verify.cjs` 실행 결과 숫자
2. 실제 브라우저 화면 (수동 항목)
3. 저장소에 실제로 존재하는 파일

기존 14개 스위트가 전부 통과하는 것은 **최소 조건**이고 통과 근거가 아니다. P0 항목들은 그 검사 범위 밖에 있었기 때문에 지금까지 발견되지 않았다.

---

## 1. 자동 검증 스크립트

`tests/qa-verify.cjs`로 저장한다. 기존 스위트와 같은 방식(TypeScript transpile + 실제 엔진)이라 추가 설치가 없다.

```js
// QA 문서 항목의 반영 여부를 수치로 판정한다. 자기 보고 대신 이 출력을 근거로 쓴다.
const fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);

const S='../artifacts/draft-order-player-generator/src/';
const R=S+'domain/';
const {TacticalRealtimeSimulation}=require(R+'realtime/TacticalRealtimeSimulation.ts');
const {TeamGenerator}=require(R+'TeamGenerator.ts');
const {confirmOperatorDraft,completeOperatorDraft}=require(R+'operatorDraft.ts');
const {OPERATORS}=require(R+'Operator.ts');
const {muzzlePosition}=require(R+'operatorVisuals.ts');
const {BREACHLINE_MAP}=require(R+'tacticalMaps.ts');
const U=40, GAMES=Number(process.argv[2]??12);

const rows=[];
/** 한 항목의 판정을 기록한다. pass 판단은 비교식으로만 한다. */
const check=(id,label,base,now,pass,note='')=>rows.push({id,label,base,now,pass,note});
const pct=(a,b)=>(100*a/Math.max(1,b));

// ── 편성 헬퍼 ────────────────────────────────────────────────
const teams=new TeamGenerator().generateTenTeams();
function draftPair(g){
  const at=teams[g%10], dt=teams[(g+4)%10];
  if(at===dt) return null;
  try{
    return {
      A:confirmOperatorDraft(at,'공격',completeOperatorDraft(at,'공격',[null,null,null,null,null])),
      D:confirmOperatorDraft(dt,'수비',completeOperatorDraft(dt,'수비',[null,null,null,null,null])),
    };
  }catch(e){ return null; }
}
/** 실제 UI가 쓰는 경로를 재현한다. scoutPlan을 빼면 다른 코드 경로를 측정하게 된다. */
function run(g, scoutIndices){
  const p=draftPair(g); if(!p) return null;
  try{
    return new TacticalRealtimeSimulation().run({
      attackers:p.A, defenders:p.D, seed:4400+g*19, maxSeconds:150,
      targetSite:g%2?'A':'B', siteApproach:g%3,
      scoutPlan:{indices:scoutIndices, seconds:40, entryRoute:g%5},
    });
  }catch(e){ return null; }
}

// ── P0-01 선발조 교착 ────────────────────────────────────────
{
  let n=0,entered=0,win=0,expire=0;
  for(let g=0;g<GAMES;g++){
    const r=run(g,[1,2]); if(!r) continue; n++;
    if(r.snapshots.some(s=>s.operation?.phase==='entering')) entered++;
    if(r.winner==='공격') win++;
    if(r.objective.reason==='time-expired') expire++;
  }
  check('P0-01','선발조 2명 · 재진입 도달률','20%',`${pct(entered,n).toFixed(0)}%`, pct(entered,n)>=80,
    '재진입(entering) 국면에 도달한 경기 비율. 80% 이상이어야 통과');
  check('P0-01b','선발조 2명 · 공격 승률','0%',`${pct(win,n).toFixed(0)}%`, pct(win,n)>=15,
    '승률 0%인 선택지가 없어야 한다');
  check('P0-01c','선발조 2명 · 시간 만료율','80%',`${pct(expire,n).toFixed(0)}%`, pct(expire,n)<=30);
}

// ── P0-02 공수 밸런스 / P2-16 치명성 / P2-17 소생 / P2-19 관통 ──
{
  let n=0,atkWin=0,wipe=0,shots=0,impacts=0,head=0,body=0,ace4=0,downs=0,revives=0,wall=0;
  const durs=[], firstDeaths=[], seps=[];
  for(let g=0;g<GAMES;g++){
    const r=run(g,[]); if(!r) continue; n++;
    if(r.winner==='공격') atkWin++;
    if(r.objective.reason==='attackers-eliminated') wipe++;
    durs.push(r.executionTime);
    shots+=r.validation.shots; impacts+=r.validation.impacts; wall+=r.validation.wallBangCount;
    head+=r.events.filter(e=>e.type==='impact'&&e.hit&&e.hitRegion==='head').length;
    body+=r.events.filter(e=>e.type==='impact'&&e.hit&&e.hitRegion==='body').length;
    downs+=r.events.filter(e=>e.type==='downed').length;
    revives+=r.events.filter(e=>e.type==='revive').length;
    const deaths=r.events.filter(e=>e.type==='death');
    if(deaths[0]) firstDeaths.push(deaths[0].time);
    const k={}; deaths.forEach(e=>e.actor&&(k[e.actor]=(k[e.actor]||0)+1));
    if(Math.max(0,...Object.values(k))>=4) ace4++;
    // P2-20 진입 간격
    const atk=r.snapshots[0].units.filter(u=>u.side==='공격');
    let m=1e9; for(let i=0;i<atk.length;i++)for(let j=i+1;j<atk.length;j++)
      m=Math.min(m,Math.hypot(atk[i].position.x-atk[j].position.x,atk[i].position.y-atk[j].position.y));
    seps.push(m);
  }
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN;};
  check('P0-02','공격 승률 (선발조 0명 · 진입로 선택)','24.2%',`${pct(atkWin,n).toFixed(1)}%`,
    pct(atkWin,n)>=40 && pct(atkWin,n)<=60, '40~60% 구간이 목표');
  check('P0-02b','종료 사유 · 공격 전멸','44%',`${pct(wipe,n).toFixed(0)}%`, pct(wipe,n)<=25);
  check('P2-16','명중률','79.1%',`${pct(impacts,shots).toFixed(1)}%`, pct(impacts,shots)<=55);
  check('P2-16b','헤드샷 비율','16.5%',`${pct(head,head+body).toFixed(1)}%`, pct(head,head+body)<=10);
  check('P2-16c','한 선수 4킬 이상 경기','22.9%',`${pct(ace4,n).toFixed(0)}%`, pct(ace4,n)<=10);
  check('P2-16d','첫 사망 시각 중앙값','17.5초',`${med(firstDeaths).toFixed(1)}초`, med(firstDeaths)>=25);
  check('P2-16e','라운드 길이 중앙값','74초',`${med(durs).toFixed(0)}초`, med(durs)>=90);
  check('P2-17','소생률 (소생/다운)','12.6%',`${pct(revives,downs).toFixed(1)}%`, pct(revives,downs)>=25);
  check('P2-19','벽 관통 사격 총합','0회',`${wall}회`, wall>0, '0이면 미구현 또는 완전 차단. 의도 확인 필요');
  check('P2-20','진입 시 아군 최소 간격 중앙값','26.7단위',`${med(seps).toFixed(1)}단위`, med(seps)>=60,
    '60단위(1.5m) 이상이어야 일렬 밀착이 아니다');
}

// ── P0-A 순환 대기 ──────────────────────────────────────────
{
  let waitTicks=0, cycleTicks=0, maxRun=0;
  for(let g=0;g<GAMES;g++){
    const r=run(g,[]); if(!r) continue;
    const runLen=new Map();
    for(const snap of r.snapshots){
      const edge=new Map();
      for(const u of snap.units){
        if(!u.alive||u.downed){runLen.set(u.id,0);continue;}
        const m=u.goal.match(/통과 순서 대기 · (\S+) 선행/);
        if(m){edge.set(u.callSign,m[1]);runLen.set(u.id,(runLen.get(u.id)||0)+1);}
        else if(/문 통과 순서 대기/.test(u.goal)){edge.set(u.callSign,'#문예약');runLen.set(u.id,(runLen.get(u.id)||0)+1);}
        else runLen.set(u.id,0);
        maxRun=Math.max(maxRun,runLen.get(u.id));
      }
      if(!edge.size) continue;
      waitTicks++;
      for(const start of edge.keys()){
        const seen=[start]; let cur=edge.get(start);
        while(cur&&edge.has(cur)&&!seen.includes(cur)){seen.push(cur);cur=edge.get(cur);}
        if(cur&&seen.includes(cur)){cycleTicks++;break;}
      }
    }
  }
  check('P0-A','순환 대기 발생 비율 (대기 틱 중)','15.0%',`${pct(cycleTicks,waitTicks).toFixed(1)}%`,
    cycleTicks===0, '0이어야 통과. 서로를 기다리는 상태는 존재해서는 안 된다');
  check('P0-A2','최장 연속 대기','132.9초',`${(maxRun*0.1).toFixed(1)}초`, maxRun*0.1<=6,
    '6초 이하. 대기 타임아웃이 동작하는지 본다');
}

// ── P1-D 가젯 잠김 / P1-C 고유 능력 희석 / P2-15 다양성 ────────
{
  const kindsByUnit={}, byGoalCall={}, appear={};
  for(let g=0;g<GAMES;g++){
    const p=draftPair(g); if(!p) continue;
    let r; try{ r=new TacticalRealtimeSimulation().run({attackers:p.A,defenders:p.D,seed:5500+g*13,
      maxSeconds:150,targetSite:g%2?'A':'B',siteApproach:g%3,defensePreparation:['camera','reinforce','shield'][g%3],
      scoutPlan:{indices:[],seconds:25,entryRoute:g%5}}); }catch(e){ continue; }
    const call=new Map(r.snapshots[0].units.map(u=>[u.id,u.callSign]));
    for(const cs of call.values()) appear[cs]=(appear[cs]||0)+1;
    for(const e of r.events){
      if(e.type!=='utility'||!e.actor||!e.goal) continue;
      const key=`${g}:${e.actor}`;
      (kindsByUnit[key]=kindsByUnit[key]||new Set()).add(e.goal);
      const cs=call.get(e.actor); if(cs) (byGoalCall[e.goal]=byGoalCall[e.goal]||new Set()).add(cs);
    }
  }
  const multi=Object.values(kindsByUnit).filter(s=>{
    const own=[...s].filter(g=>/thrown|deployed|breach-started|reinforced/.test(g));
    return own.length>=2;
  }).length;
  check('P1-D','한 유닛이 2종 이상 가젯을 쓴 사례','0건',`${multi}건`, multi>0,
    'utilityUsed 단일 플래그가 수량제로 바뀌었는지 본다');
  const cam=byGoalCall['camera-deployed']?byGoalCall['camera-deployed'].size:0;
  check('P1-C','카메라를 설치한 오퍼레이터 종류','3~5종',`${cam}종`, cam<=1,
    'MARCHAND 고유 능력이면 1종이어야 한다');
  const smoke=byGoalCall['smoke-thrown']?byGoalCall['smoke-thrown'].size:0;
  check('P1-C2','연막을 던진 오퍼레이터 종류','4~5종',`${smoke}종`, smoke<=2,
    'ARBEL 고유 + 공용 1종까지 허용');
  const total=Object.values(appear).reduce((a,b)=>a+b,0)/Math.max(1,Object.keys(appear).length);
  const rare=['MEDVED','SAVELLI'].map(c=>pct(appear[c]||0,GAMES));
  check('P2-15','MEDVED 등장률','5%',`${rare[0].toFixed(0)}%`, rare[0]>=40);
  check('P2-15b','SAVELLI 등장률','5%',`${rare[1].toFixed(0)}%`, rare[1]>=40);
}

// ── 총구 파지 (직전 QA 2부) ─────────────────────────────────
{
  let worstCenter=0, overRear=0, gripSpread=[];
  const BODY_REAR=-18;
  let weaponPart=null;
  try{ weaponPart=require(S+'components/weaponParts.ts').weaponPart; }catch(e){}
  for(const o of OPERATORS){
    const m=muzzlePosition(o.callSign,{x:0,y:0},0);
    worstCenter=Math.max(worstCenter,Math.abs(m.y));
    if(weaponPart){
      const p=weaponPart(o.firearms[0]);
      if(m.x-p.length<BODY_REAR) overRear++;
      if(p.gripPoint) gripSpread.push(m.x+p.gripPoint[0]);
    }
  }
  check('GRIP-1','총 중심선 y 최대 절댓값','1.98',`${worstCenter.toFixed(2)}`, worstCenter>=5,
    '탑뷰에서 총은 어깨 앞(y 6~9)에 비켜 있어야 한다. 0에 가까우면 몸 정중앙 관통');
  check('GRIP-2','개머리판이 몸 뒤로 삐진 오퍼레이터','6명',`${overRear}명`, overRear===0);
  if(gripSpread.length){
    const spread=Math.max(...gripSpread)-Math.min(...gripSpread);
    check('GRIP-3','방아쇠손 x 편차','14.0단위',`${spread.toFixed(1)}단위`, spread<=4,
      '몸이 12명 동일하므로 손 위치도 같아야 한다');
  }
}

// ── 레벨 디자인 (R7·R8·R5) ─────────────────────────────────
{
  const M=BREACHLINE_MAP;
  const segs=M.walls.filter(w=>w.kind!=='door-gap').map(w=>[w.from,w.to]);
  for(const c of M.covers){const r=c.rect,p=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},
    {x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
    p.forEach((q,i)=>segs.push([q,p[(i+1)%4]]));}
  const blocked=(a,b)=>{for(const[p,q]of segs){
    const r={x:b.x-a.x,y:b.y-a.y},s={x:q.x-p.x,y:q.y-p.y},d=r.x*s.y-r.y*s.x;
    if(Math.abs(d)<1e-9)continue;
    const t=((p.x-a.x)*s.y-(p.y-a.y)*s.x)/d,u=((p.x-a.x)*r.y-(p.y-a.y)*r.x)/d;
    if(t>1e-6&&t<1-1e-6&&u>=0&&u<=1)return true;}return false;};
  const stand=pt=>M.rooms.some(r=>r.kind!=='yard'
      &&pt.x>r.rect.x+14&&pt.x<r.rect.x+r.rect.width-14
      &&pt.y>r.rect.y+14&&pt.y<r.rect.y+r.rect.height-14)
    && !M.covers.some(c=>pt.x>c.rect.x-12&&pt.x<c.rect.x+c.rect.width+12
      &&pt.y>c.rect.y-12&&pt.y<c.rect.y+c.rect.height+12);
  const pts=[]; for(let x=40;x<M.width;x+=48)for(let y=40;y<M.height;y+=48){const pt={x,y};if(stand(pt))pts.push(pt);}
  let longest=0,over=0,open=0;
  for(let i=0;i<pts.length;i+=2)for(let j=i+2;j<pts.length;j+=5){
    const a=pts[i],b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);
    if(blocked(a,b))continue; open++; if(d>25*U)over++; if(d>longest)longest=d;
  }
  check('R7','최장 무차폐 사선','61.0m',`${(longest/U).toFixed(1)}m`, longest<=25*U);
  check('R7b','25m 초과 사선 비율','97%',`${pct(over,open).toFixed(0)}%`, pct(over,open)<=10);
  const big=M.rooms.filter(r=>r.kind!=='yard'&&(r.rect.width>8*U||r.rect.height>8*U));
  check('R8','한 변 8m 초과 방','12개',`${big.length}개`, big.length<=2,
    big.map(r=>r.label).slice(0,4).join(' '));
  const st=M.stairs??[];
  check('R5','수직 경로 (계단+해치)','0개',`${st.length}개`, st.filter(s=>s.kind==='stair').length>=2&&st.some(s=>s.kind==='hatch'));
  check('R5b','층 정의','없음',`${(M.floors??[]).length}층`, (M.floors??[]).length>=1);
}

// ── 연출·이펙트·사운드 (파일·코드 존재 확인) ────────────────
{
  const src=p=>path.join(__dirname,S,p);
  const exists=p=>fs.existsSync(src(p));
  const read=p=>{try{return fs.readFileSync(src(p),'utf8');}catch(e){return '';}};
  const canvas=read('components/BroadcastCanvas.tsx');
  const branches=(canvas.match(/event\.type===/g)||[]).length;
  check('FX-1','사건 렌더 분기 수','3개',`${branches}개`, branches>=6,
    'death / downed / objective / revive 분기가 추가됐는지');
  check('FX-2','effectParts.ts','없음', exists('components/effectParts.ts')?'있음':'없음',
    exists('components/effectParts.ts'));
  const fxDir=path.join(__dirname,'../artifacts/draft-order-player-generator/public/operators/effects');
  const fxFiles=fs.existsSync(fxDir)?fs.readdirSync(fxDir).filter(f=>f.endsWith('.png')).length:0;
  check('FX-3','이펙트 PNG 개수','0장',`${fxFiles}장`, fxFiles>=14);
  const minimal=read('components/minimalOperator.ts');
  check('FX-4','아이들 모션 (정지 시 호흡)','없음', /idle/i.test(minimal)?'있음':'없음', /idle/i.test(minimal),
    'hold 상태 39.7%가 정물인 문제');
  check('SND-1','matchAudio.ts','없음', exists('components/matchAudio.ts')?'있음':'없음',
    exists('components/matchAudio.ts'));
  const audioDir=path.join(__dirname,'../artifacts/draft-order-player-generator/public/audio');
  const sndFiles=fs.existsSync(audioDir)?fs.readdirSync(audioDir).filter(f=>/\.(ogg|mp3|wav)$/.test(f)).length:0;
  check('SND-2','오디오 샘플 개수','0개',`${sndFiles}개`, sndFiles>=6);
  // 감독 지시 UI — 방향 결정에 따라 판정이 갈린다
  const hasDirector=/DirectorCommand|진입로 변경|경로 변경/.test(canvas+read('components/TacticalRoundLive.tsx'));
  check('DIR-1','경기 중 감독 지시 UI','있음(319c199에서 추가)', hasDirector?'있음':'없음', null,
    '방향 A(사전 결정형)를 골랐다면 제거, 방향 B를 골랐다면 유지. 판정 보류 항목');
}

// ── 출력 ────────────────────────────────────────────────────
const mark=p=>p===null?'  ?  ':p?' PASS':' FAIL';
console.log(`\nQA 반영 검증 — 경기 표본 ${GAMES}개\n`);
console.log('  판정  | ID        | 항목                                   | 기준선      → 현재');
console.log('  ------+-----------+----------------------------------------+---------------------');
for(const r of rows)
  console.log(`  ${mark(r.pass)} | ${r.id.padEnd(9)} | ${r.label.slice(0,38).padEnd(38)} | ${String(r.base).padStart(10)} → ${r.now}`);
const fail=rows.filter(r=>r.pass===false), hold=rows.filter(r=>r.pass===null);
console.log(`\n합계 ${rows.length}항목 · 통과 ${rows.filter(r=>r.pass===true).length} · 실패 ${fail.length} · 보류 ${hold.length}`);
if(fail.length){
  console.log('\n실패 항목 상세:');
  for(const r of fail) console.log(`  [${r.id}] ${r.label}\n      기준선 ${r.base} → 현재 ${r.now}${r.note?`\n      ${r.note}`:''}`);
}
fs.mkdirSync(path.join(__dirname,'../validation'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../validation/qa-verify.json'),
  JSON.stringify({at:new Date().toISOString(),games:GAMES,rows},null,2)+'\n');
console.log('\n결과 기록: validation/qa-verify.json');
```

실행:

```bash
cd tests && node qa-verify.cjs        # 기본 12경기
cd tests && node qa-verify.cjs 40     # 표본을 늘려 재확인
```

**팀 능력치가 생성기 난수라 실행마다 절대값이 조금 흔들린다.** 경계선에 걸린 항목은 표본을 40 이상으로 올려 재확인한다.

---

## 2. 자동 검증 항목 표

`qa-verify.cjs`가 판정하는 항목이다. 기준선은 `319c199` 실측값.

| ID | 항목 | 기준선 | 통과 기준 | 출처 문서 |
|---|---|---|---|---|
| P0-01 | 선발조 2명 재진입 도달률 | 20% | ≥ 80% | QA 디브리프 |
| P0-01b | 선발조 2명 공격 승률 | 0% | ≥ 15% | QA 디브리프 |
| P0-01c | 선발조 2명 시간 만료율 | 80% | ≤ 30% | QA 디브리프 |
| P0-02 | 공격 승률 (UI 기본 조건) | 24.2% | 40~60% | QA 디브리프 |
| P0-02b | 종료 사유 공격 전멸 | 44% | ≤ 25% | QA 디브리프 |
| P0-A | 순환 대기 발생 비율 | 15.0% | **0%** | AI 행동 QA |
| P0-A2 | 최장 연속 대기 | 132.9초 | ≤ 6초 | AI 행동 QA |
| P1-C | 카메라 설치 오퍼레이터 종류 | 3~5종 | ≤ 1종 | AI 행동 QA |
| P1-C2 | 연막 투척 오퍼레이터 종류 | 4~5종 | ≤ 2종 | AI 행동 QA |
| P1-D | 한 유닛 2종 이상 가젯 사용 | 0건 | > 0건 | AI 행동 QA |
| P2-15 | MEDVED 등장률 | 5% | ≥ 40% | QA 디브리프 |
| P2-15b | SAVELLI 등장률 | 5% | ≥ 40% | QA 디브리프 |
| P2-16 | 명중률 | 79.1% | ≤ 55% | QA 디브리프 |
| P2-16b | 헤드샷 비율 | 16.5% | ≤ 10% | QA 디브리프 |
| P2-16c | 4킬 이상 경기 | 22.9% | ≤ 10% | QA 디브리프 |
| P2-16d | 첫 사망 시각 중앙값 | 17.5초 | ≥ 25초 | QA 디브리프 |
| P2-16e | 라운드 길이 중앙값 | 74초 | ≥ 90초 | QA 디브리프 |
| P2-17 | 소생률 | 12.6% | ≥ 25% | QA 디브리프 |
| P2-19 | 벽 관통 사격 | 0회 | > 0회 (또는 의도 확인) | QA 디브리프 |
| P2-20 | 진입 시 아군 최소 간격 | 26.7단위 | ≥ 60단위 | QA 디브리프 |
| GRIP-1 | 총 중심선 y 최대 절댓값 | 1.98 | ≥ 5 | 방향·파지 QA |
| GRIP-2 | 개머리판 몸 뒤 삐짐 | 6명 | 0명 | 방향·파지 QA |
| GRIP-3 | 방아쇠손 x 편차 | 14.0단위 | ≤ 4단위 | 방향·파지 QA |
| R5 | 수직 경로 (계단 2+ · 해치 1+) | 0개 | 충족 | 레벨 디자인 |
| R5b | 층 정의 | 없음 | ≥ 1층 | 레벨 디자인 |
| R7 | 최장 무차폐 사선 | 61.0m | ≤ 25m | 레벨 디자인 |
| R7b | 25m 초과 사선 비율 | 97% | ≤ 10% | 레벨 디자인 |
| R8 | 한 변 8m 초과 방 | 12개 | ≤ 2개 | 레벨 디자인 |
| FX-1 | 사건 렌더 분기 수 | 3개 | ≥ 6개 | 연출·이펙트 |
| FX-2 | `effectParts.ts` 존재 | 없음 | 있음 | 연출·이펙트 |
| FX-3 | 이펙트 PNG 개수 | 0장 | ≥ 14장 | 연출·이펙트 |
| FX-4 | 아이들 모션 | 없음 | 있음 | 연출·이펙트 |
| SND-1 | `matchAudio.ts` 존재 | 없음 | 있음 | 사운드 |
| SND-2 | 오디오 샘플 개수 | 0개 | ≥ 6개 | 사운드 |
| DIR-1 | 경기 중 감독 지시 UI | 있음 | **판정 보류** | 방향·파지 QA |

---

## 3. 수동 확인 항목

수치로 판정할 수 없어 **실제 브라우저 화면으로만** 확인되는 것들이다. 확인했으면 캡처를 남긴다.

| ID | 항목 | 기준선 | 확인 방법 | 통과 기준 |
|---|---|---|---|---|
| P1-04 | 탑뷰/측면뷰 투영 일치 | **319c199에서 수정 완료** | 관전 화면 확대 | 인물이 위에서 본 모습 |
| P1-05 | 북쪽 볼 때 머리 뭉개짐 | 있음 | facing 위쪽 캐릭터 4배 확대 | 사람으로 읽힘 |
| P1-06 | 진영 색 식별 | 2×4단위 점 | 아군·적군 한 화면 | 1초 안에 구분 가능 |
| P1-07 | 연막이 사람을 가림 | 안 가림 | 연막 안 인물 확인 | 실루엣만 보임 |
| P1-09 | 로비 실사 vs 게임 플랫 | 충돌 | 로비 → 경기 전환 | 같은 화풍 |
| P1-10 | 전술 보기에서 아군 가려짐 | 상단 y 0~186 가려짐 | 라운드 시작 시 전술 보기 | 스폰 트럭 5개 보임 |
| P1-11 | 전술 보기 글자 크기 | 3.6px | 전술 보기 방 이름 | 읽힘 |
| P1-12 | 선수 위 라벨 겹침 | 4개 겹침 | 경고 상태 선수 확대 | 겹침 없음 |
| P1-13 | 시야 폴리곤 벽 누출 | 3.0% | 전술 보기 시야 부채꼴 | 벽에서 끊김 |
| P1-14 | 맵이 실내로 읽힘 | 격자표 | 전술 보기 전체 | 방·복도 구분됨 |
| P2-21 | 라운드 종료 후 LIVE 표시 | **319c199에서 수정 완료** | 종료 시 스코어보드 | `ENDED` 표시 |
| P2-22 | 자동 중계가 시체 추적 | 추적함 | 라운드 종료 순간 | 결정적 장면 |
| P2-23 | 새로고침 시 팀 유지 | 새로 생성 | F5 후 팀명 | 동일 |
| FX-M1 | 총구 화염 위치 | 없음 | 사격 순간 확대 | 총구 끝에 붙음 |
| FX-M2 | 혈흔 방향 | 없음 | 피격 순간 확대 | 탄환 진행 방향 |
| FX-M3 | 이펙트 알파 | — | `transparentFraction` | ≥ 0.4 (체커보드 아님) |
| SND-M1 | 모바일 오디오 unlock | — | 휴대폰에서 출전 | 소리 남 |
| SND-M2 | 4배속 음질 | — | 4배속 관전 | 찍찍거리지 않음 |
| PERF-1 | iPhone 15 실기기 프레임 | 미측정 | 실기기 관전 | 30fps 이상 |

---

## 4. 이미 수정 확인된 항목

`319c199`에서 반영이 확인된 것들이다. **회귀만 감시한다.**

| ID | 항목 | 확인 근거 |
|---|---|---|
| P1-04 | 탑뷰 캐릭터 전환 | `ctx.rotate(unit.facing)` 적용, 실제 화면 확인 |
| P1-08a | 새 탑뷰 총기 PNG 12종 적용 | `public/operators/weapons/top/*.png`, `paintWeaponPart` |
| P2-21 | 라운드 종료 표시 | 스코어보드 `ENDED` 확인 |
| P0-03 | 감독 지시 UI 구현 | 관전 화면에 `진입/대기/후퇴/경로 변경` 버튼. **단 방향 결정에 따라 제거 대상일 수 있음** |
| — | 런타임 에러 | 콘솔 에러 0건 |
| — | 팔·손 렌더 | `arm()` · 손 타원 추가 |

---

## 5. 판정 보류 항목

수치로 옳고 그름을 정할 수 없고 **방향 결정이 먼저**인 것들이다.

| ID | 항목 | 결정할 것 |
|---|---|---|
| DIR-1 | 경기 중 감독 지시 UI | 방향 A(사전 결정형) → 제거 / 방향 B(실시간 지휘형) → 유지 |
| DIR-2 | 준비 화면 선택 수 (현재 28개 컨트롤, 12,480조합) | A를 골랐다면 27~64조합으로 축약 |
| DIR-3 | 공개 숫자 (현재 8개) | A를 골랐다면 0~2개 |
| FX-B | 혈흔 색조 | 저채도 크림슨 / 먼지+붉은 액센트 최소화 |
| P1-04b | 투영 방식 최종형 | 진짜 탑다운(현재) 유지 / 45° 비스듬 통일 |

---

## 6. 보고받을 때 요구할 것

구현 에이전트가 "반영 완료"를 보고할 때 아래를 함께 요구한다. 없으면 통과 처리하지 않는다.

1. `node tests/qa-verify.cjs 40` 출력 전문
2. `validation/qa-verify.json`
3. 기존 14개 스위트 재실행 결과
4. 수동 항목에 대한 실제 브라우저 캡처
5. 변경한 파일·함수 목록
6. 남긴 `ponytail:` 주석 목록

그리고 **기준선이 나빠진 항목이 있으면 회귀다.** `qa-verify.json`을 커밋해 두면 다음 실행과 자동 대조가 된다.
