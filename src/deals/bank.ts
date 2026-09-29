import type { DrawCount } from '../engine/types';
import draw1 from './bank-draw1.json';
import draw3 from './bank-draw3.json';

export interface Bank {
  version: 1;
  drawCount: DrawCount;
  maxNodes: number;
  entries: [seed: number, solutionLength: number][];
}

const BANKS: Record<DrawCount, Bank> = {
  1: draw1 as unknown as Bank,
  3: draw3 as unknown as Bank,
};

export const bankFor = (drawCount: DrawCount): Bank => BANKS[drawCount];

export function pickSeed(drawCount: DrawCount, recent: readonly number[], rand: () => number = Math.random): number {
  const entries = bankFor(drawCount).entries;
  const recentSet = new Set(recent);
  const pool = entries.filter(([seed]) => !recentSet.has(seed));
  const from = pool.length ? pool : entries;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))][0];
}
