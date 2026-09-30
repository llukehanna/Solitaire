import type { DrawCount, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export type TableTheme = 'studio' | 'felt' | 'paper';
export type CardBack = 'deco' | 'amber' | 'ink' | 'oxblood' | 'navy';
export const TABLES: readonly TableTheme[] = ['studio', 'felt', 'paper'];
export const CARD_BACKS: readonly CardBack[] = ['deco', 'amber', 'ink', 'oxblood', 'navy'];
export type AnimationSpeed = 'normal' | 'fast' | 'off';

export interface Settings {
  drawCount: DrawCount;
  scoring: Scoring;
  cumulativeVegas: boolean;
  autoMove: boolean;
  sound: boolean;
  leftHanded: boolean;
  fourColor: boolean;
  table: TableTheme;
  cardBack: CardBack;
  animation: AnimationSpeed;
}

export const DEFAULT_SETTINGS: Settings = {
  drawCount: 1,
  scoring: 'standard',
  cumulativeVegas: false,
  autoMove: false,
  sound: true,
  leftHanded: false,
  fourColor: false,
  table: 'studio',
  cardBack: 'deco',
  animation: 'normal',
};

const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** v1 stored theme + colorMode; map them onto a table (only used when no `table` is stored yet). */
function migrateTable(r: Record<string, unknown>, prefersLight: boolean): TableTheme {
  if (r.theme === 'classic') return 'felt';
  if (r.theme === 'minimal') {
    if (r.colorMode === 'light') return 'paper';
    if (r.colorMode === 'dark') return 'studio';
    return prefersLight ? 'paper' : 'studio';
  }
  return DEFAULT_SETTINGS.table;
}

export function parseSettings(raw: unknown, prefersLight = false): Settings {
  const r = asRecord(raw);
  const d = DEFAULT_SETTINGS;
  // v1.1 persisted amber as the default for all players on first load; treat it as unchosen.
  const cardBack = r.autoMove === undefined && r.cardBack === 'amber' ? 'deco' : oneOf(r.cardBack, CARD_BACKS, d.cardBack);
  return {
    drawCount: oneOf(r.drawCount, [1, 3] as const, d.drawCount),
    scoring: oneOf(r.scoring, ['standard', 'vegas', 'none'] as const, d.scoring),
    cumulativeVegas: bool(r.cumulativeVegas, d.cumulativeVegas),
    // v1.1's `autoPlay` (default on) is deliberately ignored: from v1.2 nothing moves mid-game unless opted in.
    autoMove: bool(r.autoMove, d.autoMove),
    sound: bool(r.sound, d.sound),
    leftHanded: bool(r.leftHanded, d.leftHanded),
    fourColor: bool(r.fourColor, d.fourColor),
    table: oneOf(r.table, TABLES, migrateTable(r, prefersLight)),
    cardBack,
    animation: oneOf(r.animation, ['normal', 'fast', 'off'] as const, d.animation),
  };
}

export const saveSettings = (s: Settings): void => writeJSON(KEYS.settings, s);

const prefersLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;

export function loadSettings(): Settings {
  const raw = readJSON(KEYS.settings);
  const s = parseSettings(raw, prefersLight());
  const r = asRecord(raw);
  if (raw !== null && (r.table === undefined || r.autoMove === undefined)) saveSettings(s); // persist the one-time v1/v1.1 migration
  return s;
}
