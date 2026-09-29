import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rankLabel, suitOf } from '../../src/engine/cards';
import { CardFront } from '../../src/ui/CardFront';
import { SUIT_PATHS } from '../../src/ui/cards/suits';

describe('CardFront', () => {
  it('renders the rank, a suit class and two suit glyphs for every card', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 52; id++) {
      const html = renderToStaticMarkup(createElement(CardFront, { id }));
      expect(html).toContain(`class="face suit-${suitOf(id)}"`);
      expect(html).toContain(`>${rankLabel(id)}</span>`);
      expect(html.split(SUIT_PATHS[suitOf(id)]).length - 1).toBe(2); // index suit + big pip
      seen.add(html);
    }
    expect(seen.size).toBe(52);
  });
});
