import { describe, it, expect } from 'vitest';
import { findLastWinnable } from '../../src/solver/rewind';
import { deal } from '../../src/engine/deal';

const states = Array.from({ length: 10 }, (_, i) => ({ ...deal(1, 1, 'standard'), moves: i }));

describe('findLastWinnable', () => {
  it('returns the newest state when it is winnable', () => {
    expect(findLastWinnable(states, () => true)).toBe(9);
  });
  it('binary-searches the boundary', () => {
    const checked: number[] = [];
    const idx = findLastWinnable(states, (s) => {
      checked.push(s.moves);
      return s.moves <= 5;
    });
    expect(idx).toBe(5);
    expect(checked.length).toBeLessThanOrEqual(5);
  });
  it('falls back to the start', () => {
    expect(findLastWinnable(states, (s) => s.moves === 0)).toBe(0);
  });
  it('handles an empty history', () => {
    expect(findLastWinnable([], () => true)).toBe(-1);
  });
});
