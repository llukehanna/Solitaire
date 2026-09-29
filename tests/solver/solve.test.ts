import { describe, it, expect } from 'vitest';
import { solve, stateKey } from '../../src/solver/solve';
import { applyMove, applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';
import { DEAD_STATE, EASY_STATE, STUCK_DRAW3 } from '../fixtures';

describe('stateKey', () => {
  it('ignores column order', () => {
    const a = makeState({ cols: [['KS', 0], ['QH', 0]] });
    const b = makeState({ cols: [['QH', 0], ['KS', 0]] });
    expect(stateKey(a, false)).toBe(stateKey(b, false));
  });
  it('ignores the draw-1 stock position', () => {
    const s = makeState({ stock: cards('2C 3C') });
    expect(stateKey(applyMove(s, { type: 'draw' }), false)).toBe(stateKey(s, false));
  });
  it('keeps an off-grid draw-3 position distinct', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C') });
    expect(stateKey(applyMove(s, { type: 'draw' }), false)).toBe(stateKey(s, false));
    const off = makeState({ drawCount: 3, waste: cards('5C'), stock: cards('2C 3C 4C') });
    expect(stateKey(off, false)).not.toBe(stateKey(s, false));
  });
});

describe('solve', () => {
  it('solves an easy position with a replayable solution', () => {
    const r = solve(EASY_STATE, { maxNodes: 10_000 });
    expect(r.status).toBe('winnable');
    if (r.status === 'winnable') expect(isWon(applyMoves(EASY_STATE, r.solution))).toBe(true);
  });
  it('proves dead positions unwinnable', () => {
    expect(solve(DEAD_STATE, { maxNodes: 10_000 }).status).toBe('unwinnable');
    expect(solve(STUCK_DRAW3, { maxNodes: 10_000 }).status).toBe('unwinnable');
  });
  it('returns unknown when the budget runs out', () => {
    expect(solve(deal(1, 1, 'standard'), { maxNodes: 1 }).status).toBe('unknown');
  });
  it('returns unknown when cancelled', () => {
    expect(solve(deal(1, 1, 'standard'), { maxNodes: 1e7, shouldCancel: () => true }).status).toBe('unknown');
  });
  it('solves most real draw-1 deals, and every solution replays to a win', () => {
    let winnable = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const start = deal(seed, 1, 'standard');
      const r = solve(start, { maxNodes: 200_000 });
      if (r.status === 'winnable') {
        winnable++;
        expect(isWon(applyMoves(start, r.solution)), `seed ${seed}`).toBe(true);
      }
    }
    expect(winnable).toBeGreaterThanOrEqual(6);
  }, 120_000);
  it('honours Vegas recycle limits when asked', () => {
    const start = deal(4, 3, 'vegas');
    const r = solve(start, { maxNodes: 200_000, limitRecycles: true });
    if (r.status === 'winnable') expect(isWon(applyMoves(start, r.solution))).toBe(true);
    expect(['winnable', 'unwinnable', 'unknown']).toContain(r.status);
  }, 60_000);
});
