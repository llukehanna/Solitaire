import { describe, it, expect } from 'vitest';
import { hasProductiveMove, heuristicHint } from '../../src/engine/analysis';
import { canMove } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import { cards, makeState, upTo } from '../helpers';
import { DEAD_STATE, EASY_STATE, STUCK_DRAW3 } from '../fixtures';

describe('hasProductiveMove', () => {
  it('is true on a fresh deal', () => {
    expect(hasProductiveMove(deal(1, 1, 'standard'))).toBe(true);
  });
  it('is false for a dead position', () => {
    expect(hasProductiveMove(DEAD_STATE)).toBe(false);
    expect(hasProductiveMove(STUCK_DRAW3)).toBe(false);
  });
  it('sees a playable card deeper in the stock', () => {
    // 8♣ is drawn first, then A♥
    expect(hasProductiveMove(makeState({ stock: cards('AH 8C') }))).toBe(true);
  });
  it('ignores moving a lone king between empty columns', () => {
    // Q♠ is deliberately absent, so K♠ can only shuffle between empty columns
    const s = makeState({ foundations: [upTo('S', 11), upTo('H', 13), upTo('D', 13), upTo('C', 13)], cols: [['KS', 0]] });
    expect(hasProductiveMove(s)).toBe(false);
  });
});

describe('heuristicHint', () => {
  it('prefers a foundation move', () => {
    expect(heuristicHint(EASY_STATE)).toEqual({ type: 'move', from: 'T0', to: 'F1', count: 1 });
  });
  it('suggests drawing when the useful card is in the stock', () => {
    const s = makeState({ stock: cards('AH 8C') });
    expect(heuristicHint(s)).toEqual({ type: 'draw' });
  });
  it('returns null when there is nothing productive', () => {
    expect(heuristicHint(DEAD_STATE)).toBeNull();
  });
  it('returns legal moves on real deals', () => {
    let hints = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = deal(seed, 3, 'standard');
      const h = heuristicHint(s);
      if (h) {
        hints++;
        expect(canMove(s, h)).toBe(true);
      }
    }
    expect(hints).toBeGreaterThanOrEqual(18);
  });
});
