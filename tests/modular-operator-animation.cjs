// 활성 조립식 렌더러를 검사합니다. 이전 minimalOperator 및 브라우저는 사용하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {execFileSync}=require('node:child_process'),Module=require('node:module');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator/src');
const {OperatorAnimator,paintModularOperator,weaponMountPose}=require(root+'/components/modularOperator.ts');
const {OPERATORS}=require(root+'/domain/Operator.ts');
const base={id:'motion',callSign:'MAGPIE',side:'공격',weaponName:'L119A2 카빈',position:{x:0,y:0},velocity:{x:0,y:0},facing:0,floor:0,alive:true,action:'aim',locomotion:'walk',reloadRemaining:0,ammo:12,reserveAmmo:60};
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const frozen=u=>Object.freeze({...u,position:Object.freeze({...u.position}),velocity:Object.freeze({...u.velocity})});

(async()=>{
  const asset=await require('./load-weapon-sprites.cjs')();
  const render=(u,time,motion={},painter=paintModularOperator,reduced=false)=>{
    const canvas=createCanvas(128,128),ctx=canvas.getContext('2d');ctx.translate(42,64);
    assert(painter(ctx,frozen(u),time,undefined,asset,reduced,motion));return canvas;
  };
  // 승인 커밋의 함수를 직접 실행해 서기·앉기 픽셀을 대조합니다.
  const baselineSource=execFileSync('git',['show','36c72b7859569d26b3c1207c160a9e8a60853ec7:artifacts/draft-order-player-generator/src/components/modularOperator.ts'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  const baseline=new Module(root+'/components/approved-baseline.ts',module);baseline.filename=root+'/components/approved-baseline.ts';baseline.paths=module.paths;baseline._compile(compile(baselineSource),baseline.filename);
  const names=[...new Set(OPERATORS.flatMap(o=>o.firearms))];
  const approvedNames=[...new Set(OPERATORS.map(o=>o.firearms[0]))];
  for(const weaponName of approvedNames)for(const locomotion of ['walk','crouch']){
    const u={...base,weaponName,locomotion},animator=new OperatorAnimator(),frame=animator.sample(frozen(u),1);
    assert.deepEqual(render(u,1,{frame}).toBuffer('image/png'),render(u,1,{},baseline.exports.paintModularOperator).toBuffer('image/png'),'승인 정적 외형 '+weaponName+' '+locomotion);
  }

  const walk=fps=>{const a=new OperatorAnimator();let frame;a.sample(frozen(base),0);for(let i=1;i<=fps;i++)frame=a.sample(frozen({...base,position:{x:i/fps*30,y:0},velocity:{x:30,y:0}}),i/fps);return frame;};
  const frame30=walk(30);for(const fps of [60,120]){const f=walk(fps);near(f.step,frame30.step,'같은 이동 거리의 보행 위상');near(f.lowerFacing,frame30.lowerFacing);}
  const blocked=new OperatorAnimator();blocked.sample(frozen(base),0);
  for(let i=1;i<=20;i++)near(blocked.sample(frozen({...base,velocity:{x:30,y:0}}),i/10).step,0,'실제 이동 없으면 제자리 걷기 금지');
  const turn=new OperatorAnimator();const strafe={...base,velocity:{x:0,y:30}};turn.sample(frozen(strafe),0);
  const atStop=turn.sample(frozen({...base,position:{x:0,y:3}}),.1);
  assert(atStop.lowerFacing>0&&atStop.lowerFacing<Math.PI/2,'정지 시 하체 방향 순간 복귀 금지');
  near(turn.sample(frozen({...base,position:{x:0,y:3}}),.3).lowerFacing,0,'정지 복귀 완료');
  const restart=new OperatorAnimator();restart.sample(frozen(base),0);
  restart.sample(frozen({...base,position:{x:6,y:0},velocity:{x:30,y:0}}),.2);
  near(restart.sample(frozen({...base,position:{x:6,y:0}}),.4).step,0);
  assert(Math.abs(restart.sample(frozen({...base,position:{x:6.3,y:0},velocity:{x:30,y:0}}),.41).step)<=.24000001,'걷기 재시작 때 이전 보행 위상으로 튀지 않음');
  const crouch=new OperatorAnimator();crouch.sample(frozen(base),0);
  const middle=crouch.sample(frozen({...base,locomotion:'crouch'}),.09);near(middle.crouchAmount,.5);
  near(crouch.sample(frozen({...base,locomotion:'crouch'}),.18).crouchAmount,1);
  near(crouch.sample(frozen(base),.36).crouchAmount,0);
  const reload=new OperatorAnimator(),loading={...base,action:'reload',reloadRemaining:1};
  const half=reload.sample(frozen(loading),1,false,{reloadStartedAt:0});near(half.reloadReach,1);
  const cancelled=reload.sample(frozen(base),1.03);assert(cancelled.reloadReach>0&&cancelled.reloadReach<1,'장전 취소 시 손 복귀 전환');
  near(reload.sample(frozen(base),1.2).reloadReach,0);
  assert.deepEqual(reload.sample(frozen(base),1.2),reload.sample(frozen(base),1.2),'정지 프레임 불변');
  for(const special of [{...base,floor:1},{...base,position:{x:400,y:0}},{...base,alive:false},{...base,downed:{mode:'crawl'},locomotion:'crawl'}]){
    const a=new OperatorAnimator();a.sample(frozen(loading),1,false,{reloadStartedAt:0});const f=a.sample(frozen(special),1.1);near(f.step,0);near(f.reloadReach,0,'층 변경·이동 불연속·다운은 이전 장전 전환 폐기');
  }
  near(reload.sample(frozen(base),0).step,0,'시간 역행 초기화');
  const reduced=reload.sample(frozen(loading),.1,true,{reloadStartedAt:0});near(reduced.step,0);near(reduced.reloadReach,0);

  // 실제 그려진 팔 선분과 손 목표를 검사합니다. 구현 수식의 복제만으로 통과시키지 않습니다.
  let directionCases=0,armCases=0;
  for(const weaponName of names){
    const mount=weaponMountPose(weaponName);
    for(let move=0;move<8;move++)for(let aim=0;aim<16;aim++){
      const angle=move*Math.PI/4,u={...base,weaponName,facing:aim*Math.PI/8,velocity:{x:30*Math.cos(angle),y:30*Math.sin(angle)}};
      const a=new OperatorAnimator(),frame=a.sample(frozen(u),0);
      assert(Math.abs(Math.atan2(Math.sin(frame.lowerFacing-u.facing),Math.cos(frame.lowerFacing-u.facing)))<=Math.PI*110/180+1e-8,'뒤로 걷기 골반 방향');
      render(u,0,{frame});directionCases++;
    }
    for(const reach of [0,.25,.5,.75,1]){
      const canvas=createCanvas(128,128),native=canvas.getContext('2d');native.translate(42,64);
      const arms=[];let points=[];
      const ctx=new Proxy(native,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return(...args)=>{
        if(key==='beginPath')points=[];
        if(key==='moveTo'||key==='lineTo')points.push({x:args[0],y:args[1]});
        if(key==='stroke'&&points.length===3&&target.lineWidth===6)arms.push(points.slice());
        return value.apply(target,args);
      };},set(target,key,value){target[key]=value;return true;}});
      paintModularOperator(ctx,frozen({...base,weaponName}),1,undefined,asset,false,{frame:{lowerFacing:0,crouchAmount:0,step:0,reloadReach:reach}});
      assert.equal(arms.length,2);
      near(distance(arms[0][0],arms[0][1]),12);near(distance(arms[0][1],arms[0][2]),12,'장전 지지팔 길이');
      near(distance(arms[1][0],arms[1][1]),8);near(distance(arms[1][1],arms[1][2]),9,'방아쇠팔 길이');
      near(distance(arms[1][2],mount.triggerHand),0,'방아쇠손 접점 유지');
      if(reach===0)near(distance(arms[0][2],mount.supportHand),0);
      if(reach===1)near(distance(arms[0][2],mount.magazine),0,'장전 탄창 접점');
      armCases++;
    }
  }
  const source=fs.readFileSync(root+'/components/BroadcastCanvas.tsx','utf8');assert(source.includes('operatorAnimator.sample(unit,time,reducedMotion,motion)')&&source.includes('frame:animation'),'활성 중계 연결');
  const output=path.resolve(__dirname,'../validation');
  const sheet=createCanvas(1400,220),ctx=sheet.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,1400,220);
  const poses=[['Stand',{}],['Walk',{frame:frame30}],['Stop',{frame:atStop}],['Crouch 50%',{frame:middle}],['Crouch',{frame:{...middle,crouchAmount:1}}],['Reload',{frame:half}],['Cancel',{frame:cancelled}]];
  poses.forEach(([label,motion],i)=>{ctx.drawImage(render(base,1,motion),0,36,96,56,i*200,24,200,117);ctx.fillStyle='#E5ECE9';ctx.font='16px sans-serif';ctx.fillText(label,i*200+18,184);});
  fs.writeFileSync(output+'/modular-operator-animation.png',sheet.toBuffer('image/png'));
  fs.writeFileSync(output+'/modular-operator-animation.json',JSON.stringify({scope:'Node Canvas; no browser',approvedCommit:'36c72b7859569d26b3c1207c160a9e8a60853ec7',staticComparisons:approvedNames.length*2,directionCases,armCases,checks:['30/60/120 fps distance phase','blocked movement','stop turn','crouch reversal','reload cancellation','pause','rewind/floor/teleport/down reset','reduced motion','frozen simulation inputs','active renderer binding'],limits:['Not a real-device or new motion art approval','Projected gait, not world-space planted feet','New sidearm sprites and prone/shield poses have separate equipment checks']},null,2)+'\n');
  console.log(`PASS ${approvedNames.length*2} approved static comparisons, ${directionCases} movement/aim poses, ${armCases} rendered arm contracts; transitions and isolation`);
})().catch(error=>{console.error(error);process.exitCode=1;});
