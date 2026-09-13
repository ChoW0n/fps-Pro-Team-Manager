// 브라우저 없이 실제 준비 컴포넌트의 입력 이벤트와 onStart 전달을 실행합니다.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=require.extensions['.tsx']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
require.extensions['.css']=()=>{};
const originalLoad=Module._load;
Module._load=function(name,parent,...args){if(parent?.filename.endsWith('/OperatorPreparation.tsx')){if(name==='./matchAudio')return {unlockMatchAudio(){}};if(name==='./TacticalBattlefield')return {TacticalBattlefield:()=>null};}return originalLoad.call(this,name,parent,...args);};
const app='../artifacts/draft-order-player-generator/',React=require(app+'node_modules/react');
const {OPERATORS}=require(app+'src/domain/Operator.ts'),{Player}=require(app+'src/domain/Player.ts');
const team={name:'test',players:OPERATORS.filter(o=>o.side==='수비').slice(0,5).map((o,i)=>new Player('p'+i,'p'+i,o.role,20,75,75,75,75,75,OPERATORS,20,75,65,70,70,70,70))};
const states=[];let cursor=0;
React.useState=initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];};
React.useMemo=fn=>fn();
const {OperatorPreparation}=require(app+'src/components/OperatorPreparation.tsx');
let submitted;const render=()=>{cursor=0;return OperatorPreparation({homeTeam:team,awayTeam:team,homeSide:'수비',onStart:input=>{submitted=input;},onBack(){}});};
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const tree=nodes(render());assert(!tree.some(n=>n.type==='input'&&n.props.type==='checkbox'),'주무장 방패 허용 옵션 없음');
tree.find(n=>n.type==='button'&&n.props.className==='op-prep-start').props.onClick();assert(!('shieldRequiresSecondary' in submitted));
console.log('PASS fixed secondary shield rule; no toggle; no browser');
