import { isRed, rankOf, suitIndex, type CardId } from './cards';
import { parsePile, type GameState, type Move, type PileId } from './types';

/** Recycles allowed per game: unlimited except Vegas (draw-1: 1 pass → 0 recycles; draw-3: 3 passes → 2). */
export function maxRecycles(s: GameState): number {
  if (s.scoring !== 'vegas') return Infinity;
  return s.drawCount === 1 ? 0 : 2;
}

export const canDraw = (s: GameState): boolean => s.stock.length > 0;

export const canRecycle = (s: GameState): boolean =>
  s.stock.length === 0 && s.waste.length > 0 && s.recycles < maxRecycles(s);

/** Tableau building rule: one rank lower, opposite colour. */
export const canStack = (card: CardId, onto: CardId): boolean =>
  rankOf(onto) === rankOf(card) + 1 && isRed(onto) !== isRed(card);

export const canPlayToFoundation = (s: GameState, card: CardId, f: number = suitIndex(card)): boolean =>
  suitIndex(card) === f && s.foundations[f].length === rankOf(card) - 1;

/** The cards that would be lifted from `from`, or null if that pickup is impossible. */
export function movingCards(s: GameState, from: PileId, count: number): CardId[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const p = parsePile(from);
  if (p.kind === 'W') return count === 1 && s.waste.length > 0 ? [s.waste[s.waste.length - 1]] : null;
  if (p.kind === 'F') {
    const f = s.foundations[p.i];
    return f && count === 1 && f.length > 0 ? [f[f.length - 1]] : null;
  }
  const col = s.tableau[p.i];
  if (!col || count > col.cards.length - col.faceUpFrom) return null;
  return col.cards.slice(col.cards.length - count);
}

export function canMove(s: GameState, m: Move): boolean {
  if (m.type === 'draw') return canDraw(s);
  if (m.type === 'recycle') return canRecycle(s);
  if (m.from === m.to) return false;
  const moving = movingCards(s, m.from, m.count);
  if (!moving) return false;
  const to = parsePile(m.to);
  if (to.kind === 'W') return false;
  if (to.kind === 'F') {
    return to.i >= 0 && to.i < 4 && m.count === 1 && parsePile(m.from).kind !== 'F' && canPlayToFoundation(s, moving[0], to.i);
  }
  const col = s.tableau[to.i];
  if (!col) return false;
  if (col.cards.length === 0) return rankOf(moving[0]) === 13;
  return canStack(moving[0], col.cards[col.cards.length - 1]);
}
