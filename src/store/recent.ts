import type { DrawCount } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export const RECENT_LIMIT = 200;

type Recent = Record<'draw1' | 'draw3', number[]>;

const seeds = (v: unknown): number[] =>
  Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0) ? (v as number[]) : [];

function load(): Recent {
  const r = asRecord(readJSON(KEYS.recent));
  return { draw1: seeds(r.draw1), draw3: seeds(r.draw3) };
}

export const loadRecent = (d: DrawCount): number[] => load()[d === 1 ? 'draw1' : 'draw3'];

export function pushRecent(d: DrawCount, seed: number): number[] {
  const all = load();
  const key = d === 1 ? 'draw1' : 'draw3';
  const next = [...all[key].filter((s) => s !== seed), seed].slice(-RECENT_LIMIT);
  writeJSON(KEYS.recent, { ...all, [key]: next });
  return next;
}
