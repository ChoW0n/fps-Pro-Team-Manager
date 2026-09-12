// 실제 엔진 설치 기록을 중계의 지도 렌더러로 그립니다. 브라우저 화면은 아닙니다.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/draft-order-player-generator/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const {createCanvas}=require('@napi-rs/canvas');
const root='../artifacts/draft-order-player-generator/src/';
const {paintBattleMap}=require(root+'components/BroadcastCanvas.tsx');
const {NAMSAN_MAP:base}=require(root+'domain/tacticalMaps.ts');
const {battlefieldMap}=require(root+'domain/realtime/fortifications.ts');
const scenes=require('../validation/fortification-scenes.json');
const canvas=createCanvas(1200,760),context=canvas.getContext('2d');
context.fillStyle='#0e1113';context.fillRect(0,0,1200,760);
for(const [index,name] of ['reinforce','shield'].entries()){
  const snapshot=scenes[name];assert(snapshot?.fortifications?.length);
  const map=battlefieldMap(base,snapshot.breaches,snapshot.fortifications),item=snapshot.fortifications[0];
  const wall=map.walls.find(wall=>wall.id===item.wallId);
  const focus=item.cover?{x:item.cover.rect.x,y:item.cover.rect.y}:{x:(wall.from.x+wall.to.x)/2,y:(wall.from.y+wall.to.y)/2};
  context.save();context.beginPath();context.rect(index*600,0,600,760);context.clip();
  context.translate(index*600+300-focus.x*1.5,380-focus.y*1.5);context.scale(1.5,1.5);paintBattleMap(context,map);context.restore();
  context.fillStyle='#d6dce0';context.font='24px sans-serif';context.fillText(name.toUpperCase()+' / '+snapshot.time+'s',index*600+24,45);
}
fs.writeFileSync(path.resolve(__dirname,'../validation/fortification-render.png'),canvas.toBuffer('image/png'));
console.log('PASS 실제 보강·설치형 방패의 공통 지도 렌더');
