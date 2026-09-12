// 원문: docs/qa-sources/qa-verify-checklist.md. API·오류 처리·재현성 보정은 QA_COVERAGE.md 참조.
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
const {NAMSAN_MAP:BREACHLINE_MAP,layer}=require(R+'tacticalMaps.ts');
const U=40, GAMES=Number(process.argv[2]??12);

const rows=[];
/** 한 항목의 판정을 기록한다. pass 판단은 비교식으로만 한다. */
const check=(id,label,base,now,pass,note='')=>rows.push({id,label,base,now,pass,note});
const pct=(a,b)=>(100*a/Math.max(1,b));

// ── 편성 헬퍼 ────────────────────────────────────────────────
// 선수 생성 난수만 고정하고 경기 엔진의 시드는 각 입력 그대로 사용합니다.
const populationSeed=20260912, nativeRandom=Math.random;let populationState=populationSeed;
Math.random=()=>{populationState=(Math.imul(populationState,1664525)+1013904223)>>>0;return populationState/4294967296;};
let teams;try{teams=new TeamGenerator().generateTenTeams();}finally{Math.random=nativeRandom;}
const inputs=[];
if(!Number.isInteger(GAMES)||GAMES<1||GAMES>200)throw Error('경기 수는 1~200 정수여야 합니다.');
function draftPair(g){
  const at=teams[g%10], dt=teams[(g+4)%10];
  if(at===dt)throw Error('같은 팀 대전 입력');
  try{
    return {
      A:confirmOperatorDraft(at,'공격',completeOperatorDraft(at,'공격',[null,null,null,null,null])),
      D:confirmOperatorDraft(dt,'수비',completeOperatorDraft(dt,'수비',[null,null,null,null,null])),
    };
  }catch(e){ throw new Error('편성/엔진 검증 실패: '+e.message); }
}
/** scoutPlan 경로를 검증한다. 원문 150초 표본이며 현 UI 전체 모집단은 아니다. */
function run(g, scoutIndices){
  const p=draftPair(g); if(!p) return null;
  try{
    const input={
      attackers:p.A, defenders:p.D, seed:4400+g*19, maxSeconds:150,
      targetSite:g%2?'A':'B', siteApproach:g%3,
      scoutPlan:{indices:scoutIndices, seconds:40, entryRoute:g%5},
    };
    inputs.push(input);if(g%10===0)console.log('실행',scoutIndices.length?'선발조':'즉시 진입',g+'/'+GAMES);
    return new TacticalRealtimeSimulation().run(input);
  }catch(e){ throw new Error('편성/엔진 검증 실패: '+e.message); }
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
    let r; try{ const input={attackers:p.A,defenders:p.D,seed:5500+g*13,
      maxSeconds:150,targetSite:g%2?'A':'B',siteApproach:g%3,defensePreparation:['camera','reinforce','shield'][g%3],
      scoutPlan:{indices:[],seconds:25,entryRoute:g%5}}; inputs.push(input);r=new TacticalRealtimeSimulation().run(input); }catch(e){ throw e; }
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
  let worstCenter=Infinity, overRear=0, gripSpread=[];
  const BODY_REAR=-18;
  let weaponPart=null;
  try{ weaponPart=require(S+'components/weaponParts.ts').weaponPart; }catch(e){throw e;}
  for(const o of OPERATORS){
    const m=muzzlePosition(o.firearms[0],{x:0,y:0},0);
    worstCenter=Math.min(worstCenter,Math.abs(m.y));
    if(weaponPart){
      const p=weaponPart(o.firearms[0]);
      if(m.x-p.length<BODY_REAR) overRear++;
      if(!p.gripPoint)throw Error('총기 접점 누락');gripSpread.push(m.x+p.gripPoint[0]);
    }
  }
  check('GRIP-1','총 중심선 y 최소 절댓값 (전 총기)','1.98',`${worstCenter.toFixed(2)}`, worstCenter>=5,
    '탑뷰에서 총은 어깨 앞(y 6~9)에 비켜 있어야 한다. 0에 가까우면 몸 정중앙 관통');
  check('GRIP-2','개머리판이 몸 뒤로 삐진 오퍼레이터','6명',`${overRear}명`, overRear===0);
  if(gripSpread.length){
    const spread=Math.max(...gripSpread)-Math.min(...gripSpread);
    check('GRIP-3','방아쇠손 x 편차','14.0단위',`${spread.toFixed(1)}단위`, spread<=4,
      '원문 임계값 보존. 총기별 접점은 다를 수 있으며 실제 빈손 포즈 검수와 별개');
  }
}

// ── 레벨 디자인 (R7·R8·R5) ─────────────────────────────────
{
  for(const floor of BREACHLINE_MAP.floors??[{id:0}]){
  const M=layer(BREACHLINE_MAP,floor.id);
  const segs=M.walls.filter(w=>w.kind!=='door-gap').map(w=>[w.from,w.to]);
  for(const c of M.covers){const r=c.rect,p=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},
    {x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
    p.forEach((q,i)=>segs.push([q,p[(i+1)%4]]));}
  const blocked=(a,b)=>{for(const[p,q]of segs){
    const r={x:b.x-a.x,y:b.y-a.y},s={x:q.x-p.x,y:q.y-p.y},d=r.x*s.y-r.y*s.x;
    if(Math.abs(d)<1e-9)continue;
    const t=((p.x-a.x)*s.y-(p.y-a.y)*s.x)/d,u=((p.x-a.x)*r.y-(p.y-a.y)*r.x)/d;
    if(t>1e-6&&t<1-1e-6&&u>=0&&u<=1)return true;}return false;};
  const engine=new TacticalRealtimeSimulation(BREACHLINE_MAP);
  const stand=pt=>engine.canStand({...pt,floor:floor.id},M)&&M.rooms.some(r=>r.kind!=='yard'
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
  check('R7-F'+floor.id,'최장 무차폐 사선','61.0m',`${(longest/U).toFixed(1)}m`, longest<=25*U);
  check('R7b-F'+floor.id,'25m 초과 사선 비율','97%',`${pct(over,open).toFixed(0)}%`, pct(over,open)<=10);
  const big=M.rooms.filter(r=>r.kind!=='yard'&&(r.rect.width>8*U||r.rect.height>8*U));
  check('R8-F'+floor.id,'한 변 8m 초과 방','12개',`${big.length}개`, big.length<=2,
    big.map(r=>r.label).slice(0,4).join(' '));
  }
  const M=BREACHLINE_MAP;const st=M.stairs??[];
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
  check('FX-1','사건 렌더 분기 수','3개',`${branches}개`, null,
    '문자열 개수는 구현 증거가 아님. presentation-effects 실제 Canvas 검사 참조');
  check('FX-2','effectParts.ts','없음', exists('components/effectParts.ts')?'있음':'없음',
    exists('components/effectParts.ts'));
  const fxDir=path.join(__dirname,'../artifacts/draft-order-player-generator/public/operators/effects');
  const fxFiles=fs.existsSync(fxDir)?fs.readdirSync(fxDir).filter(f=>f.endsWith('.png')).length:0;
  check('FX-3','이펙트 PNG 개수','0장',`${fxFiles}장`, fxFiles>=14);
  const minimal=read('components/minimalOperator.ts');
  check('FX-4','아이들 모션 (정지 시 호흡)','없음', /idle/i.test(minimal)?'문자열 있음':'문자열 없음', null,
    '변수명 문자열은 동작 근거가 아니므로 실제 픽셀/정지/동작 줄이기 검사가 필요');
  check('SND-1','matchAudio.ts','없음', exists('components/matchAudio.ts')?'있음':'없음',
    exists('components/matchAudio.ts'));
  const audioDir=path.join(__dirname,'../artifacts/draft-order-player-generator/public/audio');
  const sndFiles=fs.existsSync(audioDir)?fs.readdirSync(audioDir).filter(f=>/\.(ogg|mp3|wav)$/.test(f)).length:0;
  check('SND-2','오디오 샘플 개수','0개',`${sndFiles}개`, sndFiles>=6);
  // 감독 지시 UI — 방향 결정에 따라 판정이 갈린다
  const hasDirector=/DirectorCommand|진입로 변경|경로 변경/.test(canvas+read('components/TacticalRoundLive.tsx'));
  check('DIR-1','경기 중 감독 지시 UI','있음(319c199에서 추가)', hasDirector?'있음':'없음', null,
    '이미 사전 결정형으로 확정. 주석도 잡히므로 문자열만으로 판정하지 않음');
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
  JSON.stringify({at:new Date().toISOString(),commit:require('node:child_process').execFileSync('git',['rev-parse','HEAD']).toString().trim(),populationSeed,gamesPerGroup:GAMES,executions:inputs.length,map:BREACHLINE_MAP.id,scope:'고정 난수로 생성한 10팀, 원문 150초·5진입로 교차 입력. 현 UI 180초/전체 선택 모집단과 구별. 과거 수치와 동일 입력 아님.',rows},null,2)+'\n');
console.log('\n결과 기록: validation/qa-verify.json');
const lineups=[],lookup=new Map();
const intern=value=>{const key=JSON.stringify(value);if(!lookup.has(key)){lookup.set(key,lineups.length);lineups.push(value);}return lookup.get(key);};
const executions=inputs.map(({attackers,defenders,...rest})=>({...rest,attackers:intern(attackers),defenders:intern(defenders)}));
fs.writeFileSync(path.join(__dirname,'../validation/qa-verify-inputs.json.gz'),require('node:zlib').gzipSync(JSON.stringify({format:'lineups[index] replaces attackers/defenders; all fields preserved',lineups,executions})));
process.exitCode=fail.length?1:0;
