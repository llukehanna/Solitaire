import { beforeEach, describe, it, expect } from 'vitest';
import { installLocalStorage, removeLocalStorage } from '../localStorage';
import { KEYS, readJSON, writeJSON } from '../../src/store/storage';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../../src/store/settings';
import { emptyStats, importStats, parseImportForm, parseStats, recordResult, SOLITAIRED_PREFILL, winRate } from '../../src/store/stats';
import { RECENT_LIMIT, loadRecent, pushRecent } from '../../src/store/recent';

beforeEach(() => {
  installLocalStorage();
});

describe('storage', () => {
  it('survives missing localStorage and bad JSON', () => {
    removeLocalStorage();
    expect(readJSON('x')).toBeNull();
    expect(() => writeJSON('x', 1)).not.toThrow();
    const m = installLocalStorage();
    m.set('x', '{not json');
    expect(readJSON('x')).toBeNull();
  });
});

describe('settings', () => {
  it('defaults garbage and keeps valid fields', () => {
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ drawCount: 3, scoring: 'bogus', sound: false, table: 'felt', cardBack: 'navy' })).toEqual({
      ...DEFAULT_SETTINGS,
      drawCount: 3,
      sound: false,
      table: 'felt',
      cardBack: 'navy',
    });
    expect(DEFAULT_SETTINGS.table).toBe('studio');
    expect(DEFAULT_SETTINGS.cardBack).toBe('deco');
  });
  it('auto-move is opt-in and ignores the old autoPlay flag', () => {
    expect(DEFAULT_SETTINGS.autoMove).toBe(false);
    expect(parseSettings({ autoPlay: true }).autoMove).toBe(false);
    expect(parseSettings({ autoMove: true }).autoMove).toBe(true);
    expect(parseSettings({ autoPlay: true })).not.toHaveProperty('autoPlay');
  });
  it.each(['deco', 'amber', 'ink', 'oxblood', 'navy'])('accepts the %s card back', (cardBack) => {
    expect(parseSettings({ cardBack }).cardBack).toBe(cardBack);
  });
  it.each([
    [{ theme: 'classic' }, false, 'felt'],
    [{ theme: 'minimal', colorMode: 'light' }, false, 'paper'],
    [{ theme: 'minimal', colorMode: 'dark' }, true, 'studio'],
    [{ theme: 'minimal', colorMode: 'auto' }, true, 'paper'],
    [{ theme: 'minimal', colorMode: 'auto' }, false, 'studio'],
    [{}, true, 'studio'],
  ])('migrates v1 %o (prefers light: %s) to the %s table', (raw, light, table) => {
    expect(parseSettings(raw, light).table).toBe(table);
    expect(parseSettings(raw, light)).not.toHaveProperty('theme');
  });
  it('saves the migrated settings once on load', () => {
    writeJSON(KEYS.settings, { theme: 'classic', sound: false });
    expect(loadSettings().table).toBe('felt');
    expect(readJSON(KEYS.settings)).toMatchObject({ table: 'felt', sound: false });
  });
  it('round-trips through storage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, leftHanded: true });
    expect(loadSettings().leftHanded).toBe(true);
  });
});

describe('stats', () => {
  it('records wins, losses, streaks and bests per draw mode', () => {
    let s = emptyStats();
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 90_000, moves: 120, score: 500 });
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 80_000, moves: 130, score: 400 });
    expect(s.draw1).toMatchObject({ played: 2, won: 2, currentStreak: 2, bestStreak: 2, bestTimeMs: 80_000, fewestMoves: 120, bestScore: 500 });
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: false, timeMs: 10_000, moves: 5, score: 0 });
    expect(s.draw1).toMatchObject({ played: 3, won: 2, currentStreak: 0, bestStreak: 2 });
    expect(winRate(s.draw1)).toBeCloseTo(2 / 3);
    expect(s.draw3.played).toBe(0);
  });
  it('accumulates the Vegas bank', () => {
    let s = recordResult(emptyStats(), { drawCount: 3, scoring: 'vegas', won: false, timeMs: 1, moves: 1, score: -32 });
    s = recordResult(s, { drawCount: 3, scoring: 'vegas', won: true, timeMs: 1, moves: 1, score: 208 });
    expect(s.vegasBank).toBe(176);
    expect(s.draw3.bestScore).toBeNull();
  });
  it('replaces corrupt data with empty stats', () => {
    expect(parseStats({ v: 1, draw1: { played: 'x' } })).toEqual(emptyStats());
    expect(parseStats(null)).toEqual(emptyStats());
  });
});

describe('stats import', () => {
  it('adds counts, keeps the better bests, marks draw1 and leaves streaks alone', () => {
    let s = emptyStats();
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 20_000, moves: 150, score: 500 });
    const r = importStats(s, SOLITAIRED_PREFILL, 123);
    expect(r.draw1).toMatchObject({
      played: 5562,
      won: 4090,
      bestTimeMs: 20_000, // ours was better
      fewestMoves: 102, // theirs was better
      currentStreak: 1,
      bestStreak: 1,
      bestScore: 500,
      imported: { source: 'solitaired', at: 123 },
    });
    expect(r.draw3).toEqual(s.draw3);
    expect(importStats(r, SOLITAIRED_PREFILL, 456)).toBe(r); // once only
  });
  it('keeps the marker through later results and round-trips', () => {
    const r = recordResult(importStats(emptyStats(), SOLITAIRED_PREFILL, 1), { drawCount: 1, scoring: 'standard', won: true, timeMs: 1, moves: 1, score: 1 });
    expect(r.draw1.imported).toEqual({ source: 'solitaired', at: 1 });
    expect(parseStats(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it('v:1 without a marker parses with no marker; a stored v:2 record (earlier v1.1 build) is accepted and normalised to v:1', () => {
    const v1 = emptyStats();
    expect(v1.v).toBe(1);
    const p = parseStats(v1);
    expect(p.v).toBe(1);
    expect(p.draw1.imported).toBeUndefined();
    const p2 = parseStats({ ...v1, v: 2, draw1: { ...v1.draw1, played: 3, imported: { source: 'solitaired', at: 9 } } });
    expect(p2.v).toBe(1);
    expect(p2.draw1).toMatchObject({ played: 3, imported: { source: 'solitaired', at: 9 } });
    expect(parseStats({ ...v1, v: 3 })).toEqual(emptyStats());
  });
  it('validates the form', () => {
    expect(parseImportForm({ played: '5561', won: '4089', time: '0:34', moves: '102' })).toEqual({ ok: true, value: SOLITAIRED_PREFILL });
    expect(parseImportForm({ played: '10', won: '4', time: '', moves: '' })).toEqual({ ok: true, value: { played: 10, won: 4, timeMs: null, moves: null } });
    expect(parseImportForm({ played: '3', won: '4', time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '-1', won: '0', time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '5', won: '1', time: '1:75', moves: '' }).ok).toBe(false);
  });
  it('rejects unsafe integers, a 0:00 fastest time and zero fewest moves', () => {
    const big = '9'.repeat(400);
    expect(parseImportForm({ played: big, won: '1', time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '5', won: big, time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '5', won: '1', time: '', moves: big }).ok).toBe(false);
    expect(parseImportForm({ played: '9007199254740993', won: '1', time: '', moves: '' }).ok).toBe(false);
    const t0 = parseImportForm({ played: '5', won: '1', time: '0:00', moves: '' });
    expect(t0.ok).toBe(false);
    if (!t0.ok) expect(t0.error).toMatch(/fastest/i);
    const m0 = parseImportForm({ played: '5', won: '1', time: '', moves: '0' });
    expect(m0.ok).toBe(false);
    if (!m0.ok) expect(m0.error).toMatch(/moves/i);
    expect(parseImportForm({ played: '5', won: '1', time: '0:01', moves: '1' }).ok).toBe(true);
  });
});

describe('recent seeds', () => {
  it('dedupes and caps per draw mode', () => {
    for (let i = 0; i < RECENT_LIMIT + 10; i++) pushRecent(1, i);
    pushRecent(1, 5);
    const r = loadRecent(1);
    expect(r).toHaveLength(RECENT_LIMIT);
    expect(r[r.length - 1]).toBe(5);
    expect(r.filter((x) => x === 5)).toHaveLength(1);
    expect(loadRecent(3)).toEqual([]);
  });
  it('ignores corrupt data', () => {
    writeJSON(KEYS.recent, { draw1: ['a', 3] });
    expect(loadRecent(1)).toEqual([]);
  });
});
