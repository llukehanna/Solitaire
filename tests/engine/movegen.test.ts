import { describe, it, expect } from 'vitest';
import { allFaceUp, applySafeMoves, destinationsFor, isSafeToFoundation, isWon, legalMoves, nextSafeMove } from '../../src/engine/movegen';
import { canMove } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import { c, cards, makeState, upTo } from '../helpers';

describe('legalMoves', () => {
  it('offers draw on a fresh deal and every move is legal', () => {
    const s = deal(3, 1, 'standard');
    const ms = legalMoves(s);
    expect(ms).toContainEqual({ type: 'draw' });
    expect(ms).not.toContainEqual({ type: 'recycle' });
    for (const m of ms) expect(canMove(s, m)).toBe(true);
  });
});

describe('destinationsFor', () => {
  it('orders foundation, then non-empty tableau, then empty tableau', () => {
    const s = makeState({
      foundations: [[], upTo('H', 1), [], []],
      cols: [['KD', 0], ['3S', 0], ['2H', 0], ['3C', 0]],
    });
    expect(destinationsFor(s, 'T2', 1)).toEqual(['F1', 'T1', 'T3']);
    expect(destinationsFor(s, 'T0', 1)).toEqual(['T4', 'T5', 'T6']);
  });
});

describe('safe foundation moves', () => {
  it('aces and twos are always safe', () => {
    const s = makeState({});
    expect(isSafeToFoundation(s, c('AH'))).toBe(true);
    expect(isSafeToFoundation(s, c('2C'))).toBe(true);
  });
  it('a card is safe when both opposite-colour foundations reach rank - 1', () => {
    const low = makeState({ foundations: [upTo('S', 4), [], [], upTo('C', 3)] });
    const ok = makeState({ foundations: [upTo('S', 4), [], [], upTo('C', 4)] });
    expect(isSafeToFoundation(low, c('5H'))).toBe(false);
    expect(isSafeToFoundation(ok, c('5H'))).toBe(true);
  });
  it('chains safe moves, flipping cards as it goes', () => {
    const s = makeState({ cols: [['2S AS', 1]] });
    const r = applySafeMoves(s);
    expect(r.moves).toHaveLength(2);
    expect(r.state.foundations[0]).toEqual(cards('AS 2S'));
    expect(r.state.tableau[0].cards).toEqual([]);
  });
  it('can skip the waste', () => {
    const s = makeState({ waste: cards('AD') });
    expect(nextSafeMove(s, false)).toBeNull();
    expect(nextSafeMove(s, true)).toEqual({ type: 'move', from: 'W', to: 'F2', count: 1 });
  });
});

describe('win and face-up detection', () => {
  it('detects a win', () => {
    expect(isWon(makeState({ foundations: [upTo('S', 13), upTo('H', 13), upTo('D', 13), upTo('C', 13)] }))).toBe(true);
    expect(isWon(deal(1, 1, 'standard'))).toBe(false);
  });
  it('detects all tableau cards face up', () => {
    expect(allFaceUp(makeState({ cols: [['KS QH', 0]], stock: cards('2C') }))).toBe(true);
    expect(allFaceUp(deal(1, 1, 'standard'))).toBe(false);
  });
});
