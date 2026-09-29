import type { CardId } from './cards';
import { maxRecycles } from './rules';
import type { GameState, Move } from './types';

export interface StockPosition {
  /** Number of cards in the waste at this position; the playable card is drawSequence(s)[p - 1]. */
  p: number;
  /** Draws/recycles that reach this position from the current state. */
  path: Move[];
}

/** Waste (bottom→top) followed by the stock in the order it will be drawn. Draws never reorder this. */
export function drawSequence(s: GameState): CardId[] {
  return [...s.waste, ...s.stock.slice().reverse()];
}

export function reachableStockPositions(s: GameState, unlimitedRecycles = false): StockPosition[] {
  const n = s.waste.length + s.stock.length;
  let p = s.waste.length;
  let path: Move[] = [];
  let recyclesLeft = unlimitedRecycles ? Infinity : maxRecycles(s) - s.recycles;
  const seen = new Set<number>();
  const out: StockPosition[] = [];
  while (!seen.has(p)) {
    seen.add(p);
    out.push({ p, path });
    if (p < n) {
      p = Math.min(p + s.drawCount, n);
      path = [...path, { type: 'draw' }];
    } else if (n > 0 && recyclesLeft > 0) {
      recyclesLeft--;
      p = 0;
      path = [...path, { type: 'recycle' }];
    } else break;
  }
  return out;
}

/** Equivalent to applyMoves(s, pos.path) without replaying every draw. */
export function jumpToStock(s: GameState, pos: StockPosition): GameState {
  if (pos.path.length === 0) return s;
  const seq = drawSequence(s);
  const recycles = pos.path.filter((m) => m.type === 'recycle').length;
  const penalty = s.scoring === 'standard' ? (s.drawCount === 1 ? 100 : 20) * recycles : 0;
  return {
    ...s,
    waste: seq.slice(0, pos.p),
    stock: seq.slice(pos.p).reverse(),
    recycles: s.recycles + recycles,
    moves: s.moves + pos.path.length,
    score: s.scoring === 'standard' ? Math.max(0, s.score - penalty) : s.score,
  };
}
