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
  // Hairline keyline inside the edge, as on the CSS face.
  const inset = w * 0.033;
  ctx.strokeStyle = '#0000000d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(inset + 0.5, inset + 0.5, w - 2 * inset - 1, h - 2 * inset - 1, w * 0.043);
  ctx.stroke();
  ctx.fillStyle = pal[suit];
  const top = w * 0.076;
  const cx = w * 0.076 + w * 0.13; // centre of the 0.26w index column
  ctx.font = `600 ${w * 0.26}px ${pal.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '-0.05em';
  ctx.fillText(rankLabel(id), cx, top);
  glyph(ctx, SUIT_PATHS[suit], cx - w * 0.0815, top + w * 0.26 + w * 0.03, w * 0.163);
  glyph(ctx, SUIT_PATHS[suit], w - w * 0.087 - w * 0.48, h - w * 0.087 - w * 0.48, w * 0.48);
}
