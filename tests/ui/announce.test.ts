import { describe, it, expect } from 'vitest';
import { describeHint, describePickup, describeTurn } from '../../src/ui/announce';
import { cards, makeState } from '../helpers';

describe('describeTurn', () => {
  it('describes draws, moves, flips and recycles', () => {
    const s = makeState({ stock: cards('2C 4D'), cols: [['5S AH', 1], ['9S', 0], ['9C 8H', 1]] });
    expect(describeTurn(s, [{ type: 'draw' }])).toBe('Drew 4 of diamonds.');
    expect(describeTurn(s, [{ type: 'move', from: 'T0', to: 'F1', count: 1 }])).toBe(
      'Moved ace of hearts to the foundation. Revealed 5 of spades.',
    );
    expect(describeTurn(s, [{ type: 'move', from: 'T2', to: 'T1', count: 1 }])).toBe(
      'Moved 8 of hearts to column 2. Revealed 9 of clubs.',
    );
    const r = makeState({ waste: cards('2C') });
    expect(describeTurn(r, [{ type: 'recycle' }])).toBe('Turned the waste back over.');
  });
});

describe('describeHint and describePickup', () => {
  const s = makeState({ stock: cards('2C'), cols: [['9C 8H 7S', 1], ['9S', 0]] });
  it('speaks move hints', () => {
    expect(describeHint(s, { kind: 'move', from: 'T0', count: 2, to: 'T1' })).toBe('Hint: move 8 of hearts and 1 more to column 2.');
    expect(describeHint(s, { kind: 'move', from: 'T0', count: 1, to: 'F3' })).toBe('Hint: move 7 of spades to the foundation.');
  });
  it('speaks stock hints', () => {
    expect(describeHint(s, { kind: 'stock' })).toBe('Hint: draw from the stock.');
    const r = makeState({ waste: cards('2C') });
    expect(describeHint(r, { kind: 'stock' })).toBe('Hint: turn the waste back over.');
  });
  it('speaks pickups', () => {
    expect(describePickup(s, { from: 'T0', count: 2 })).toBe('Picked up 8 of hearts and 1 more.');
    expect(describePickup(s, { from: 'T0', count: 1 })).toBe('Picked up 7 of spades.');
  });
});
