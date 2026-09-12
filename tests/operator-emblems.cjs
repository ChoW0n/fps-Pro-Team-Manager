// 생성 PNG 연결과 미확인 상대의 신원 비공개를 실제 React 출력에서 검사합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
require.extensions['.ts']=compile;require.extensions['.tsx']=compile;
const React=require('../artifacts/draft-order-player-generator/node_modules/react'),{renderToStaticMarkup}=require('../artifacts/draft-order-player-generator/node_modules/react-dom/server');
const {OperatorEmblem,EMBLEM_GENERATIONS}=require('../artifacts/draft-order-player-generator/src/components/OperatorEmblem.tsx');
const crops=new Set();
for(const [row,group] of EMBLEM_GENERATIONS.entries())for(const callSign of group){const html=renderToStaticMarkup(React.createElement(OperatorEmblem,{callSign}));assert(html.includes('generations-v1.png'));assert(html.includes(`data-generation="${row+1}"`));crops.add(html.match(/viewBox="([^"]+)"/)[1]);}
assert.equal(crops.size,12);
const unknown=renderToStaticMarkup(React.createElement(OperatorEmblem,{callSign:'MEDVED',unknown:true}));assert(!unknown.includes('MEDVED'));assert(!unknown.includes('<image'));
console.log('PASS 고유 엠블럼 12칸 · 세대 3그룹 · 미확인 신원 비공개');
