import { describe, it, expect } from 'vitest';
import { formatScore, formatTime } from '../../src/ui/format';
import { newSession } from '../../src/game/session';
import { DEFAULT_SETTINGS } from '../../src/store/settings';

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(7_400)).toBe('0:07');
    expect(formatTime(754_000)).toBe('12:34');
    expect(formatTime(3_723_000)).toBe('1:02:03');
  });
  it('clamps negative durations to zero', () => {
    expect(formatTime(-500)).toBe('0:00');
  });
});

describe('formatScore', () => {
  it('shows points, dollars, or nothing', () => {
    expect(formatScore(newSession(1, 1, 'standard'), DEFAULT_SETTINGS, 0)).toBe('0');
    expect(formatScore(newSession(1, 1, 'vegas'), DEFAULT_SETTINGS, 100)).toBe('-$52');
    expect(formatScore(newSession(1, 1, 'vegas'), { ...DEFAULT_SETTINGS, cumulativeVegas: true }, 100)).toBe('$48');
    expect(formatScore(newSession(1, 1, 'none'), DEFAULT_SETTINGS, 0)).toBeNull();
  });
});
