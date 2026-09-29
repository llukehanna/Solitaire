import { rankLabel, suitOf, type CardId } from '../../engine/cards';
import { SUIT_PATHS } from './suits';

export interface FacePalette {
  face: string;
  S: string;
  H: string;
  D: string;
  C: string;
  font: string;
}

const paths = new Map<string, Path2D>();
const suitPath = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

function glyph(ctx: CanvasRenderingContext2D, d: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.fill(suitPath(d));
  ctx.restore();
}

/** Canvas twin of CardFront (same proportions as the .face CSS), used by the win cascade. */
export function paintFace(ctx: CanvasRenderingContext2D, id: CardId, w: number, h: number, pal: FacePalette): void {
  const suit = suitOf(id);
  ctx.fillStyle = pal.face;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.055);
  ctx.fill();
  ctx.fillStyle = pal[suit];
  const cx = w * 0.08 + w * 0.14; // centre of the index column
  ctx.font = `600 ${w * 0.28}px ${pal.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(rankLabel(id), cx, h * 0.06);
  glyph(ctx, SUIT_PATHS[suit], cx - w * 0.095, h * 0.06 + w * 0.3, w * 0.19);
  glyph(ctx, SUIT_PATHS[suit], w * 0.92 - w * 0.47, h * 0.94 - w * 0.47, w * 0.47);
}
