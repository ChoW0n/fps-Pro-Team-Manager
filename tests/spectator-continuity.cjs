// 실제 카메라 함수의 전환·개인 정보 경계를 검사합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {combatCamera,rememberContacts}=require('../artifacts/draft-order-player-generator/src/domain/realtime/spectatorView.ts');
/** 관전 판단에 필요한 실제 상태 필드만 구성합니다. */
function unit(id,x,alive=true){return {id,position:{x,y:400},side:'공격',alive,action:'hold',knowledge:{confidence:0}};}
const idle=unit('idle',100),fighter=unit('fighter',800),enemy={...unit('enemy',1100),side:'수비'};
const shot={type:'shot',actor:'fighter',target:'enemy',time:2,position:{x:800,y:400}};
assert.equal(combatCamera([idle,fighter,enemy],[shot],'공격',2,'idle',false,'idle').focusId,'fighter');
assert.equal(combatCamera([idle,fighter,enemy],[shot],'공격',2,'idle',true,'idle').focusId,'idle');
assert.equal(combatCamera([idle,fighter,enemy],[shot],'공격',1,'idle',false,'idle').focusId,'idle');
assert.equal(combatCamera([idle,{...fighter,alive:false},enemy],[shot],'공격',2.1,'idle',false,'fighter').focusId,'fighter');
const aim={...fighter,action:'aim',knowledge:{source:'self-visual',lastKnownAt:2,lastKnownPosition:{x:1300,y:400}}};
assert.equal(combatCamera([idle,aim],[],'공격',2,'idle',false,'idle').focusId,'fighter');
assert.equal(combatCamera([idle,aim],[],'공격',2,'idle',false,'idle').x,1050);
assert.equal(combatCamera([{...fighter,alive:false}],[],'공격',8,'fighter',true).focusId,'fighter');
const contacts=new Map();
rememberContacts(contacts,[enemy],2,2);
enemy.position.x=9999;
rememberContacts(contacts,[],2.5,2.5);
assert.equal(contacts.get('enemy').position.x,1100);
assert.equal(contacts.get('enemy').seenAt,2);
rememberContacts(contacts,[],3.1,3.1);
assert.equal(contacts.size,0);
console.log('PASS 10 spectator continuity checks');
