import type { RealtimeEvent } from '../domain/realtime/TacticalRealtimeSimulation';

let context:AudioContext|undefined;

/** 작전 시작 클릭에서만 오디오를 열어 브라우저 자동재생 정책을 지킵니다. */
export function unlockMatchAudio():void {
  context??=new AudioContext();
  void context.resume();
}

/** 샘플 파일 없이도 발사·피격·장비 설치의 구분이 들리는 짧은 중계 신호를 만듭니다. */
export function playMatchAudio(event:RealtimeEvent):void {
  if(!context||context.state!=='running')return;
  const now=context.currentTime,kind=event.type==='shot'?'shot':event.type==='impact'?'impact':event.goal?.includes('deployed')?'deploy':event.goal==='grenade-exploded'||event.goal==='wall-breached'?'blast':'';
  if(!kind)return;
  const oscillator=context.createOscillator(),gain=context.createGain();
  const config={shot:[150,.035,'square'] as const,impact:[260,.055,'triangle'] as const,deploy:[620,.11,'sine'] as const,blast:[72,.18,'sawtooth'] as const}[kind];
  oscillator.type=config[2];oscillator.frequency.setValueAtTime(config[0],now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,config[0]*.58),now+config[1]);
  gain.gain.setValueAtTime(kind==='blast'?.09:.035,now);gain.gain.exponentialRampToValueAtTime(.001,now+config[1]);
  oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+config[1]);
}
