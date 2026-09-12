import type { RealtimeEvent } from '../domain/realtime/TacticalRealtimeSimulation';
import { weaponHandling } from '../domain/realtime/weaponHandling';

let context:AudioContext|undefined;
let bus:DynamicsCompressorNode|undefined;
const buffers=new Map<string,AudioBuffer>();

export function unlockMatchAudio():void {
  context??=new AudioContext();
  if(!bus){bus=context.createDynamicsCompressor();bus.threshold.value=-18;bus.ratio.value=6;bus.attack.value=.002;bus.release.value=.12;bus.connect(context.destination);}
  void context.resume();
}

/** Existing weapon data drives an interim designed sound, not a firearm recording. */
export function firearmAudioProfile(name:string){
  const weapon=weaponHandling(name),suppressed=/MP5SD|AS Val/.test(name);
  const heavy=weapon.family==='marksman'||weapon.family==='bolt';
  return {caliber:weapon.caliber,suppressed,cutoff:suppressed?2100:weapon.caliber==='5.7×28'?8500:heavy?6200:7200,
    decay:suppressed?.065:heavy?.23:weapon.family==='smg'?.1:.15,gain:suppressed?.19:heavy?.48:.34};
}

/** Broadband pressure transient and mechanical tail; no pitched oscillator or pitch sweep. */
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
  if(!context||context.state!=='running'||!bus)return;
  const kind=event.type==='shot'?'shot':event.type==='impact'?'impact':event.goal?.includes('deployed')?'deploy':event.goal==='grenade-exploded'||event.goal==='wall-breached'?'blast':'';
  if(!kind)return;
  const profile=firearmAudioProfile(weaponName);
  const decay=kind==='shot'?profile.decay:kind==='blast'?.26:kind==='deploy'?.024:.014;
  const volume=(kind==='shot'?profile.gain:kind==='blast'?.48:kind==='deploy'?.07:.055)*Math.max(0,Math.min(1,attenuation));
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),panner=context.createStereoPanner();
  const variant=Math.abs(Math.round(event.time*1000))%4;
  source.buffer=transient(`${kind}:${weaponName}:${variant}`,decay,kind==='shot'||kind==='deploy');
  filter.type='lowpass';filter.frequency.value=kind==='shot'?profile.cutoff:kind==='blast'?1600:5000;filter.Q.value=.5;
  gain.gain.value=volume;panner.pan.value=Math.max(-1,Math.min(1,pan));
  source.connect(filter).connect(gain).connect(panner).connect(bus);
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};
  source.start(context.currentTime+Math.max(0,Math.min(.15,delay)));
}
