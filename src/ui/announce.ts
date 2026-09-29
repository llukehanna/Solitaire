import { cardName } from '../engine/cards';
import { applyMove } from '../engine/apply';
import { canRecycle, movingCards } from '../engine/rules';
import type { GameState, Move, PileId } from '../engine/types';
import type { Hint, Selection } from './types';

function destination(to: string): string {
  if (to[0] === 'F') return 'the foundation';
  return `column ${Number(to.slice(1)) + 1}`;
}

function describeCards(s: GameState, from: PileId, count: number): string {
  const lifted = movingCards(s, from, count) ?? [];
  if (!lifted.length) return 'a card';
  return lifted.length > 1 ? `${cardName(lifted[0])} and ${lifted.length - 1} more` : cardName(lifted[0]);
}

/** Spoken content of a hint for the aria-live region. */
export function describeHint(s: GameState, hint: Hint): string {
  if (hint.kind === 'stock') return s.stock.length === 0 && canRecycle(s) ? 'Hint: turn the waste back over.' : 'Hint: draw from the stock.';
  return `Hint: move ${describeCards(s, hint.from, hint.count)} to ${destination(hint.to)}.`;
}

/** Spoken description of a freshly picked-up selection. */
export function describePickup(s: GameState, sel: Selection): string {
  return `Picked up ${describeCards(s, sel.from, sel.count)}.`;
}

/** Plain-language description of a turn for the aria-live region. */
export function describeTurn(before: GameState, moves: Move[]): string {
  const parts: string[] = [];
  let cur = before;
  for (const m of moves) {
    if (m.type === 'draw') {
      const next = applyMove(cur, m);
      parts.push(`Drew ${cardName(next.waste[next.waste.length - 1])}.`);
      cur = next;
      continue;
    }
    if (m.type === 'recycle') {
      parts.push('Turned the waste back over.');
      cur = applyMove(cur, m);
      continue;
    }
    const what = describeCards(cur, m.from, m.count);
    const next = applyMove(cur, m);
    parts.push(`Moved ${what} to ${destination(m.to)}.`);
    if (m.from[0] === 'T') {
      const i = Number(m.from.slice(1));
      const was = cur.tableau[i];
      const now = next.tableau[i];
      if (now.cards.length && now.faceUpFrom < was.faceUpFrom) parts.push(`Revealed ${cardName(now.cards[now.cards.length - 1])}.`);
    }
    cur = next;
  }
  return parts.join(' ');
}
