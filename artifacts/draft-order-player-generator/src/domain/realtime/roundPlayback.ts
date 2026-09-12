import type { TacticalDirectorCommand, RealtimeTick, TacticalRealtimeResult, TacticalRealtimeSession } from './TacticalRealtimeSimulation';

/** 각 틱을 독립된 화면 갱신으로 전달하며 배속·일시정지는 엔진의 사건 순서를 바꾸지 않습니다. */
export function startRoundPlayback(
  session: TacticalRealtimeSession,
  controls: () => { paused: boolean; speed: number },
  onTick: (tick: RealtimeTick) => void,
  onComplete: (result: TacticalRealtimeResult) => void,
  nextCommand: () => TacticalDirectorCommand | undefined = () => undefined,
): () => void {
  let cancelled = false, started = false;
  let timer: ReturnType<typeof setTimeout>;
  /** 늦어진 타이머를 따라잡으려고 여러 틱을 한 프레임에 몰아넣지 않습니다. */
  function advance(): void {
    if (cancelled) return;
    const { paused, speed } = controls();
    if (!paused) {
      // 정지 중에는 지시를 소비하지 않고 다음 실제 틱에 한 건씩 전달합니다.
      // 생성기의 첫 next 인자는 무시되므로 최초 스냅샷 뒤부터 지시를 전달합니다.
      const tick = session.step(started ? nextCommand() : undefined);
      started = true;
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
