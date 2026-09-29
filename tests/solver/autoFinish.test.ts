import { describe, it, expect } from 'vitest';
import { autoFinish } from '../../src/solver/autoFinish';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { deal } from '../../src/engine/deal';
import { makeState, upTo } from '../helpers';
import { FINISH_DRAW1, STUCK_DRAW3 } from '../fixtures';

describe('autoFinish', () => {
  it('finishes an all-face-up draw-1 game with cards left in the stock', () => {
    const moves = autoFinish(FINISH_DRAW1);
    expect(moves).not.toBeNull();
    expect(isWon(applyMoves(FINISH_DRAW1, moves!))).toBe(true);
  });
  it('returns null when a draw-3 stock order makes finishing impossible', () => {
    expect(autoFinish(STUCK_DRAW3)).toBeNull();
  });
  it('returns null while cards are face down', () => {
    expect(autoFinish(deal(1, 1, 'standard'))).toBeNull();
  });
  it('falls back to the solver when a tableau move is needed', () => {
    // K♥ sits on 6♦; greedy can't play anything, but moving K♥ to an empty column unlocks everything.
    const s = makeState({
      foundations: [upTo('S', 13), upTo('H', 11), upTo('D', 5), upTo('C', 13)],
      cols: [['QH 6D KH', 0], ['KD QD JD TD 9D 8D 7D', 0]],
    });
    const moves = autoFinish(s);
    expect(moves).not.toBeNull();
    expect(isWon(applyMoves(s, moves!))).toBe(true);
  });
});
