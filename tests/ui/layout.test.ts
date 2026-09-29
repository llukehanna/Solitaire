import { describe, it, expect } from 'vitest';
import { cardPositions, computeLayout, pickDropTarget, pickupAt, pickupIds, pileRect } from '../../src/ui/layout';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';

const VIEWPORTS: [number, number][] = [
  [375, 640],
  [390, 720],
  [768, 900],
  [1280, 740],
  [1920, 1000],
];

describe('computeLayout', () => {
  it.each(VIEWPORTS)('fits seven columns and two card heights in %ix%i', (w, h) => {
    const L = computeLayout(w, h, false);
    expect(7 * L.cardW + 6 * L.gap).toBeLessThanOrEqual(w);
    expect(L.tableau[0].y + L.cardH).toBeLessThanOrEqual(h);
    expect(L.cardH).toBe(Math.round(L.cardW * 1.4));
  });
  it('mirrors the top row for left-handed play', () => {
    const r = computeLayout(1000, 800, false);
    const l = computeLayout(1000, 800, true);
    expect(r.stock.x).toBeLessThan(r.foundations[0].x);
    expect(l.stock.x).toBeGreaterThan(l.foundations[3].x);
  });
});

describe('cardPositions', () => {
  it('places all 52 cards with face-up flags matching the state', () => {
    const s = deal(9, 1, 'standard');
    const pos = cardPositions(s, computeLayout(1000, 800, false));
    expect(pos.size).toBe(52);
    expect([...pos.values()].filter((p) => p.faceUp)).toHaveLength(7);
    expect(pos.get(s.stock[0])!.pile).toBe('S');
  });
  it('compresses long columns to stay on screen', () => {
    const L = computeLayout(390, 640, false);
    const s = makeState({ cols: [['2C 3C 4C 5C 6C 7C KS QH JS TH 9S 8H 7S 6H 5S 4H 3S 2H', 6]] });
    const pos = cardPositions(s, L);
    const top = s.tableau[0].cards[s.tableau[0].cards.length - 1];
    expect(pos.get(top)!.y + L.cardH).toBeLessThanOrEqual(L.tableauBottom + 0.5);
  });
  it('fans the top three waste cards in draw-3', () => {
    const s = makeState({ drawCount: 3, waste: cards('2C 3C 4C 5C') });
    const L = computeLayout(1000, 800, false);
    const pos = cardPositions(s, L);
    const xs = s.waste.map((id) => pos.get(id)!.x);
    expect(xs[0]).toBe(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[2]).toBeLessThan(xs[3]);
  });
});

describe('drop targets and pickups', () => {
  const s = makeState({ cols: [['9C 8H 7S', 1], ['9S', 0]], waste: cards('KD') });
  const L = computeLayout(1000, 800, false);

  it('picks the overlapping candidate', () => {
    const r = pileRect(s, L, 'T1');
    expect(pickDropTarget(s, L, { x: r.x + 10, y: r.y + 20, w: L.cardW, h: L.cardH }, ['T1', 'T4'])).toBe('T1');
  });
  it('returns null far from every candidate', () => {
    expect(pickDropTarget(s, L, { x: 5000, y: 5000, w: L.cardW, h: L.cardH }, ['T1'])).toBeNull();
  });
  it('computes pickups from a pressed card', () => {
    const pos = cardPositions(s, L);
    expect(pickupAt(s, pos.get(s.tableau[0].cards[1])!)).toEqual({ from: 'T0', count: 2 });
    expect(pickupAt(s, pos.get(s.tableau[0].cards[0])!)).toBeNull();
    expect(pickupAt(s, pos.get(s.waste[0])!)).toEqual({ from: 'W', count: 1 });
    expect(pickupIds(s, { from: 'T0', count: 2 })).toEqual(cards('8H 7S'));
  });
});
