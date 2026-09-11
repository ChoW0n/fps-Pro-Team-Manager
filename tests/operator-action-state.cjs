// 실제 행동별 시트 선택 계약입니다. 인체·총기 고증이나 브라우저 플레이 검사를 대체하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const {operatorVisual,operatorStateVisual,muzzlePosition}=require(root+'/src/domain/operatorVisuals.ts');

/** 이동·정지·행동 우선순위를 같은 입력에서 대조하고 렌더링의 무변경성을 확인합니다. */
function check(callSign){
  const unit={callSign,alive:true,action:'approach',locomotion:'walk',velocity:{x:30,y:0},facing:0,position:{x:100,y:200},reloadRemaining:0};
  const original=JSON.stringify(unit),muzzle=muzzlePosition(callSign,unit.position,unit.facing);
  const frames=Array.from({length:4},(_,index)=>operatorStateVisual(unit,index*.25));
  assert.equal(new Set(frames.map(frame=>JSON.stringify(frame.region))).size,4);
  assert(frames.every(frame=>frame.sprite===frames[0].sprite));
  assert.deepEqual(operatorStateVisual(unit,1),frames[0]);
  assert.deepEqual(operatorStateVisual(unit,.5),operatorStateVisual(unit,.5),'같은 경기 시각은 일시정지·배속과 무관하게 같은 프레임');
  for(const change of [{velocity:{x:0,y:0}},{velocity:{x:-30,y:0}},{velocity:{x:0,y:30}},{alive:false},{action:'fire'},{action:'aim'},{action:'reload'},{action:'plant'},{action:'disable'},{action:'utility'},{action:'revive'},{reloadRemaining:1},{shieldRaised:true},{traversal:{kind:'vault',until:10}},{locomotion:'sprint'},{locomotion:'crouch'},{locomotion:'crawl'}]){
    assert.equal(operatorStateVisual({...unit,...change},.5),operatorVisual(callSign),JSON.stringify(change));
  }
  assert.equal(operatorStateVisual(unit,NaN),operatorVisual(callSign));
  assert(!operatorStateVisual({...unit,downed:{mode:'stabilize'}},.5).sprite.includes('-walk-'));
  assert.deepEqual(muzzlePosition(callSign,unit.position,unit.facing),muzzle);
  assert.equal(JSON.stringify(unit),original,'표현은 입력·난수·물리 상태를 변경하지 않습니다');
  return {callSign,action:'walk',frames:frames.length,sprite:frames[0].sprite};
}
const {OPERATORS}=require(root+'/src/domain/Operator.ts');
const report=OPERATORS.map(operator=>check(operator.callSign));
fs.writeFileSync(path.resolve(__dirname,'../validation/operator-action-state.json'),JSON.stringify({scope:'State selection only; not anatomy or browser play',clips:report},null,2)+'\n');
console.log(`PASS ${report.length} walk clips: movement, direction, competing actions, clock, unit immutability and muzzle preservation`);
