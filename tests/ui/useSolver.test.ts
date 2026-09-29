import { describe, it, expect } from 'vitest';
import { toHint } from '../../src/ui/useSolver';

describe('toHint', () => {
  it('maps card moves to a move hint and stock moves to the stock', () => {
    expect(toHint({ type: 'move', from: 'T2', to: 'F1', count: 1 })).toEqual({ kind: 'move', from: 'T2', to: 'F1', count: 1 });
    expect(toHint({ type: 'draw' })).toEqual({ kind: 'stock' });
    expect(toHint({ type: 'recycle' })).toEqual({ kind: 'stock' });
  });
});
