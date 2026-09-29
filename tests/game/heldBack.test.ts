import { describe, it, expect } from 'vitest';
import { heldBackCards } from '../../src/game/heldBack';
import type { Move } from '../../src/engine/types';
import { c, makeState, upTo } from '../helpers';

const start = makeState({ foundations: [upTo('S', 4), upTo('H', 5), upTo('D', 4), upTo('C', 4)], cols: [['KD 6S', 1]] });
const down: Move = { type: 'move', from: 'F1', to: 'T0', count: 1 };
const up: Move = { type: 'move', from: 'T0', to: 'F1', count: 1 };

describe('heldBackCards', () => {
  it('holds a card taken off a foundation', () => {
    expect(heldBackCards(start, [[down]])).toEqual(new Set([c('5H')]));
  });
  it('releases it once it is back on a foundation', () => {
    expect(heldBackCards(start, [[down], [up]])).toEqual(new Set());
  });
  it('is empty with no turns', () => {
    expect(heldBackCards(start, [])).toEqual(new Set());
  });
});
