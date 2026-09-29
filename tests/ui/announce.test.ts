import { describe, it, expect } from 'vitest';
import { describeTurn } from '../../src/ui/announce';
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
