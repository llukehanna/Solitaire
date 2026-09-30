import { describe, it, expect } from 'vitest';
import { applyMove } from '../../src/engine/apply';
import { deal } from '../../src/engine/deal';
import { legalMoves } from '../../src/engine/movegen';
import type { Move } from '../../src/engine/types';
import { boostedIds, cardPositions, computeLayout } from '../../src/ui/layout';

const L = computeLayout(1280, 740, false);
const SEED_PAIRS: [number, number][] = [[1, 2], [7, 9], [123, 456], [2024, 31337], [5, 5000]];

describe('boostedIds', () => {
  it.each(SEED_PAIRS)('keeps every pile ordered by destination z after a new deal (%i -> %i)', (a, b) => {
    const prev = cardPositions(deal(a, 1, 'standard'), L);
    const next = cardPositions(deal(b, 1, 'standard'), L);
    const boosted = new Set(boostedIds(prev, next));
    const byPile = new Map<string, { index: number; z: number }[]>();
    for (const [id, pos] of next) {
      const list = byPile.get(pos.pile) ?? [];
      list.push({ index: pos.index, z: boosted.has(id) ? 1000 + pos.z : pos.z });
      byPile.set(pos.pile, list);
    }
    for (const [pile, list] of byPile) {
      list.sort((x, y) => x.index - y.index);
      for (let i = 1; i < list.length; i++) {
        expect(list[i].z, `${pile} index ${i}`).toBeGreaterThan(list[i - 1].z);
      }
    }
  });

  it('boosts nothing when nothing moved', () => {
    const pos = cardPositions(deal(3, 1, 'standard'), L);
    expect(boostedIds(pos, pos)).toEqual([]);
  });

  it('boosts the whole destination pile after a single move, and no unrelated pile', () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const s = deal(seed, 1, 'standard');
      const m = legalMoves(s).find((x): x is Extract<Move, { type: 'move' }> => x.type === 'move');
      if (!m) continue;
      found = true;
      const prev = cardPositions(s, L);
      const next = cardPositions(applyMove(s, m), L);
      const boosted = new Set(boostedIds(prev, next));
      const destCards = new Set([...next].filter(([, p]) => p.pile === m.to).map(([id]) => id));
      expect(destCards.size).toBeGreaterThan(m.count - 1);
      for (const id of destCards) expect(boosted.has(id)).toBe(true);
      for (const id of boosted) expect(destCards.has(id)).toBe(true);
    }
    expect(found).toBe(true);
  });
});
