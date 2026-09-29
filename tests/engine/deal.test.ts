import { describe, it, expect } from 'vitest';
import { cardCode, cardId, cardName, isRed, rankLabel, rankOf, suitOf } from '../../src/engine/cards';
import { mulberry32, shuffledDeck } from '../../src/engine/rng';
import { deal } from '../../src/engine/deal';
import { parsePile } from '../../src/engine/types';

const FULL = Array.from({ length: 52 }, (_, i) => i);

describe('cards', () => {
  it('maps ids to suit and rank', () => {
    expect(suitOf(0)).toBe('S');
    expect(rankOf(0)).toBe(1);
    expect(suitOf(13)).toBe('H');
    expect(rankOf(25)).toBe(13);
    expect(cardId('D', 7)).toBe(32);
    expect(isRed(cardId('H', 5))).toBe(true);
    expect(isRed(cardId('D', 5))).toBe(true);
    expect(isRed(cardId('C', 5))).toBe(false);
    expect(cardName(cardId('S', 12))).toBe('queen of spades');
    expect(cardCode(cardId('H', 10))).toBe('TH');
    expect(rankLabel(cardId('C', 10))).toBe('10');
  });
});

describe('piles', () => {
  it('parses pile ids', () => {
    expect(parsePile('W')).toEqual({ kind: 'W' });
    expect(parsePile('F2')).toEqual({ kind: 'F', i: 2 });
    expect(parsePile('T6')).toEqual({ kind: 'T', i: 6 });
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('shuffles a full deck deterministically', () => {
    const d = shuffledDeck(7);
    expect([...d].sort((x, y) => x - y)).toEqual(FULL);
    expect(shuffledDeck(7)).toEqual(d);
    expect(shuffledDeck(8)).not.toEqual(d);
  });
});

describe('deal', () => {
  it('lays out Klondike', () => {
    const s = deal(123, 1, 'standard');
    expect(s.tableau.map((col) => col.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.tableau.map((col) => col.faceUpFrom)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toEqual([]);
    expect(s.foundations).toEqual([[], [], [], []]);
    const all = [...s.stock, ...s.tableau.flatMap((col) => col.cards)].sort((a, b) => a - b);
    expect(all).toEqual(FULL);
    expect(s).toMatchObject({ seed: 123, drawCount: 1, scoring: 'standard', score: 0, moves: 0, recycles: 0 });
  });
  it('is fully determined by seed', () => {
    expect(deal(5, 3, 'none')).toEqual(deal(5, 3, 'none'));
    expect(deal(5, 3, 'none').stock).not.toEqual(deal(6, 3, 'none').stock);
  });
  it('starts Vegas at -52', () => {
    expect(deal(1, 1, 'vegas').score).toBe(-52);
  });
});
