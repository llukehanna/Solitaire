import { rankOf, suitIndex, type CardId } from '../engine/cards';
import { applyMove } from '../engine/apply';
import { canDraw, canPlayToFoundation, canRecycle } from '../engine/rules';
import { allFaceUp, isWon } from '../engine/movegen';
import type { GameState, Move, PileId } from '../engine/types';
import { solve } from './solve';

/** The lowest-ranked card (waste top or tableau top) that can go to its foundation. */
export function lowestFoundationMove(s: GameState): Move | null {
  const sources: [PileId, CardId | undefined][] = [['W', s.waste[s.waste.length - 1]]];
  s.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
  let best: Move | null = null;
  let bestRank = Infinity;
  for (const [from, card] of sources) {
    if (card === undefined || !canPlayToFoundation(s, card)) continue;
    if (rankOf(card) < bestRank) {
      bestRank = rankOf(card);
      best = { type: 'move', from, to: `F${suitIndex(card)}`, count: 1 };
    }
  }
  return best;
}

export function autoFinish(s: GameState): Move[] | null {
  if (isWon(s) || !allFaceUp(s)) return null;

  const moves: Move[] = [];
  let cur = s;
  let idle = 0;
  while (!isWon(cur)) {
    const m = lowestFoundationMove(cur);
    if (m) {
      cur = applyMove(cur, m);
      moves.push(m);
      idle = 0;
      continue;
    }
    const step: Move | null = canDraw(cur) ? { type: 'draw' } : canRecycle(cur) ? { type: 'recycle' } : null;
    if (!step || idle > cur.stock.length + cur.waste.length + 1) break;
    cur = applyMove(cur, step);
    moves.push(step);
    idle++;
  }
  if (isWon(cur)) return moves;

  const r = solve(s, { maxNodes: 50_000, limitRecycles: true });
  return r.status === 'winnable' ? r.solution : null;
}
