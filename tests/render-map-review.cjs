// 게임에서 사용하는 지도 렌더러의 정적 출력입니다. 브라우저 플레이 캡처가 아닙니다.
const fs=require('node:fs'),ts=require('typescript');
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8').replaceAll('import.meta.env.BASE_URL',"'/'"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
if(process.env.REVIEW_FONT)GlobalFonts.registerFromPath(process.env.REVIEW_FONT,'sans-serif');
const {paintBattleMap}=require('../artifacts/draft-order-player-generator/src/components/BroadcastCanvas.tsx');
const {NAMSAN_MAP,layer}=require('../artifacts/draft-order-player-generator/src/domain/tacticalMaps.ts');
const floor=Number(process.argv[2]??0),map=layer(NAMSAN_MAP,floor);
const canvas=createCanvas(1500,1100),ctx=canvas.getContext('2d');ctx.fillStyle='#172225';ctx.fillRect(0,0,1500,1100);
ctx.save();ctx.beginPath();ctx.rect(20,100,1020,970);ctx.clip();ctx.translate(30-930*.96,110-940*.96);ctx.scale(.96,.96);paintBattleMap(ctx,map);ctx.restore();
ctx.fillStyle='#eee9d7';ctx.font='bold 34px sans-serif';ctx.fillText(`남산 중계관 / ${floor+1}F`,32,56);ctx.font='18px sans-serif';ctx.fillStyle='#b8c9c3';ctx.fillText('실제 지도 렌더러 · 가상 시설 · 40단위 = 1m',35,85);
ctx.save();ctx.translate(1060,110);ctx.scale(.14,.14);paintBattleMap(ctx,map);ctx.fillStyle='#FFD66C';for(const route of map.attackerRoutes.slice(0,5)){const p=route.points[0];if(!p)continue;ctx.beginPath();ctx.arc(p.x,p.y,38,0,Math.PI*2);ctx.fill();}ctx.restore();
ctx.fillStyle='#eee9d7';ctx.font='bold 24px sans-serif';ctx.fillText('관광 · 방송 · 설비',1070,590);ctx.font='18px sans-serif';
for(const [i,line] of ['실내 576㎡ · 방 16개',floor?'전망 · 송신 · 방송 편집':'A  송출 / 관제',floor?'서계단 ↔ 동계단':'B  전원 / 배전',floor?'송출·배전 해치 → 1층':'외부 진입 5개 · 저상 2개','표본 최장 사선 24.1m','팀 보강 자원 6개'].entries())ctx.fillText(line,1070,640+i*42);
fs.writeFileSync(`validation/namsan-map-${floor+1}f.png`,canvas.toBuffer('image/png'));console.log('PASS 공통 지도 렌더');
