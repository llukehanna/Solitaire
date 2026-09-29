export interface Timer {
  accumulatedMs: number;
  runningSince: number | null;
}

export const newTimer = (): Timer => ({ accumulatedMs: 0, runningSince: null });

export const startTimer = (t: Timer, now: number): Timer => (t.runningSince !== null ? t : { ...t, runningSince: now });

export const pauseTimer = (t: Timer, now: number): Timer =>
  t.runningSince === null ? t : { accumulatedMs: t.accumulatedMs + (now - t.runningSince), runningSince: null };

export const elapsed = (t: Timer, now: number): number =>
  t.accumulatedMs + (t.runningSince === null ? 0 : now - t.runningSince);
