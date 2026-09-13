const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8').replaceAll('import.meta.env.BASE_URL',JSON.stringify('/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const active=[],storage=new Map();let ctx;
const node=()=>({connect(n){return n},disconnect(){}});
global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
global.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
global.AudioContext=class {constructor(){ctx=this;this.state='suspended';this.currentTime=0;this.sampleRate=44100;this.destination=node()}resume(){this.state='running';return Promise.resolve()}decodeAudioData(){return Promise.resolve({sample:true})}createDynamicsCompressor(){return Object.assign(node(),{threshold:{},ratio:{},attack:{},release:{}})}createBuffer(_,n){const a=new Float32Array(n);return {getChannelData:()=>a}}createBufferSource(){const s=Object.assign(node(),{start(){active.push(s)},stop(){this.stopped=true;this.onended?.()}});return s}createBiquadFilter(){return Object.assign(node(),{frequency:{},Q:{}})}createGain(){return Object.assign(node(),{gain:{}})}createStereoPanner(){return Object.assign(node(),{pan:{}})}};
const audio=require('../artifacts/draft-order-player-generator/src/components/matchAudio.ts'),shot={type:'shot',time:1,message:'',actor:'qa'};
audio.unlockMatchAudio();
(async()=>{await audio.loadMatchSamples();ctx.state='running';
  for(const name of ['글록 17','글록 19','SIG P226','K5 권총','HK USP','베레타 92FS','MR73 리볼버','SR-1 베크토르']){audio.playMatchAudio(shot,name);assert(active.at(-1).buffer.getChannelData,name+' must use synthesis, not a decoded SMG sample');audio.stopMatchAudio()}
  for(let i=0;i<12;i++)audio.playMatchAudio({type:'reload',time:i,message:''});
  const oldest=active.at(-12);audio.playMatchAudio(shot,'HK416');assert(oldest.stopped,'shot preempts a lower-priority voice');
  const count=active.length;audio.playMatchAudio({type:'sound',message:'발소리',time:20,actor:'late'});assert.equal(active.length,count,'footstep cannot preempt a shot');
  console.log('PASS sidearm sample isolation and priority admission');
})().catch(error=>{console.error(error);process.exitCode=1});
