import { applyMove } from '../engine/apply';
import type { CardId } from '../engine/cards';
import type { GameState, Move } from '../engine/types';

/**
 * Cards the player took off a foundation that haven't gone back up since. Auto-play leaves them alone so a card
 * pulled down to build on actually stays down. Derived from the turn history, so undo/redo/restore need no extra state.
 */
export function heldBackCards(start: GameState, turns: readonly Move[][]): Set<CardId> {
  const held = new Set<CardId>();
  let s = start;
  for (const turn of turns) {
    for (const m of turn) {
      const next = applyMove(s, m);
      if (m.type === 'move' && m.from[0] === 'F') {
        const f = s.foundations[Number(m.from.slice(1))];
        held.add(f[f.length - 1]);
      }
      if (m.type === 'move' && m.to[0] === 'F') {
        const f = next.foundations[Number(m.to.slice(1))];
        held.delete(f[f.length - 1]);
      }
      s = next;
    }
  }
  return held;
}
