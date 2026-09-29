import { afterEach, describe, it, expect, vi } from 'vitest';
import { appClassName, celebrationAllowed, effectiveAnimation, FINISH_STEP_MS, FLIP_MS, MOVE_MS } from '../../src/ui/appClass';
import { DEFAULT_SETTINGS } from '../../src/store/settings';

describe('appClassName', () => {
  it('carries the table and card back', () => {
    const cls = appClassName({ ...DEFAULT_SETTINGS, table: 'paper', cardBack: 'ink', fourColor: true }).split(' ');
    expect(cls).toEqual(expect.arrayContaining(['app', 'table-paper', 'back-ink', 'four-color']));
  });
});

const reduceMotion = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduced-motion') }));
afterEach(() => vi.unstubAllGlobals());

describe('animation', () => {
  it('uses the spec timings', () => {
    expect(FINISH_STEP_MS).toEqual({ normal: 110, fast: 70, off: 0 });
    expect(MOVE_MS).toEqual({ normal: 240, fast: 130, off: 0 });
    expect(FLIP_MS).toEqual({ normal: 140, fast: 90, off: 0 });
  });
  it('reduced motion speeds animation up but never turns the finish off', () => {
    reduceMotion(true);
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe('fast');
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'off' })).toBe('off');
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe(false);
  });
  it('without reduced motion the setting is used as-is', () => {
    reduceMotion(false);
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe('normal');
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe(true);
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'off' })).toBe(false);
  });
});
