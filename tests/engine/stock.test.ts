import { describe, it, expect } from 'vitest';
import { applyMoves } from '../../src/engine/apply';
import { deal } from '../../src/engine/deal';
import { drawSequence, jumpToStock, reachableStockPositions } from '../../src/engine/stock';
import { cards, makeState } from '../helpers';

describe('stock cycle', () => {
  it('draw-1 reaches every position including a recycle', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const ps = reachableStockPositions(s);
    expect(ps.map((p) => p.p)).toEqual([0, 1, 2, 3]);
    const withWaste = makeState({ stock: cards('2C'), waste: cards('3C 4C') });
    expect(reachableStockPositions(withWaste).map((p) => p.p)).toEqual([2, 3, 0, 1]);
  });
  it('draw-3 visits multiples of three and the end', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C 6C 7C 8C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([0, 3, 6, 7]);
  });
  it('draw-3 from an off-grid position continues then settles on the grid', () => {
    const s = makeState({ drawCount: 3, waste: cards('2C'), stock: cards('3C 4C 5C 6C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([1, 4, 5, 0, 3]);
  });
  it('respects Vegas recycle limits unless told otherwise', () => {
    const s = makeState({ scoring: 'vegas', stock: cards('2C 3C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([0, 1, 2]);
    expect(reachableStockPositions(s, true).map((p) => p.p)).toEqual([0, 1, 2]);
    const mid = makeState({ scoring: 'vegas', waste: cards('2C'), stock: cards('3C') });
    expect(reachableStockPositions(mid).map((p) => p.p)).toEqual([1, 2]);
    expect(reachableStockPositions(mid, true).map((p) => p.p)).toEqual([1, 2, 0]);
  });
  it('jumpToStock matches replaying the path', () => {
    for (const drawCount of [1, 3] as const) {
      const s = applyMoves(deal(11, drawCount, 'standard'), [{ type: 'draw' }]);
      for (const pos of reachableStockPositions(s)) {
        expect(jumpToStock(s, pos)).toEqual(applyMoves(s, pos.path));
      }
    }
  });
  it('drawSequence lists waste then stock in draw order', () => {
    const s = makeState({ waste: cards('2C 3C'), stock: cards('4C 5C') });
    expect(drawSequence(s)).toEqual(cards('2C 3C 5C 4C'));
  });
});
