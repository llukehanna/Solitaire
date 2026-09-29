import type { Suit } from '../../engine/cards';

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Suit shapes drawn in a 100×100 box. */
export const SUIT_PATHS: Record<Suit, string> = {
  S: 'M50 2C62 24 98 42 98 66C98 80 87 89 75 89C66 89 58 85 54 78C55 88 59 95 67 100H33C41 95 45 88 46 78C42 85 34 89 25 89C13 89 2 80 2 66C2 42 38 24 50 2Z',
  H: 'M50 94C22 72 2 54 2 30C2 14 14 3 28 3C38 3 46 9 50 18C54 9 62 3 72 3C86 3 98 14 98 30C98 54 78 72 50 94Z',
  D: 'M50 2L90 50L50 98L10 50Z',
  C: `${circle(50, 27, 21)}${circle(27, 58, 21)}${circle(73, 58, 21)}M44 54H56C56 76 60 88 70 100H30C40 88 44 76 44 54Z`,
};
