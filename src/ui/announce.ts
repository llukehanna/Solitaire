import { cardName } from '../engine/cards';
import { applyMove } from '../engine/apply';
import { movingCards } from '../engine/rules';
import type { GameState, Move } from '../engine/types';

function destination(to: string): string {
  if (to[0] === 'F') return 'the foundation';
  return `column ${Number(to.slice(1)) + 1}`;
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
    const lifted = movingCards(cur, m.from, m.count) ?? [];
    const what = lifted.length > 1 ? `${cardName(lifted[0])} and ${lifted.length - 1} more` : cardName(lifted[0]);
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
