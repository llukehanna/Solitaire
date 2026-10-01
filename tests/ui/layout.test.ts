import { describe, it, expect } from 'vitest';
import { cardPositions, columnOffsets, computeLayout, pickDropTarget, pickupAt, pickupIds, pileRect } from '../../src/ui/layout';
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
    const L = computeLayout(1280, 740, false);
    const s = makeState({ cols: [['2C 3C 4C 5C 6C 7C KS QH JS TH 9S 8H 7S 6H 5S', 6]] });
    const offsets = columnOffsets(L, s.tableau[0]);
    expect(offsets.up).toBeLessThan(L.cardH * 0.26);
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

describe('computeLayout on phones', () => {
  it.each([
    [375, 650, 50],
    [390, 680, 52],
    [412, 700, 55],
  ])('runs cards edge to edge at %ix%i (cardW %i)', (w, h, cardW) => {
    const L = computeLayout(w, h, false, true);
    expect(L.cardW).toBe(cardW);
    expect(L.gap).toBe(3);
    expect(7 * L.cardW + 6 * L.gap).toBeLessThanOrEqual(w);
    expect(L.tableau[0].x).toBeGreaterThanOrEqual(3);
    expect(L.tableauBottom).toBeLessThanOrEqual(h);
    expect(L.cardH).toBe(Math.round(L.cardW * 1.4));
  });
  it('fans face-up cards at 0.40 of a card height and face-down at 0.10', () => {
    const L = computeLayout(375, 650, false, true);
    const s = makeState({ cols: [['KS QH', 1]] });
    expect(columnOffsets(L, s.tableau[0])).toEqual({ down: L.cardH * 0.1, up: L.cardH * 0.4 });
  });
  it('squeezes a 6-down, 13-up column to stay above the bottom', () => {
    const L = computeLayout(375, 650, false, true);
    const s = makeState({ cols: [['2C 3C 4C 5C 6C 7C KS QH JS TH 9S 8H 7S 6H 5S 4H 3S 2H AS', 6]] });
    const pos = cardPositions(s, L);
    const top = s.tableau[0].cards[s.tableau[0].cards.length - 1];
    expect(pos.get(top)!.y + L.cardH).toBeLessThanOrEqual(L.tableauBottom + 0.5);
  });
  it.each([false, true])('keeps the draw-3 waste fan clear of the next slot (left-handed: %s)', (leftHanded) => {
    const L = computeLayout(375, 650, leftHanded, true);
    expect(L.wasteFan).toBe(Math.round(L.cardW * 0.45));
    const s = makeState({ drawCount: 3, waste: cards('2C 3C 4C') });
    const pos = cardPositions(s, L);
    const lastRight = pos.get(s.waste[2])!.x + L.cardW;
    expect(lastRight).toBeLessThanOrEqual(L.waste.x + 2 * (L.cardW + L.gap));
  });
  it('leaves the desktop layout untouched without the phone flag', () => {
    const L = computeLayout(1280, 740, false);
    expect({ cardW: L.cardW, gap: L.gap, wasteFan: L.wasteFan, downStep: L.downStep, upStep: L.upStep, x0: L.tableau[0].x }).toEqual({
      cardW: 149, gap: 21, wasteFan: 33, downStep: 0.12, upStep: 0.26, x0: 56,
    });
  });
});

describe('drop targets and pickups', () => {
  const s = makeState({ cols: [['9C 8H 7S', 1], ['9S', 0]], waste: cards('KD') });
  const L = computeLayout(1000, 800, false);

  it('picks the overlapping candidate', () => {
    const r = pileRect(s, L, 'T1');
    expect(pickDropTarget(s, L, { x: r.x + 10, y: r.y + 20, w: L.cardW, h: L.cardH }, ['T1', 'T4'])).toBe('T1');
  });
  it('prioritizes overlap area when multiple piles overlap', () => {
    const r1 = pileRect(s, L, 'T1');
    const dragX = r1.x + L.cardW - 5;
    const dragRect = { x: dragX, y: r1.y, w: L.cardW, h: L.cardH };
    expect(pickDropTarget(s, L, dragRect, ['T1', 'T2'])).toBe('T2');
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
