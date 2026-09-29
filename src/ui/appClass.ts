import type { Settings, TableTheme } from '../store/settings';

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const effectiveAnimation = (s: Settings) => (prefersReducedMotion() ? 'off' : s.animation);

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
