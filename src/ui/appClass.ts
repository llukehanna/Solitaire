import type { Settings } from '../store/settings';

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const effectiveAnimation = (s: Settings) => (prefersReducedMotion() ? 'off' : s.animation);

export function appClassName(s: Settings): string {
  return [
    'app',
    `theme-${s.theme}`,
    `mode-${s.colorMode}`,
    `anim-${effectiveAnimation(s)}`,
    s.fourColor ? 'four-color' : '',
    s.leftHanded ? 'left-handed' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
