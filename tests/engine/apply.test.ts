import { describe, it, expect } from 'vitest';
import { applyMove, applyMoves } from '../../src/engine/apply';
import { canMove, canRecycle } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import type { Move, PileId } from '../../src/engine/types';
import { cards, makeState, upTo } from '../helpers';

const mv = (from: PileId, to: PileId, count = 1): Move => ({ type: 'move', from, to, count });

describe('draw and recycle', () => {
  it('draw-1 moves the stock top to the waste', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const n = applyMove(s, { type: 'draw' });
    expect(n.stock).toEqual(cards('2C 3C'));
    expect(n.waste).toEqual(cards('4C'));
    expect(n.moves).toBe(1);
  });
  it('draw-3 deals three, the third drawn ends on top', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C') });
    const n = applyMove(s, { type: 'draw' });
    expect(n.stock).toEqual(cards('2C'));
    expect(n.waste).toEqual(cards('5C 4C 3C'));
  });
  it('draw-3 with fewer than three left draws what remains', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C') });
    expect(applyMove(s, { type: 'draw' }).waste).toEqual(cards('3C 2C'));
  });
  it('recycle turns the waste back into the stock in original order', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const drawn = applyMoves(s, [{ type: 'draw' }, { type: 'draw' }, { type: 'draw' }]);
    const r = applyMove(drawn, { type: 'recycle' });
    expect(r.stock).toEqual(s.stock);
    expect(r.waste).toEqual([]);
    expect(r.recycles).toBe(1);
  });
  it('recycle is illegal while the stock has cards or the waste is empty', () => {
    expect(canMove(makeState({ stock: cards('2C'), waste: cards('3C') }), { type: 'recycle' })).toBe(false);
    expect(canMove(makeState({}), { type: 'recycle' })).toBe(false);
  });
  it('recycle costs 100 in draw-1 and 20 in draw-3, floored at 0', () => {
    expect(applyMove(makeState({ waste: cards('2C'), score: 150 }), { type: 'recycle' }).score).toBe(50);
    expect(applyMove(makeState({ waste: cards('2C'), score: 50 }), { type: 'recycle' }).score).toBe(0);
    expect(applyMove(makeState({ drawCount: 3, waste: cards('2C'), score: 50 }), { type: 'recycle' }).score).toBe(30);
  });
  it('Vegas allows no recycles in draw-1 and two in draw-3', () => {
    expect(canRecycle(makeState({ scoring: 'vegas', waste: cards('2C') }))).toBe(false);
    const v3 = makeState({ scoring: 'vegas', drawCount: 3, waste: cards('2C') });
    expect(canRecycle(v3)).toBe(true);
    expect(canRecycle({ ...v3, recycles: 1 })).toBe(true);
    expect(canRecycle({ ...v3, recycles: 2 })).toBe(false);
  });
});

describe('card moves', () => {
  it('tableau to foundation flips the exposed card and scores 15', () => {
    const s = makeState({ cols: [['5S AH', 1]] });
    const n = applyMove(s, mv('T0', 'F1'));
    expect(n.foundations[1]).toEqual(cards('AH'));
    expect(n.tableau[0]).toEqual({ cards: cards('5S'), faceUpFrom: 0 });
    expect(n.score).toBe(15);
  });
  it('foundation accepts only the next rank of its own suit', () => {
    const s = makeState({ foundations: [upTo('S', 2), [], [], []], cols: [['3S', 0], ['4S', 0], ['3H', 0]] });
    expect(canMove(s, mv('T0', 'F0'))).toBe(true);
    expect(canMove(s, mv('T1', 'F0'))).toBe(false);
    expect(canMove(s, mv('T2', 'F0'))).toBe(false);
    expect(canMove(s, mv('T0', 'F1'))).toBe(false);
  });
  it('only kings go to an empty column', () => {
    const s = makeState({ cols: [['KH', 0], ['QH', 0]] });
    expect(canMove(s, mv('T0', 'T2'))).toBe(true);
    expect(canMove(s, mv('T1', 'T2'))).toBe(false);
  });
  it('moves a face-up run onto an alternating-colour higher card', () => {
    const s = makeState({ cols: [['9C 8H 7S', 1], ['9S', 0], ['9D', 0]] });
    expect(canMove(s, mv('T0', 'T2', 2))).toBe(false);
    const n = applyMove(s, mv('T0', 'T1', 2));
    expect(n.tableau[1]).toEqual({ cards: cards('9S 8H 7S'), faceUpFrom: 0 });
    expect(n.tableau[0]).toEqual({ cards: cards('9C'), faceUpFrom: 0 });
    expect(n.score).toBe(5);
  });
  it('cannot move face-down cards', () => {
    const s = makeState({ cols: [['9C 8H 7S', 1], ['TD', 0]] });
    expect(canMove(s, mv('T0', 'T1', 3))).toBe(false);
  });
  it('waste to tableau scores 5, foundation to tableau costs 15', () => {
    const s = makeState({ waste: cards('8H'), cols: [['9S', 0], ['8C', 0]], foundations: [[], upTo('H', 7), [], []], score: 20 });
    expect(applyMove(s, mv('W', 'T0')).score).toBe(25);
    expect(applyMove(s, mv('F1', 'T1')).score).toBe(5);
  });
  it('Vegas scores +5 per foundation card and -5 when taken back', () => {
    const s = makeState({ scoring: 'vegas', score: -52, cols: [['AH', 0], ['8C', 0]], foundations: [[], [], upTo('D', 7), []] });
    expect(applyMove(s, mv('T0', 'F1')).score).toBe(-47);
    expect(applyMove(s, mv('F2', 'T1')).score).toBe(-57);
  });
  it('none scoring never changes score', () => {
    const s = makeState({ scoring: 'none', cols: [['5S AH', 1]] });
    expect(applyMove(s, mv('T0', 'F1')).score).toBe(0);
  });
  it('rejects nonsense moves', () => {
    const s = makeState({ cols: [['AH', 0]] });
    expect(canMove(s, mv('T0', 'T0'))).toBe(false);
    expect(canMove(s, mv('T0', 'W'))).toBe(false);
    expect(canMove(s, mv('T0', 'F1', 0))).toBe(false);
    expect(canMove(s, mv('W', 'F1'))).toBe(false);
    expect(() => applyMove(s, mv('T0', 'F0'))).toThrow(/Illegal move/);
  });
  it('never mutates its input', () => {
    const s = deal(99, 1, 'standard');
    const before = JSON.stringify(s);
    applyMove(s, { type: 'draw' });
    const col6top = s.tableau[6].cards[6];
    for (let to = 0; to < 7; to++) {
      const m = mv('T6', `T${to}` as PileId);
      if (canMove(s, m)) applyMove(s, m);
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(s.tableau[6].cards[6]).toBe(col6top);
  });
});
