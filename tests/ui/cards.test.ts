import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { cardCode, rankLabel } from '../../src/engine/cards';
import { minimalCardSvg, type Palette } from '../../src/ui/cards/minimal';

const IDS = Array.from({ length: 52 }, (_, i) => i);
const PAL: Palette = { S: '#111111', H: '#cc0000', D: '#0055cc', C: '#008800', face: '#ffffff', edge: '#cccccc' };

describe('vendored classic cards', () => {
  it.each(['classic', 'classic-4c'])('%s has 52 faces and a back', (dir) => {
    for (const id of IDS) {
      const file = `public/cards/${dir}/${cardCode(id)}.svg`;
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`face="${cardCode(id)}"`);
      expect(svg).toContain('width="240"');
    }
    expect(existsSync(`public/cards/${dir}/back.svg`)).toBe(true);
  });
});

describe('minimal renderer', () => {
  it('renders every card as a standalone SVG with its rank and suit colour', () => {
    const seen = new Set<string>();
    for (const id of IDS) {
      const svg = minimalCardSvg(id, PAL);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).toContain(`>${rankLabel(id)}</text>`);
      expect(svg).toContain(`fill:${PAL[(['S', 'H', 'D', 'C'] as const)[Math.floor(id / 13)]]}`);
      seen.add(svg);
    }
    expect(seen.size).toBe(52);
  });
  it('uses CSS variables by default', () => {
    expect(minimalCardSvg(0)).toContain('var(--suit-S)');
  });
});
