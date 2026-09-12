// 벽 끝의 양옆 광선이 실제 차폐 영역에 시야 면을 흘리지 않는지 검사합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {visionPolygon}=require('../artifacts/draft-order-player-generator/src/domain/realtime/spectatorView.ts');
const map={walls:[{kind:'hard',from:{x:100,y:20},to:{x:100,y:70}}],covers:[]};
const polygon=visionPolygon({position:{x:0,y:0},facing:0},map).split(' ').map(p=>p.split(',').map(Number));
/** 표시 다각형 안쪽 여부를 독립적으로 계산합니다. */
function inside(x,y){let found=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])found=!found;}return found;}
let blocked=0;
for(let x=110;x<900;x+=7)for(let y=1;y<500;y+=7){const crossing=y*100/x;if(crossing>20.1&&crossing<69.9){blocked++;assert(!inside(x,y),`벽 뒤 시야 누출 ${x},${y}`);}}
assert(blocked>1000);assert(inside(150,10),'열린 쪽 시야 유지');
console.log('PASS 벽 모서리 차폐 표본 '+blocked+'개');
