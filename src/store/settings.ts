import type { DrawCount, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export type Theme = 'classic' | 'minimal';
export type ColorMode = 'auto' | 'light' | 'dark';
export type AnimationSpeed = 'normal' | 'fast' | 'off';

export interface Settings {
  drawCount: DrawCount;
  scoring: Scoring;
  cumulativeVegas: boolean;
  autoPlay: boolean;
  sound: boolean;
  leftHanded: boolean;
  fourColor: boolean;
  theme: Theme;
  colorMode: ColorMode;
  animation: AnimationSpeed;
}

export const DEFAULT_SETTINGS: Settings = {
  drawCount: 1,
  scoring: 'standard',
  cumulativeVegas: false,
  autoPlay: true,
  sound: true,
  leftHanded: false,
  fourColor: false,
  theme: 'classic',
  colorMode: 'auto',
  animation: 'normal',
};

const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function parseSettings(raw: unknown): Settings {
  const r = asRecord(raw);
  const d = DEFAULT_SETTINGS;
  return {
    drawCount: oneOf(r.drawCount, [1, 3] as const, d.drawCount),
    scoring: oneOf(r.scoring, ['standard', 'vegas', 'none'] as const, d.scoring),
    cumulativeVegas: bool(r.cumulativeVegas, d.cumulativeVegas),
    autoPlay: bool(r.autoPlay, d.autoPlay),
    sound: bool(r.sound, d.sound),
    leftHanded: bool(r.leftHanded, d.leftHanded),
    fourColor: bool(r.fourColor, d.fourColor),
    theme: oneOf(r.theme, ['classic', 'minimal'] as const, d.theme),
    colorMode: oneOf(r.colorMode, ['auto', 'light', 'dark'] as const, d.colorMode),
    animation: oneOf(r.animation, ['normal', 'fast', 'off'] as const, d.animation),
  };
}

export const loadSettings = (): Settings => parseSettings(readJSON(KEYS.settings));
export const saveSettings = (s: Settings): void => writeJSON(KEYS.settings, s);
