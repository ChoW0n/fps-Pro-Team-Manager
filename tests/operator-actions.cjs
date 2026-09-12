// 실제 합성기의 상태 경계: 탄약 판정을 바꾸지 않고 동작만 연결합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas');
const {paintMinimalOperator}=require('../artifacts/draft-order-player-generator/src/components/minimalOperator.ts');
(async()=>{
const asset=await require('./load-weapon-sprites.cjs')();
const base={id:'action',callSign:'MAGPIE',side:'공격',weaponName:'L119A2',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,alive:true,action:'hold',ammo:0,reserveAmmo:90,magazineSize:30,reloadRemaining:0};
const render=(unit,time=1,motion={},reduced=false)=>{const c=createCanvas(220,180),ctx=c.getContext('2d');ctx.translate(110,90);ctx.scale(2.3,2.3);const before=JSON.stringify(unit);paintMinimalOperator(ctx,unit,time,undefined,asset,reduced,motion);assert.equal(JSON.stringify(unit),before,'표시가 실제 탄약·상태를 수정하지 않음');return c;};
const bytes=c=>c.toBuffer('image/png').toString('base64');
const board=createCanvas(1100,420),ctx=board.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1100,420);
let cases=0;
for(const [row,weapon] of ['L119A2','FN P90'].entries()){
 const unit={...base,weaponName:weapon,callSign:row?'MARCHAND':'MAGPIE'};
 const held=render(unit),reload={...unit,action:'reload',reloadRemaining:1.2};
 const start=render({...reload,reloadRemaining:2.4},0,{reloadStartedAt:0});
 const middle=render(reload,1.2,{reloadStartedAt:0});
 const end=render(unit,2.4,{reloadStartedAt:0});
 assert.notEqual(bytes(start),bytes(middle),'장전 중 실제 탄창 위치로 지지 손이 이동함');
 assert.equal(bytes(held),bytes(end),'실제 완료 후 기본 파지로 복귀');
 assert.equal(bytes(middle),bytes(render(reload,1.2,{reloadStartedAt:0})),'일시 정지·재탐색 시 같은 시각은 같은 자세');
 const thrown={owner:unit.id,kind:'smoke',thrownAt:1,landedAt:1.35};
 const follow=render(unit,1.1,{thrown});
 assert.notEqual(bytes(held),bytes(follow),'실제 투척 이후 팔 후속 동작');
 assert.equal(bytes(held),bytes(render(unit,2,{thrown})),'만료된 투척 사건은 자세에 영향 없음');
 assert.equal(bytes(held),bytes(render(unit,.9,{thrown})),'미래 투척 사건은 표시하지 않음');
 const down={...unit,downed:{},action:'reload',reloadRemaining:1};
 assert.equal(bytes(render(down,1.1)),bytes(render(down,1.1,{reloadStartedAt:0,thrown})),'다운 상태에서 장전·투척 동작 금지');
 const install=render({...unit,action:'utility',goal:'투척물 요격기 설치'});
 assert.notEqual(bytes(held),bytes(install),'설치 중 낮은 자세와 작업 손');
 assert.equal(bytes(render(reload,.5,{reloadStartedAt:0},true)),bytes(render(reload,1,{reloadStartedAt:0},true)),'동작 줄이기에서 탄창 이동 없음');
 for(const [i,[label,c]] of [['HOLD',held],['RELOAD',middle],['THROW',follow],['INSTALL',install],['COMPLETE',end]].entries()){
  ctx.drawImage(c,i*220,row*210);ctx.fillStyle='#D5DEDB';ctx.font='14px sans-serif';ctx.fillText(weapon+' / '+label,i*220+10,row*210+195);
 }
 cases+=9;
}
fs.writeFileSync('validation/operator-actions.png',board.toBuffer('image/png'));
fs.writeFileSync('validation/operator-actions.json',JSON.stringify({cases,throwFrames:101,checks:'reload progress and completion, deterministic paused frame, event-bound throw, expired/future events, down-state blocking, install posture, reduced motion, no unit mutation, fixed upper/lower arm length',limits:'Canvas state fixtures; not a real-device interaction test'},null,2)+'\n');
console.log('PASS',cases,'operator action contracts');

const {throwArmPose}=require('../artifacts/draft-order-player-generator/src/components/minimalOperator.ts');
for(let i=0;i<=100;i++){
 const p=throwArmPose(i/100);
 assert(Math.abs(Math.hypot(p.elbow.x-2,p.elbow.y-10)-9)<1e-9,'고정 상완 길이');
 assert(Math.abs(Math.hypot(p.hand.x-p.elbow.x,p.hand.y-p.elbow.y)-8)<1e-9,'고정 전완 길이');
}
console.log('PASS 101 throw frames: fixed upper/lower arm length');
})().catch(error=>{console.error(error);process.exitCode=1;});
