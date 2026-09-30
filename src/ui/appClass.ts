import type { AnimationSpeed, Settings, TableTheme } from '../store/settings';

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const FINISH_STEP_MS: Record<AnimationSpeed, number> = { normal: 110, fast: 70, off: 0 };
export const MOVE_MS: Record<AnimationSpeed, number> = { normal: 240, fast: 130, off: 0 };
export const FLIP_MS: Record<AnimationSpeed, number> = { normal: 240, fast: 150, off: 0 };

/** Reduced motion shortens animation rather than removing it, so the auto-finish stays watchable; only the setting turns it off. */
export const effectiveAnimation = (s: Settings): AnimationSpeed =>
  prefersReducedMotion() && s.animation === 'normal' ? 'fast' : s.animation;

/** The bouncing-card cascade is pure decoration: skip it for Animation: Off and for reduced motion. */
export const celebrationAllowed = (s: Settings): boolean => s.animation !== 'off' && !prefersReducedMotion();

/** Base colour of each table, for <meta name="theme-color">. */
export const TABLE_BASE: Record<TableTheme, string> = { studio: '#131110', felt: '#0c241b', paper: '#e9e6e0' };

export function appClassName(s: Settings): string {
  return [
    'app',
    `table-${s.table}`,
    `back-${s.cardBack}`,
    `anim-${effectiveAnimation(s)}`,
    s.fourColor ? 'four-color' : '',
    s.leftHanded ? 'left-handed' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
