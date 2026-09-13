// 실제 Canvas 변환과 표시 총구를 대조하고 엔진 소스 불변을 확인합니다.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
require('./qa-preparation-batch.cjs');
const {createCanvas,loadImage}=require('@napi-rs/canvas'),root=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const {OPERATORS}=require(root+'/src/domain/Operator.ts'),{operatorStateVisual,muzzlePosition}=require(root+'/src/domain/operatorVisuals.ts');
const {drawOperatorSheet,sheetMuzzlePosition}=require(root+'/src/components/operatorSheet.ts');
(async()=>{
 const c=createCanvas(200,200),ctx=c.getContext('2d'),images=new Map();let calls=0,matrix,region;
 const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{calls++;matrix=ctx.getTransform();region=args.slice(1,5);draw(...args);};
 for(const op of OPERATORS)for(const locomotion of ['walk','crouch'])for(let i=0;i<4;i++)for(let a=0;a<8;a++){
  const angle=a*Math.PI/4,unit={id:'test',callSign:op.callSign,weaponName:op.firearms[0],alive:true,action:'approach',locomotion,velocity:{x:3*Math.cos(angle),y:3*Math.sin(angle)},position:{x:80,y:90},facing:angle,reloadRemaining:0};
  const before=JSON.stringify(unit),engine=muzzlePosition(unit.weaponName,unit.position,unit.facing),visual=operatorStateVisual(unit,i/(locomotion==='walk'?4:3)+.00001);
  if(!images.has(visual.sprite))images.set(visual.sprite,await loadImage(root+'/public/operators/'+visual.sprite));
  const n=calls;assert(drawOperatorSheet(ctx,visual,unit,f=>images.get(f)));assert.equal(calls,n+1,'시트 한 번만 그림');assert.deepEqual(region,visual.region);
  const x=visual.muzzle[0]-visual.pivot[0],y=visual.muzzle[1]-visual.pivot[1],m=sheetMuzzlePosition(visual,unit);
  const error=Math.hypot(m.x-(matrix.a*x+matrix.c*y+matrix.e),m.y-(matrix.b*x+matrix.d*y+matrix.f));
  // Skia 변환은 float32: 관측 오차 0.000016단위. 0.0001단위보다 큰 정렬 오차는 실패합니다.
  assert(error<1e-4,'그려진 프레임의 총구와 표시 원점 일치: '+error);
  assert.equal(JSON.stringify(unit),before);assert.deepEqual(muzzlePosition(unit.weaponName,unit.position,unit.facing),engine);
 }
 const sourceHashes={};for(const name of ['domain/realtime/TacticalRealtimeSimulation.ts','components/weaponParts.ts']){
  const file='artifacts/draft-order-player-generator/src/'+name,current=fs.readFileSync(root+'/src/'+name),base=execFileSync('git',['show','79dd43c1b423d60e2522d7c89c9c3c56948fe45b:'+file]);
  assert(current.equals(base),'시뮬레이션/판정 총구 변경 금지');sourceHashes[name]=crypto.createHash('sha256').update(current).digest('hex');
 }
 const unit={position:{x:0,y:0},facing:0};assert.equal(drawOperatorSheet(ctx,{sprite:'missing'},unit,()=>({complete:false})),false,'로딩 전에는 폴백 허용');
 fs.writeFileSync('validation/operator-sheet-contract.json',JSON.stringify({sheets:images.size,directionalFrames:calls,sourceHashes,scope:'Actual Canvas transform, single sheet draw, display anchor, immutable engine sources'},null,2)+'\n');console.log('PASS 24 sheets / 768 frame-directions; engine sources unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
