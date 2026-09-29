import { describe, it, expect } from 'vitest';
import { elapsed, newTimer, pauseTimer, startTimer } from '../../src/game/timer';

describe('timer', () => {
  it('accumulates only while running', () => {
    let t = newTimer();
    expect(elapsed(t, 1000)).toBe(0);
    t = startTimer(t, 1000);
    expect(elapsed(t, 4000)).toBe(3000);
    t = pauseTimer(t, 5000);
    expect(elapsed(t, 9000)).toBe(4000);
    t = startTimer(t, 10_000);
    expect(elapsed(t, 10_500)).toBe(4500);
  });
  it('start and pause are idempotent', () => {
    const t = startTimer(newTimer(), 100);
    expect(startTimer(t, 500)).toBe(t);
    const p = pauseTimer(t, 200);
    expect(pauseTimer(p, 900)).toBe(p);
  });
});
