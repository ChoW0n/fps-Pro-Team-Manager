import type { RealtimeTick, TacticalRealtimeResult, TacticalRealtimeSession } from './TacticalRealtimeSimulation';

/** 각 틱을 독립된 화면 갱신으로 전달하며 배속·일시정지는 엔진의 사건 순서를 바꾸지 않습니다. */
export function startRoundPlayback(
  session: TacticalRealtimeSession,
  controls: () => { paused: boolean; speed: number },
  onTick: (tick: RealtimeTick) => void,
  onComplete: (result: TacticalRealtimeResult) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  /** 늦어진 타이머를 따라잡으려고 여러 틱을 한 프레임에 몰아넣지 않습니다. */
  function advance(): void {
    if (cancelled) return;
    const { paused, speed } = controls();
    if (!paused) {
      const tick = session.step();
      if (tick) onTick(tick);
      if (session.isComplete) {
        const result = session.getResult();
        if (result) onComplete(result);
        return;
      }
    }
    timer = setTimeout(advance, 100 / Math.max(1, Math.min(4, speed)));
  }
  advance();
  return () => { cancelled = true; clearTimeout(timer); };
}
