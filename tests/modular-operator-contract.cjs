// 통짜 인물 시트 없이 하체·상체·총기·양손을 조립하는 계약입니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas}=require('@napi-rs/canvas');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator'),root=app+'/src/';
const {OPERATORS}=require(root+'domain/Operator.ts');
const {OPERATOR_LAYER_ORDER,operatorAssemblyPose,paintModularOperator,solveArm,weaponMountPose}=require(root+'components/modularOperator.ts');
const {weaponPart}=require(root+'components/weaponParts.ts');

(async()=>{
  assert.deepEqual(OPERATOR_LAYER_ORDER,['shadow','lower-body','torso','head-and-kit','arms','weapon','hands','team-mark']);
  const kinds=new Set(),rows=[],length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  for(const operator of OPERATORS){
    const name=operator.firearms[0],mount=weaponMountPose(name),part=weaponPart(name);kinds.add(mount.kind);
    const trigger=solveArm(mount.triggerShoulder,mount.triggerHand,8,9,1);
    const support=solveArm(mount.supportShoulder,mount.supportHand,12,12,-1);
    assert(length(trigger.shoulder,trigger.hand)<17,name+' 방아쇠손 도달 범위');
    assert(length(support.shoulder,support.hand)<24,name+' 지지손 도달 범위');
    assert(Math.abs(length(trigger.shoulder,trigger.elbow)-8)<1e-6&&Math.abs(length(trigger.elbow,trigger.hand)-9)<1e-6,name+' 방아쇠팔 고정 길이');
    assert(Math.abs(length(support.shoulder,support.elbow)-12)<1e-6&&Math.abs(length(support.elbow,support.hand)-12)<1e-6,name+' 지지팔 고정 길이');
    assert.deepEqual(trigger.hand,mount.triggerHand);assert.deepEqual(support.hand,mount.supportHand);
    assert(mount.stock.x<mount.triggerHand.x&&mount.triggerHand.x<mount.muzzle.x,name+' 개머리판-방아쇠-총구 순서');
    if(mount.kind==='bolt')assert(mount.supportHand.x<mount.triggerHand.x+(part.supportPoint[0]-part.gripPoint[0])*.5,'볼트액션은 소총 처럼 핸드가드 끝을 잡지 않음');
    rows.push({operator:operator.callSign,weapon:name,kind:mount.kind,stock:mount.stock,triggerHand:mount.triggerHand,supportHand:mount.supportHand,muzzle:mount.muzzle});
  }
  for(const expected of ['carbine','smg','suppressed','bullpup','p90','marksman','bolt'])assert(kinds.has(expected),expected+' 자세군');

  const unit={id:'split',callSign:'MAGPIE',side:'공격',weaponName:'L119A2 카빈',position:{x:80,y:80},velocity:{x:0,y:12},facing:0,alive:true,action:'aim',locomotion:'walk'};
  const split=operatorAssemblyPose(unit);assert.equal(split.upperFacing,0);assert(Math.abs(split.lowerFacing-Math.PI/2)<1e-9,'이동 하체는 이동 방향');
  const still=operatorAssemblyPose({...unit,velocity:{x:0,y:0}});assert.equal(still.lowerFacing,still.upperFacing,'정지 하체는 조준 방향으로 복귀');

  const before=JSON.stringify(unit),asset=await require('./load-weapon-sprites.cjs')(),canvas=createCanvas(1500,420),ctx=canvas.getContext('2d');
  ctx.fillStyle='#263237';ctx.fillRect(0,0,1500,420);
  for(const [index,name] of ['L119A2 카빈','타보르 X95','FN P90','HK417','C14 팀버울프'].entries()){
    ctx.save();ctx.translate(145+index*295,190);ctx.scale(3.2,3.2);
    paintModularOperator(ctx,{...unit,id:String(index),weaponName:name,position:{x:0,y:0},velocity:{x:0,y:0}},1,undefined,asset,true);ctx.restore();
    ctx.fillStyle='#D5DEDB';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText(name,145+index*295,350);
    ctx.font='14px sans-serif';ctx.fillStyle='#8FA19F';ctx.fillText(weaponMountPose(name).kind.toUpperCase(),145+index*295,378);
  }
  assert.equal(JSON.stringify(unit),before,'표현 모듈은 시뮬레이션 상태를 변경하지 않음');
  const source=fs.readFileSync(root+'components/modularOperator.ts','utf8');
  assert(!/weaponHandling|OperatorStats|\.stats\b/.test(source),'외형 모듈은 성능 데이터를 읽지 않음');
  const validation=path.resolve(__dirname,'../validation');fs.mkdirSync(validation,{recursive:true});
  fs.writeFileSync(path.join(validation,'modular-operator-five-weapon-poses.png'),canvas.toBuffer('image/png'));
  fs.writeFileSync(path.join(validation,'modular-operator-contract.json'),JSON.stringify({scope:'Canvas modular operator contract; not browser or final art approval',layers:OPERATOR_LAYER_ORDER,rows,checks:['lower/upper facing split','weapon anchor order','exact two-hand contact','fixed limb lengths','bolt support pose','visual/gameplay data isolation','five-pose Canvas render']},null,2)+'\n');
  console.log('PASS modular operator layers, 12 weapon mounts, fixed two-arm contact, visual/performance isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
