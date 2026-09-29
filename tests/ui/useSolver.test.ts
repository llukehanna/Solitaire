import { describe, it, expect } from 'vitest';
import { deal } from '../../src/engine/deal';
import { applyMove } from '../../src/engine/apply';
import { boardKey, stuckFor, toHint } from '../../src/ui/useSolver';

describe('toHint', () => {
  it('maps card moves to a move hint and stock moves to the stock', () => {
    expect(toHint({ type: 'move', from: 'T2', to: 'F1', count: 1 })).toEqual({ kind: 'move', from: 'T2', to: 'F1', count: 1 });
    expect(toHint({ type: 'draw' })).toEqual({ kind: 'stock' });
    expect(toHint({ type: 'recycle' })).toEqual({ kind: 'stock' });
  });
});

describe('boardKey', () => {
  it('ignores stock/waste cycling but changes when the board changes', () => {
    const s = deal(3, 3, 'standard');
    const drawn = applyMove(s, { type: 'draw' });
    expect(drawn.waste.length).toBeGreaterThan(0);
    expect(boardKey(drawn)).toBe(boardKey(s));
    const other = deal(4, 3, 'standard');
    expect(boardKey(other)).not.toBe(boardKey(s));
  });
});

describe('stuckFor', () => {
  it('stays silent when the solver can still win, and picks the right prompt otherwise', () => {
    expect(stuckFor({ status: 'winnable', solution: [], nodes: 1 })).toBeNull();
    expect(stuckFor({ status: 'unwinnable', nodes: 1 })).toBe('unwinnable');
    expect(stuckFor({ status: 'unknown', nodes: 1 })).toBe('no-moves');
  });
});
