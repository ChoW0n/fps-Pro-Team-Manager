import { TacticalRealtimeSimulation } from './TacticalRealtimeSimulation';
import { startRoundPlayback } from './roundPlayback';

const controls = { paused: false, speed: 2 };
let stop: (() => void) | undefined;
/** 경기 계산은 워커에서 실행하고 화면에는 같은 엔진의 틱과 종료 결과만 전달합니다. */
self.onmessage = event => {
  const message = event.data;
  if (message.type === 'controls') { Object.assign(controls, message.controls); return; }
  if (message.type === 'start') {
    stop?.(); Object.assign(controls, message.controls);
    try {
      const session = new TacticalRealtimeSimulation(message.map).createSession(message.input);
      stop = startRoundPlayback(session, () => controls,
        tick => self.postMessage({ type: 'tick', tick }),
        result => self.postMessage({ type: 'complete', result }));
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  }
};
