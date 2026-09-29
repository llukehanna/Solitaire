import type { CardId } from './cards';
import { canMove } from './rules';
import { parsePile, type GameState, type Move, type PileRef } from './types';

function scoreDelta(s: GameState, from: PileRef['kind'], to: PileRef['kind'], flipped: boolean): number {
  if (s.scoring === 'none') return 0;
  if (s.scoring === 'vegas') return to === 'F' ? 5 : from === 'F' ? -5 : 0;
  let d = 0;
  if (from === 'W' && to === 'T') d += 5;
  if (to === 'F') d += 10;
  if (from === 'F' && to === 'T') d -= 15;
  if (flipped) d += 5;
  return d;
}

const addScore = (s: GameState, delta: number): number =>
  s.scoring === 'standard' ? Math.max(0, s.score + delta) : s.score + delta;

/** Pure: returns a new state; untouched piles are shared with the input. Throws on illegal moves. */
export function applyMove(s: GameState, m: Move): GameState {
  if (!canMove(s, m)) throw new Error(`Illegal move: ${JSON.stringify(m)}`);
  const moves = s.moves + 1;

  if (m.type === 'draw') {
    const n = Math.min(s.drawCount, s.stock.length);
    const drawn = s.stock.slice(s.stock.length - n).reverse();
    return { ...s, stock: s.stock.slice(0, s.stock.length - n), waste: [...s.waste, ...drawn], moves };
  }

  if (m.type === 'recycle') {
    const penalty = s.scoring === 'standard' ? (s.drawCount === 1 ? -100 : -20) : 0;
    return { ...s, stock: [...s.waste].reverse(), waste: [], recycles: s.recycles + 1, score: addScore(s, penalty), moves };
  }

  const from = parsePile(m.from);
  const to = parsePile(m.to);
  const next: GameState = { ...s, moves, tableau: s.tableau.slice(), foundations: s.foundations.slice() };
  let moving: CardId[];
  let flipped = false;

  if (from.kind === 'W') {
    moving = [s.waste[s.waste.length - 1]];
    next.waste = s.waste.slice(0, -1);
  } else if (from.kind === 'F') {
    const f = s.foundations[from.i];
    moving = [f[f.length - 1]];
    next.foundations[from.i] = f.slice(0, -1);
  } else {
    const col = s.tableau[from.i];
    const keep = col.cards.length - m.count;
    moving = col.cards.slice(keep);
    let faceUpFrom = col.faceUpFrom;
    if (keep === 0) faceUpFrom = 0;
    else if (col.faceUpFrom >= keep) {
      faceUpFrom = keep - 1;
      flipped = true;
    }
    next.tableau[from.i] = { cards: col.cards.slice(0, keep), faceUpFrom };
  }

  if (to.kind === 'F') {
    next.foundations[to.i] = [...s.foundations[to.i], ...moving];
  } else if (to.kind === 'T') {
    const col = next.tableau[to.i];
    next.tableau[to.i] = { cards: [...col.cards, ...moving], faceUpFrom: col.cards.length === 0 ? 0 : col.faceUpFrom };
  }

  next.score = addScore(s, scoreDelta(s, from.kind, to.kind, flipped));
  return next;
}

export function applyMoves(s: GameState, ms: readonly Move[]): GameState {
  let cur = s;
  for (const m of ms) cur = applyMove(cur, m);
  return cur;
}
