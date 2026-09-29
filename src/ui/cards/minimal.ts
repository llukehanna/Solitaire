import { rankLabel, rankOf, suitOf, type CardId, type Suit } from '../../engine/cards';

export interface Palette {
  S: string;
  H: string;
  D: string;
  C: string;
  face: string;
  edge: string;
}

export const CSS_PALETTE: Palette = {
  S: 'var(--suit-S)',
  H: 'var(--suit-H)',
  D: 'var(--suit-D)',
  C: 'var(--suit-C)',
  face: 'var(--card-face)',
  edge: 'var(--card-edge)',
};

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Suit shapes drawn in a 100×100 box. */
export const SUIT_PATHS: Record<Suit, string> = {
  S: 'M50 2C62 24 98 42 98 66C98 80 87 89 75 89C66 89 58 85 54 78C55 88 59 95 67 100H33C41 95 45 88 46 78C42 85 34 89 25 89C13 89 2 80 2 66C2 42 38 24 50 2Z',
  H: 'M50 94C22 72 2 54 2 30C2 14 14 3 28 3C38 3 46 9 50 18C54 9 62 3 72 3C86 3 98 14 98 30C98 54 78 72 50 94Z',
  D: 'M50 2L90 50L50 98L10 50Z',
  C: `${circle(50, 27, 21)}${circle(27, 58, 21)}${circle(73, 58, 21)}M44 54H56C56 76 60 88 70 100H30C40 88 44 76 44 54Z`,
};

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const cache = new Map<string, string>();

/** Large-index card: big rank top-left, suit top-right (both visible when fanned), big centre suit or court letter. */
export function minimalCardSvg(id: CardId, pal: Palette = CSS_PALETTE): string {
  const key = `${id}|${pal.S}|${pal.H}|${pal.D}|${pal.C}|${pal.face}|${pal.edge}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const suit = suitOf(id);
  const color = pal[suit];
  const label = rankLabel(id);
  const pip = (cx: number, cy: number, size: number) =>
    `<path d="${SUIT_PATHS[suit]}" style="fill:${color}" transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})"/>`;
  const text = (x: number, y: number, size: number, anchor: string, content: string) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="${anchor}" font-family="${FONT}" style="fill:${color}">${content}</text>`;

  const centre = rankOf(id) > 10 ? text(120, 262, 140, 'middle', label) : pip(120, 205, 120);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" width="240" height="336">` +
    `<rect x="2" y="2" width="236" height="332" rx="18" style="fill:${pal.face};stroke:${pal.edge};stroke-width:3"/>` +
    text(18, 72, label.length > 1 ? 62 : 72, 'start', label) +
    pip(200, 46, 54) +
    centre +
    `</svg>`;
  cache.set(key, svg);
  return svg;
}
