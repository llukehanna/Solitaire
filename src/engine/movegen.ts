import { isRed, rankOf, suitIndex, type CardId } from './cards';
import { applyMove } from './apply';
import { canDraw, canMove, canPlayToFoundation, canRecycle } from './rules';
import { FOUNDATION_IDS, TABLEAU_IDS, type GameState, type Move, type PileId } from './types';

const DESTINATIONS: PileId[] = [...FOUNDATION_IDS, ...TABLEAU_IDS];

export function legalMoves(s: GameState): Move[] {
  const out: Move[] = [];
  if (canDraw(s)) out.push({ type: 'draw' });
  if (canRecycle(s)) out.push({ type: 'recycle' });
  const sources: { from: PileId; count: number }[] = [];
  if (s.waste.length) sources.push({ from: 'W', count: 1 });
  s.foundations.forEach((f, i) => {
    if (f.length) sources.push({ from: `F${i}`, count: 1 });
  });
  s.tableau.forEach((col, i) => {
    for (let n = 1; n <= col.cards.length - col.faceUpFrom; n++) sources.push({ from: `T${i}`, count: n });
  });
  for (const src of sources) {
    for (const to of DESTINATIONS) {
      const m: Move = { type: 'move', from: src.from, to, count: src.count };
      if (canMove(s, m)) out.push(m);
    }
  }
  return out;
}

/** Legal destinations for a pickup, best first: foundations, non-empty tableau (left→right), empty tableau. */
export function destinationsFor(s: GameState, from: PileId, count: number): PileId[] {
  const legal = DESTINATIONS.filter((to) => canMove(s, { type: 'move', from, to, count }));
  const rank = (to: PileId) => (to[0] === 'F' ? 0 : s.tableau[Number(to.slice(1))].cards.length ? 1 : 2);
  return legal.sort((a, b) => rank(a) - rank(b));
}

export const isWon = (s: GameState): boolean => s.foundations.every((f) => f.length === 13);

export const allFaceUp = (s: GameState): boolean => s.tableau.every((col) => col.faceUpFrom === 0);

/** Safe = can never be needed in the tableau: rank ≤ 2, or both opposite-colour foundations are at ≥ rank − 1. */
export function isSafeToFoundation(s: GameState, card: CardId): boolean {
  const r = rankOf(card);
  if (r <= 2) return true;
  const opposite = isRed(card) ? [0, 3] : [1, 2];
  return opposite.every((f) => s.foundations[f].length >= r - 1);
}

export function nextSafeMove(s: GameState, includeWaste = true): Move | null {
  const sources: [PileId, CardId | undefined][] = [];
  if (includeWaste) sources.push(['W', s.waste[s.waste.length - 1]]);
  s.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
  for (const [from, card] of sources) {
    if (card === undefined) continue;
    if (canPlayToFoundation(s, card) && isSafeToFoundation(s, card)) {
      return { type: 'move', from, to: `F${suitIndex(card)}`, count: 1 };
    }
  }
  return null;
}

export function applySafeMoves(s: GameState, includeWaste = true): { state: GameState; moves: Move[] } {
  const moves: Move[] = [];
  let cur = s;
  for (let m = nextSafeMove(cur, includeWaste); m; m = nextSafeMove(cur, includeWaste)) {
    cur = applyMove(cur, m);
    moves.push(m);
  }
  return { state: cur, moves };
}
