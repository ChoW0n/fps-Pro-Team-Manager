import type { RealtimeEvent } from '../domain/realtime/TacticalRealtimeSimulation';
import { weaponHandling } from '../domain/realtime/weaponHandling';

let context:AudioContext|undefined;
let bus:DynamicsCompressorNode|undefined;
let muted=false;
try{muted=localStorage.getItem('draft-order-audio-muted')==='true';}catch{/* 저장 차단 브라우저에서도 현재 경기 설정은 사용할 수 있습니다. */}
const playing=new Map<AudioBufferSourceNode,string>();
const lastStep=new Map<string,number>();

export function isMatchAudioMuted():boolean{return muted;}
/** 이미 예약된 소리와 잔향도 끊어 정지·배속·화면 이탈 뒤에 총성이 남지 않게 합니다. */
export function stopMatchAudio():void {
  for(const source of playing.keys())source.stop();
  playing.clear();lastStep.clear();
}
export function setMatchAudioMuted(value:boolean):void {
  muted=value;if(value)stopMatchAudio();
  try{localStorage.setItem('draft-order-audio-muted',String(value));}catch{/* 음소거는 저장 성공 여부와 무관하게 즉시 적용합니다. */}
}
const buffers=new Map<string,AudioBuffer>();

export function unlockMatchAudio():void {
  if(typeof AudioContext==='undefined')return;
  try{context??=new AudioContext();}catch{return;}
  if(!bus){bus=context.createDynamicsCompressor();bus.threshold.value=-18;bus.ratio.value=6;bus.attack.value=.002;bus.release.value=.12;bus.connect(context.destination);}
  void context.resume().catch(()=>undefined);
}

/** 탄종과 무기군에 맞춘 임시 합성음입니다. 실총 녹음의 고증을 대신하지 않습니다. */
export function firearmAudioProfile(name:string){
  const weapon=weaponHandling(name),suppressed=/MP5SD|AS Val/.test(name);
  const heavy=weapon.family==='marksman'||weapon.family==='bolt';
  return {caliber:weapon.caliber,suppressed,cutoff:suppressed?2100:weapon.caliber==='5.7×28'?8500:heavy?6200:7200,
    decay:suppressed?.065:heavy?.23:weapon.family==='smg'?.1:.15,gain:suppressed?.19:heavy?.48:.34};
}

/** 음높이가 움직이는 전자음 대신 짧은 광대역 압력음과 기계음을 합성합니다. */
function transient(key:string,decay:number,mechanical=false):AudioBuffer {
  const cached=buffers.get(key);if(cached)return cached;
  const audio=context!,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*(decay*4+.04)),audio.sampleRate),data=buffer.getChannelData(0);
  let seed=2166136261;for(const char of key)seed=Math.imul(seed^char.charCodeAt(0),16777619);
  let low=0;
  for(let i=0;i<data.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1,t=i/audio.sampleRate;low+=.085*(noise-low);
    const attack=Math.min(1,t/.0007),body=Math.exp(-t/decay);
    const click=t>.021?Math.exp(-(t-.021)/.005)*noise*.3:0;
    data[i]=attack*((noise*.64+low*.36)*body+ (mechanical?click:0));
  }
  buffers.set(key,buffer);return buffer;
}

export function playMatchAudio(event:RealtimeEvent,weaponName='',pan=0,attenuation=1,delay=0):void {
  if(muted||!context||context.state!=='running'||!bus)return;
  const kind=event.type==='shot'?'shot':event.type==='sound'&&event.message==='발소리'?'footstep':event.type==='impact'?'impact':event.goal?.includes('deployed')||event.type==='reload'||event.type==='objective'&&['plant-started','disable-started','planted'].includes(event.goal??'')?'deploy':event.goal==='grenade-exploded'||event.goal==='wall-breached'?'blast':'';
  if(!kind)return;
  const steps=[...playing.values()].filter(value=>value==='footstep').length;
  // 엔진의 0.1초 소리 표본을 실제 발 디딤 간격으로 묶습니다. 적의 새 위치는 생성하지 않습니다.
  if(kind==='footstep'&&(steps>=3||context.currentTime-(lastStep.get(event.actor??'')??-1)<.32))return;
  if(playing.size>=12)return;
  if(kind==='footstep')lastStep.set(event.actor??'',context.currentTime);
  const profile=firearmAudioProfile(weaponName);
  const decay=kind==='footstep'?.028:kind==='shot'?profile.decay:kind==='blast'?.26:kind==='deploy'?.024:.014;
  const volume=(kind==='footstep'?([...playing.values()].includes('shot')?.025:.065):kind==='shot'?profile.gain:kind==='blast'?.48:kind==='deploy'?.07:.055)*Math.max(0,Math.min(1,attenuation));
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),panner=context.createStereoPanner();
  const variant=Math.abs(Math.round(event.time*1000))%4;
  source.buffer=transient(`${kind}:${kind==='shot'?weaponName:''}:${variant}`,decay,kind==='shot'||kind==='deploy');
  filter.type='lowpass';filter.frequency.value=kind==='shot'?profile.cutoff:kind==='footstep'?750:kind==='blast'?1600:5000;filter.Q.value=.5;
  gain.gain.value=volume;panner.pan.value=Math.max(-1,Math.min(1,pan));
  source.connect(filter).connect(gain).connect(panner).connect(bus);
  playing.set(source,kind);
  source.onended=()=>{playing.delete(source);source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};
  source.start(context.currentTime+Math.max(0,Math.min(.15,delay)));
}
