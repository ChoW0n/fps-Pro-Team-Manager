// 자산 계약·투명도 검사입니다. 해부학·총기 고증·연속 동작의 합격을 대신하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
const {OPERATORS}=require(root+'/src/domain/Operator.ts');
const {operatorVisual,operatorPoseVisual,operatorWalkVisual,muzzlePosition}=require(root+'/src/domain/operatorVisuals.ts');

/** 오프라인 Pillow로 픽셀을 읽기만 합니다. 런타임 의존성·배경 제거·이미지 수정은 없습니다. */
function inspect(file,region){
  return JSON.parse(execFileSync('python3',['-c',[
    'import json,sys',
    'from PIL import Image',
    'Image.open(sys.argv[1]).verify()',
    'im=Image.open(sys.argv[1]); size=im.size; region=json.loads(sys.argv[2])',
    'if region: x,y,w,h=region; im=im.crop((x,y,x+w,y+h))',
    'alpha=im.convert("RGBA").getchannel("A"); histogram=alpha.histogram()',
    'print(json.dumps({"size":size,"mode":im.mode,"alpha":alpha.getextrema(),"transparentFraction":histogram[0]/(im.width*im.height),"opaqueFraction":sum(histogram[200:])/(im.width*im.height)}))',
  ].join('\n'),file,JSON.stringify(region??null)],{encoding:'utf8'}));
}

/** 파일 존재·프레임 범위·원점·실제 투명 픽셀을 검증합니다. */
function checkSprite(visual){
  const file=path.join(root,'public/operators',visual.sprite),info=inspect(file,visual.region);
  const [x,y,w,h]=visual.region??[0,0,visual.width,visual.height];
  assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=info.size[0]&&y+h<=info.size[1],visual.sprite+': crop bounds');
  assert.equal(w,visual.width);assert.equal(h,visual.height);
  for(const anchor of [visual.pivot,visual.muzzle])assert(anchor[0]>=0&&anchor[0]<w&&anchor[1]>=0&&anchor[1]<h,visual.sprite+': anchor bounds');
  assert.equal(info.mode,'RGBA',visual.sprite+': 실제 알파 채널 필요');
  assert.equal(info.alpha[0],0,visual.sprite+': 불투명 체크무늬 금지');
  assert(info.transparentFraction>.05&&info.opaqueFraction>.01,visual.sprite+': 빈 이미지·불투명 배경 금지');
  return {...info,file:visual.sprite,region:visual.region??null};
}

// 외부 후보는 입고 전에 검사합니다. 실패한 파일을 public 폴더로 복사하지 않습니다.
if(process.argv[2]){
  const info=inspect(path.resolve(process.argv[2]));
  assert(info.mode==='RGBA'&&info.alpha[0]===0&&info.transparentFraction>.05&&info.opaqueFraction>.01,'후보 탈락: 실제 투명 배경이 없습니다');
  console.log('PASS candidate alpha only; anatomy/frames/weapon review still required');
}else{
  assert.deepEqual(JSON.parse(fs.readFileSync(root+'/src/operators/manifest.json')),JSON.parse(fs.readFileSync(root+'/public/operators/manifest.json')));
  const rows=OPERATORS.map(operator=>{
    const visual=operatorVisual(operator.callSign);assert(visual,operator.callSign);
    const sprite=checkSprite(visual);
    if(visual.portrait)assert(fs.statSync(root+'/public/operators/'+visual.portrait).size>0);
    assert.equal(operatorPoseVisual(operator.callSign,false),visual);
    if(operator.callSign!=='COLLIER')assert.equal(operatorPoseVisual(operator.callSign,true),visual,'다른 인물의 다운 원화를 빌려 쓰지 않습니다');
    const before=muzzlePosition(operator.firearms[0],{x:100,y:200},.73);
    operatorPoseVisual(operator.callSign,true);
    assert.deepEqual(muzzlePosition(operator.firearms[0],{x:100,y:200},.73),before,'표현 변경이 발사 원점을 바꾸면 안 됩니다');
    return {callSign:operator.callSign,weapon:operator.firearms[0],sprite,animationPackComplete:false};
  });
  const downed=checkSprite(operatorPoseVisual('COLLIER',true));
  assert.notEqual(downed.file,operatorVisual('COLLIER').sprite);
  const crawl=Array.from({length:4},(_,index)=>operatorPoseVisual('COLLIER',true,index*.25));
  assert.equal(new Set(crawl.map(frame=>JSON.stringify(frame.region))).size,4,'서로 다른 네 프레임 필요');
  assert(crawl.every(frame=>frame.sprite===crawl[0].sprite),'한 행동은 한 시트에서 읽어야 합니다');
  for(const frame of crawl){checkSprite(frame);assert.deepEqual(frame.pivot,crawl[0].pivot);assert.equal(frame.scale,crawl[0].scale);}
  assert.deepEqual(operatorPoseVisual('COLLIER',true,1),crawl[0],'경기 시각으로 반복');
  assert.equal(operatorPoseVisual('COLLIER',true),operatorPoseVisual('COLLIER',true,NaN),'정지 및 잘못된 시각은 정지 원화');
  assert.equal(operatorPoseVisual('COLLIER',false,.5),operatorVisual('COLLIER'),'다운 전에는 다운 이동 금지');
  assert.equal(operatorPoseVisual('MAGPIE',true,.5),operatorVisual('MAGPIE'),'다른 오퍼레이터 몸 복제 금지');
  const walks=OPERATORS.flatMap(operator=>['walk','crouch'].map(action=>{
    const visual=operatorWalkVisual(operator.callSign,action==='crouch');assert(visual,operator.callSign+': 이동 시트 필요');
    const record=JSON.parse(fs.readFileSync(root+'/src/operators/'+visual.sprite.replace('.webp','.json')));
    assert.equal(record.action,action);assert.equal(record.frames.length,4);assert.equal(record.processing.upscaled,false);
    assert(record.source.frames.every(frame=>Math.max(...frame.subjectSize)>=512),'원본 인물 장축 512px 이상');
    assert.equal(new Set(record.frames.map(frame=>JSON.stringify(frame.pivot))).size,1);
    assert.equal(new Set(record.frames.map(frame=>frame.scale)).size,1);
    const lengths=record.frames.map(frame=>Math.hypot(frame.muzzle[0]-frame.pivot[0],frame.muzzle[1]-frame.pivot[1]));
    assert(Math.max(...lengths)/Math.min(...lengths)<1.06,'프레임별 총열 길이·원점 변화 검토 필요: '+operator.callSign);
    for(const frame of record.frames)checkSprite(frame);
    return {callSign:operator.callSign,action,sprite:visual.sprite,frames:record.frames.length,sourceSizes:record.source.frames.map(frame=>frame.subjectSize),bytes:record.processing.bytes};
  }));
  const report={kind:'Asset contracts and alpha only; not anatomy, firearm authenticity, animation or browser-play approval',operators:rows,downed,crawlFrames:crawl.length,crawlSprite:crawl[0].sprite,walks,operatorCount:rows.length,completeAnimationPacks:0};
  fs.writeFileSync(path.resolve(__dirname,'../validation/operator-sprite-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS ${rows.length} operator asset contracts + ${walks.length} four-frame movement sheets + COLLIER downed/crawl; complete animation packs: 0`);
}
