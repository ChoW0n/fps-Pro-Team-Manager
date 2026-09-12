// Web Audio 배선·재생 수명 검증입니다. 브라우저 청음 검사를 대신하지 않습니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const nodes=[],sources=[],storage=new Map();
global.localStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
function node(kind){const n={kind,connect(next){this.next=next;return next},disconnect(){this.disconnected=true}};nodes.push(n);return n;}
let context;
global.AudioContext=class {
 constructor(){context=this;this.state='suspended';this.currentTime=0;this.sampleRate=44100;this.destination=node('destination');}
 resume(){this.state='running';return Promise.resolve();}
 createDynamicsCompressor(){return Object.assign(node('compressor'),{threshold:{},ratio:{},attack:{},release:{}});}
 createBuffer(_,length,sampleRate){const samples=new Float32Array(length);return {length,sampleRate,getChannelData:()=>samples};}
 createBufferSource(){const s=Object.assign(node('source'),{start(time){this.started=time;sources.push(this);},stop(){assert(!this.stopped);this.stopped=true;this.onended?.();}});return s;}
 createBiquadFilter(){return Object.assign(node('filter'),{frequency:{},Q:{}});}
 createGain(){return Object.assign(node('gain'),{gain:{}});}
 createStereoPanner(){return Object.assign(node('pan'),{pan:{}});}
 createOscillator(){throw new Error('총성에 음높이 oscillator를 사용하면 안 됩니다.');}
};
const a=require('../artifacts/draft-order-player-generator/src/components/matchAudio.ts');
const shot={type:'shot',time:1,message:'',actor:'operator-1'};
a.playMatchAudio(shot,'HK416');assert.equal(sources.length,0,'사용자 제스처 이전 무음');
a.unlockMatchAudio();
const weapons=['MP5SD','AS Val 소음소총','FN P90','HK416','HK417','C14 팀버울프'];
for(const weapon of weapons)a.playMatchAudio(shot,weapon,2,2,.4);
assert.equal(sources.length,6);assert(a.firearmAudioProfile('MP5SD').suppressed);assert(a.firearmAudioProfile('AS Val').suppressed);assert(!a.firearmAudioProfile('FN P90').suppressed);
assert.equal(a.firearmAudioProfile('FN P90').caliber,'5.7×28');
for(const source of sources){
 const data=source.buffer.getChannelData(0);assert(data.some(x=>x!==0));assert(data.every(Number.isFinite));
 assert.equal(source.started,.15,'예약 지연 상한');assert.equal(source.next.next.next.pan.value,1,'좌우 패닝 상한');
}
assert.notDeepEqual(sources[0].buffer.getChannelData(0),sources[3].buffer.getChannelData(0));
a.setMatchAudioMuted(true);assert(a.isMatchAudioMuted());assert.equal(storage.get('draft-order-audio-muted'),'true');
assert(sources.every(s=>s.stopped&&s.disconnected),'음소거에서 예약음도 종료');
a.playMatchAudio(shot,'HK416');assert.equal(sources.length,6);
a.setMatchAudioMuted(false);context.currentTime=1;
const step={type:'sound',time:2,message:'발소리',actor:'one'};
a.playMatchAudio(step);a.playMatchAudio(step);assert.equal(sources.length,7,'같은 선수의 매 틱 발소리를 중복 재생하지 않음');
for(const actor of ['two','three','four'])a.playMatchAudio({...step,actor});assert.equal(sources.length,9,'발소리 동시 3개 제한');
a.stopMatchAudio();context.currentTime=2;
for(let i=0;i<20;i++)a.playMatchAudio({...shot,time:i},'HK416');assert.equal(sources.length,21,'전체 동시 12개 제한');
a.stopMatchAudio();a.stopMatchAudio();assert(sources.every(s=>s.stopped),'정지 반복 호출 안전');
const before=sources.length;
for(const goal of ['plant-started','disable-started','planted'])a.playMatchAudio({type:'objective',time:2,goal,message:''});
assert.equal(sources.length,before+3,'실제 설치·해체 사건명 연결');
a.stopMatchAudio();context.state='suspended';a.playMatchAudio(shot,'HK416');assert.equal(sources.length,before+3);
// 저장소 제한이나 오디오 잠금 실패가 경기 시작 버튼을 깨뜨리지 않습니다.
global.localStorage.setItem=()=>{throw Error('blocked')};assert.doesNotThrow(()=>a.setMatchAudioMuted(false));
context.resume=()=>Promise.reject(Error('blocked'));assert.doesNotThrow(()=>a.unlockMatchAudio());
fs.writeFileSync('validation/match-audio.json',JSON.stringify({weaponProfiles:6,footstepVoiceLimit:3,totalVoiceLimit:12,checks:['gesture gate','buffer data','no oscillator','pan/delay clamp','mute persistence','stop scheduled audio','footstep cadence','polyphony limit','actual objective event names','storage/resume rejection'],browserListening:false},null,2)+'\n');
console.log('PASS 오디오 6종·사용자 제스처·음소거·예약 취소·발소리 3개·전체 12개·설치 사건');
