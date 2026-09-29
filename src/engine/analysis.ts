import { rankOf } from './cards';
import { destinationsFor } from './movegen';
import { canDraw, canPlayToFoundation, canRecycle } from './rules';
import { drawSequence, jumpToStock, reachableStockPositions } from './stock';
import type { GameState, Move, PileId } from './types';

function kingCouldUseEmptyColumn(s: GameState, exceptCol: number): boolean {
  if (drawSequence(s).some((card) => rankOf(card) === 13)) return true;
  return s.tableau.some(
    (col, i) => i !== exceptCol && col.cards.some((card, idx) => idx > 0 && idx >= col.faceUpFrom && rankOf(card) === 13),
  );
}

const toTableau = (dests: PileId[]) => dests.filter((d) => d[0] === 'T');

/** Moves available right now (no stock movement), best first. Only "productive" moves are returned. */
function productiveMovesNow(s: GameState): Move[] {
  const out: Move[] = [];
  const reveal: { m: Move; hidden: number }[] = [];
  const mv = (from: PileId, to: PileId, count: number): Move => ({ type: 'move', from, to, count });

  s.tableau.forEach((col, i) => {
    const top = col.cards[col.cards.length - 1];
    if (top !== undefined && canPlayToFoundation(s, top)) out.push(mv(`T${i}`, `F${Math.floor(top / 13)}`, 1));
  });
  const wasteTop = s.waste[s.waste.length - 1];
  if (wasteTop !== undefined && canPlayToFoundation(s, wasteTop)) out.push(mv('W', `F${Math.floor(wasteTop / 13)}`, 1));

  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    if (!up) return;
    const dests = toTableau(destinationsFor(s, `T${i}`, up));
    if (!dests.length) return;
    if (col.faceUpFrom > 0) reveal.push({ m: mv(`T${i}`, dests[0], up), hidden: col.faceUpFrom });
  });
  reveal.sort((a, b) => b.hidden - a.hidden).forEach((r) => out.push(r.m));

  if (wasteTop !== undefined) {
    const dests = toTableau(destinationsFor(s, 'W', 1));
    if (dests.length) out.push(mv('W', dests[0], 1));
  }

  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    for (let n = 1; n < up; n++) {
      const exposed = col.cards[col.cards.length - n - 1];
      const dests = toTableau(destinationsFor(s, `T${i}`, n));
      if (dests.length && canPlayToFoundation(s, exposed)) out.push(mv(`T${i}`, dests[0], n));
    }
    if (up && col.faceUpFrom === 0) {
      const dests = toTableau(destinationsFor(s, `T${i}`, up)).filter((d) => s.tableau[Number(d.slice(1))].cards.length > 0);
      if (dests.length && kingCouldUseEmptyColumn(s, i)) out.push(mv(`T${i}`, dests[0], up));
    }
  });
  return out;
}

/** True if some move other than pointless stock cycling or shuffling would make progress. */
export function hasProductiveMove(s: GameState): boolean {
  if (productiveMovesNow(s).length) return true;
  const seq = drawSequence(s);
  for (const pos of reachableStockPositions(s)) {
    if (pos.p === 0 || pos.path.length === 0) continue;
    const at = jumpToStock(s, pos);
    const card = seq[pos.p - 1];
    if (canPlayToFoundation(at, card) || toTableau(destinationsFor(at, 'W', 1)).length) return true;
  }
  return false;
}

/** Best-effort hint without search. Null iff there is no productive move. */
export function heuristicHint(s: GameState): Move | null {
  const now = productiveMovesNow(s);
  if (now.length) return now[0];
  if (!hasProductiveMove(s)) return null;
  if (canDraw(s)) return { type: 'draw' };
  if (canRecycle(s)) return { type: 'recycle' };
  return null;
}
