import type { DrawCount, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export interface ModeStats {
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  bestTimeMs: number | null;
  fewestMoves: number | null;
  bestScore: number | null;
}

export interface Stats {
  v: 1;
  draw1: ModeStats;
  draw3: ModeStats;
  vegasBank: number;
}

export interface GameResult {
  drawCount: DrawCount;
  scoring: Scoring;
  won: boolean;
  timeMs: number;
  moves: number;
  score: number;
}

export const emptyModeStats = (): ModeStats => ({
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTimeMs: null,
  fewestMoves: null,
  bestScore: null,
});

export const emptyStats = (): Stats => ({ v: 1, draw1: emptyModeStats(), draw3: emptyModeStats(), vegasBank: 0 });

const lower = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));

export function recordResult(stats: Stats, r: GameResult): Stats {
  const key = r.drawCount === 1 ? 'draw1' : 'draw3';
  const m = stats[key];
  const next: ModeStats = r.won
    ? {
        played: m.played + 1,
        won: m.won + 1,
        currentStreak: m.currentStreak + 1,
        bestStreak: Math.max(m.bestStreak, m.currentStreak + 1),
        bestTimeMs: lower(m.bestTimeMs, r.timeMs),
        fewestMoves: lower(m.fewestMoves, r.moves),
        bestScore: r.scoring === 'standard' ? Math.max(m.bestScore ?? 0, r.score) : m.bestScore,
      }
    : { ...m, played: m.played + 1, currentStreak: 0 };
  return { ...stats, [key]: next, vegasBank: r.scoring === 'vegas' ? stats.vegasBank + r.score : stats.vegasBank };
}

export const winRate = (m: ModeStats): number => (m.played ? m.won / m.played : 0);

const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const countOrNull = (v: unknown) => v === null || count(v);

function parseMode(raw: unknown): ModeStats | null {
  const r = asRecord(raw);
  const ok =
    count(r.played) && count(r.won) && count(r.currentStreak) && count(r.bestStreak) &&
    countOrNull(r.bestTimeMs) && countOrNull(r.fewestMoves) && countOrNull(r.bestScore);
  return ok ? (r as unknown as ModeStats) : null;
}

export function parseStats(raw: unknown): Stats {
  const r = asRecord(raw);
  const draw1 = parseMode(r.draw1);
  const draw3 = parseMode(r.draw3);
  if (r.v !== 1 || !draw1 || !draw3 || typeof r.vegasBank !== 'number' || !Number.isFinite(r.vegasBank)) return emptyStats();
  return { v: 1, draw1, draw3, vegasBank: r.vegasBank };
}

export const loadStats = (): Stats => parseStats(readJSON(KEYS.stats));
export const saveStats = (s: Stats): void => writeJSON(KEYS.stats, s);
