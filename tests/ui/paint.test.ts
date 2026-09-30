import { beforeAll, describe, it, expect } from 'vitest';
import { cardId } from '../../src/engine/cards';

type Call = [string, unknown[]];

function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, k) => (k in target ? target[k as string] : (...args: unknown[]) => void calls.push([String(k), args])),
    set: (target, k, v) => ((target[k as string] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(public d: string) {}
  };
});

describe('paintFace', () => {
  it('draws the index and big pip at the CSS proportions', async () => {
    const { paintFace } = await import('../../src/ui/cards/paint');
    const { ctx, calls } = fakeCtx();
    const w = 100;
    const h = 140;
    paintFace(ctx, cardId('H', 13), w, h, { face: '#fbf8f2', S: '#000', H: '#c00', D: '#c00', C: '#000', font: 'Geist' });
    const text = calls.find(([k]) => k === 'fillText')!;
    expect(text[1][0]).toBe('K');
    expect(text[1][1]).toBeCloseTo(0.076 * w + 0.13 * w); // centre of the 0.26w index column
    expect(text[1][2]).toBeCloseTo(0.076 * w);
    const translates = calls.filter(([k]) => k === 'translate').map(([, a]) => a as number[]);
    const pip = translates[translates.length - 1];
    expect(pip[0]).toBeCloseTo(w - 0.087 * w - 0.48 * w);
    expect(pip[1]).toBeCloseTo(h - 0.087 * w - 0.48 * w);
    expect(ctx.font).toBe(`600 ${0.26 * w}px Geist`);
  });
});
