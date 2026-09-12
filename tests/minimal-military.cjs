// 실제 파츠 합성기로 12명·3방향 및 상태 변화를 확인합니다. 브라우저 검사는 아닙니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const app=path.resolve(__dirname,'../artifacts/draft-order-player-generator');
const {paintMinimalOperator,operatorDirection,weaponSilhouette}=require(app+'/src/components/minimalOperator.ts');
const {OPERATORS}=require(app+'/src/domain/Operator.ts');
(async()=>{
 const images=new Map();let bytes=0;
 for(const file of fs.readdirSync(app+'/public/operators').filter(file=>file.startsWith('minimal-'))){const data=fs.readFileSync(app+'/public/operators/'+file);bytes+=data.length;const image=await loadImage(data);assert.equal(image.width,128);assert.equal(image.height,128);images.set(file,image);}
 assert.equal(images.size,9);assert(bytes<250000);
 const asset=file=>{assert(images.has(file),file);return images.get(file);};
 const canvas=createCanvas(960,840),ctx=canvas.getContext('2d');ctx.fillStyle='#263237';ctx.fillRect(0,0,960,840);
 let draws=0;
 for(const [index,operator] of OPERATORS.entries()){
  const x=(index%4)*240,y=Math.floor(index/4)*280;
  ctx.fillStyle='#D6DCE0';ctx.font='bold 15px sans-serif';ctx.fillText(operator.callSign,x+14,y+24);ctx.font='12px sans-serif';ctx.fillText(operator.firearms[0],x+14,y+45);
  for(const [i,facing] of [Math.PI/2,-Math.PI/2,0].entries()){
   const unit={id:String(index),callSign:operator.callSign,side:operator.side,weaponName:operator.firearms[0],position:{x:0,y:0},velocity:{x:0,y:0},facing,alive:true,action:'hold'};
   ctx.save();ctx.translate(x+40+i*78,y+155);ctx.scale(1.7,1.7);assert(paintMinimalOperator(ctx,unit,1,undefined,asset));ctx.restore();draws++;
  }
 }
 assert.equal(operatorDirection(-Math.PI/2).view,'back');assert.equal(operatorDirection(Math.PI/2).view,'front');assert.equal(operatorDirection(Math.PI).mirror,-1);
 assert.equal(weaponSilhouette('타보르 X95'),'bullpup');assert.equal(weaponSilhouette('FN P90'),'p90');assert.equal(weaponSilhouette('C14'),'bolt');
 // 같은 경기 상태는 같은 픽셀이며 이동과 다운은 다른 모습입니다.
 const sample={id:'sample',callSign:'MAGPIE',side:'공격',weaponName:'L119A2',position:{x:64,y:72},velocity:{x:0,y:0},facing:0,alive:true,action:'hold'};
 const render=(time,changes={},shotAt)=>{const c=createCanvas(128,128);paintMinimalOperator(c.getContext('2d'),{...sample,...changes},time,shotAt,asset);return c.toBuffer('image/png');};
 assert.deepEqual(render(1),render(1));assert.notDeepEqual(render(1),render(1,{velocity:{x:10,y:0}}));assert.notDeepEqual(render(1),render(1,{downed:{mode:'stabilize'}}));assert.deepEqual(render(1),render(1,{},1));assert.notDeepEqual(render(1.07),render(1.07,{},1));
 // 무기와 자세를 고정해도 열두 군장의 실제 합성 결과가 각각 달라야 합니다.
 for(const facing of [Math.PI/2,-Math.PI/2,0])assert.equal(new Set(OPERATORS.map(operator=>render(1,{callSign:operator.callSign,facing}).toString('base64'))).size,12);
 fs.writeFileSync('validation/minimal-military-roster.png',canvas.toBuffer('image/png'));
 fs.writeFileSync('validation/minimal-military.json',JSON.stringify({parts:9,bytes,operators:12,directions:3,actualComposites:draws,checks:'asset dimensions, all compositions, deterministic state, movement/down state, event-bound recoil, twelve distinct kit compositions per view',limits:'Twelve individual primary weapon profiles and angular vector bodies; legacy PNG assets archived; not authenticated gear sets or browser play'},null,2)+'\n');
 console.log('PASS 9 parts, 36 real compositions, state/recoil contracts',bytes,'bytes');
})().catch(error=>{console.error(error);process.exitCode=1;});
