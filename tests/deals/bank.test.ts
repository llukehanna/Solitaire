import { describe, it, expect } from 'vitest';
import { bankFor, pickSeed } from '../../src/deals/bank';
import { deal } from '../../src/engine/deal';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { solve } from '../../src/solver/solve';

const FULL = !!process.env.FULL_DEALS;
const MIN_ENTRIES = Number(process.env.MIN_BANK ?? 2000);

describe.each([1, 3] as const)('draw-%i bank', (drawCount) => {
  const bank = bankFor(drawCount);

  it('holds enough unique uint32 seeds', () => {
    expect(bank.drawCount).toBe(drawCount);
    expect(bank.entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
    const seeds = bank.entries.map(([seed]) => seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });

  it('re-solves banked seeds to replayable wins', () => {
    const sample = FULL ? bank.entries : bank.entries.filter((_, i) => i % 100 === 0);
    for (const [seed, length] of sample) {
      const start = deal(seed, drawCount, 'standard');
      const r = solve(start, { maxNodes: bank.maxNodes });
      expect(r.status, `seed ${seed}`).toBe('winnable');
      if (r.status !== 'winnable') continue;
      expect(r.solution.length).toBe(length);
      expect(isWon(applyMoves(start, r.solution))).toBe(true);
    }
  }, FULL ? 3_600_000 : 300_000);
});

describe('pickSeed', () => {
  const bank = bankFor(1);
  const seeds = bank.entries.map(([s]) => s);

  it('never returns a recent seed while others remain', () => {
    const recent = seeds.slice(1);
    for (let i = 0; i < 20; i++) expect(pickSeed(1, recent)).toBe(seeds[0]);
  });
  it('falls back to the whole bank when everything is recent', () => {
    expect(seeds).toContain(pickSeed(1, seeds));
  });
  it('uses the supplied random source', () => {
    expect(pickSeed(1, [], () => 0)).toBe(seeds[0]);
    expect(pickSeed(1, [], () => 0.999999)).toBe(seeds[seeds.length - 1]);
  });
});
