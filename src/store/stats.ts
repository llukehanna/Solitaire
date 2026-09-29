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
  imported?: { source: 'solitaired'; at: number };
}

export interface Stats {
  v: 2;
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

export const emptyStats = (): Stats => ({ v: 2, draw1: emptyModeStats(), draw3: emptyModeStats(), vegasBank: 0 });

const lower = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));

export function recordResult(stats: Stats, r: GameResult): Stats {
  const key = r.drawCount === 1 ? 'draw1' : 'draw3';
  const m = stats[key];
  const next: ModeStats = r.won
    ? {
        ...m,
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
  if (!ok) return null;
  const imp = asRecord(r.imported);
  const mode: ModeStats = {
    played: r.played as number,
    won: r.won as number,
    currentStreak: r.currentStreak as number,
    bestStreak: r.bestStreak as number,
    bestTimeMs: r.bestTimeMs as number | null,
    fewestMoves: r.fewestMoves as number | null,
    bestScore: r.bestScore as number | null,
  };
  return imp.source === 'solitaired' && typeof imp.at === 'number' ? { ...mode, imported: { source: 'solitaired', at: imp.at } } : mode;
}

export function parseStats(raw: unknown): Stats {
  const r = asRecord(raw);
  const draw1 = parseMode(r.draw1);
  const draw3 = parseMode(r.draw3);
  if ((r.v !== 1 && r.v !== 2) || !draw1 || !draw3 || typeof r.vegasBank !== 'number' || !Number.isFinite(r.vegasBank)) return emptyStats();
  return { v: 2, draw1, draw3, vegasBank: r.vegasBank };
}

export interface ImportInput {
  played: number;
  won: number;
  timeMs: number | null;
  moves: number | null;
}

/** Luke's Klondike (turn 1) record on solitaired.com, read 2026-09-29. Prefills the import form. */
export const SOLITAIRED_PREFILL: ImportInput = { played: 5561, won: 4089, timeMs: 34_000, moves: 102 };

const better = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

/** Adds an outside Draw 1 record once per device; streaks and scores don't carry over. */
export function importStats(stats: Stats, input: ImportInput, at: number): Stats {
  const m = stats.draw1;
  if (m.imported) return stats;
  return {
    ...stats,
    draw1: {
      ...m,
      played: m.played + input.played,
      won: m.won + input.won,
      bestTimeMs: better(m.bestTimeMs, input.timeMs),
      fewestMoves: better(m.fewestMoves, input.moves),
      imported: { source: 'solitaired', at },
    },
  };
}

export interface ImportFields {
  played: string;
  won: string;
  time: string;
  moves: string;
}

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

export function parseImportForm(f: ImportFields): { ok: true; value: ImportInput } | { ok: false; error: string } {
  const played = int(f.played);
  const won = int(f.won);
  if (played === null || won === null) return { ok: false, error: 'Games played and won must be whole numbers.' };
  if (won > played) return { ok: false, error: "Games won can't exceed games played." };
  let timeMs: number | null = null;
  if (f.time.trim()) {
    const t = /^(\d+):([0-5]\d)$/.exec(f.time.trim());
    if (!t) return { ok: false, error: 'Fastest win must look like 0:34.' };
    timeMs = (Number(t[1]) * 60 + Number(t[2])) * 1000;
  }
  const moves = f.moves.trim() ? int(f.moves) : null;
  if (f.moves.trim() && moves === null) return { ok: false, error: 'Fewest moves must be a whole number.' };
  return { ok: true, value: { played, won, timeMs, moves } };
}

export const loadStats = (): Stats => parseStats(readJSON(KEYS.stats));
export const saveStats = (s: Stats): void => writeJSON(KEYS.stats, s);
