import { canMove } from '../engine/rules';
import type { GameState, Move, PileId } from '../engine/types';
import type { PileKey } from './layout';
import type { Focus, Selection } from './types';

export const PILE_ORDER: PileKey[] = ['S', 'W', 'F0', 'F1', 'F2', 'F3', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

export function pileCards(s: GameState, pile: PileKey) {
  if (pile === 'S') return s.stock;
  if (pile === 'W') return s.waste;
  const i = Number(pile.slice(1));
  return pile[0] === 'F' ? s.foundations[i] : s.tableau[i].cards;
}

export const topIndex = (s: GameState, pile: PileKey): number => pileCards(s, pile).length - 1;

export function clampFocus(s: GameState, f: Focus): Focus {
  const top = topIndex(s, f.pile);
  if (f.pile[0] !== 'T') return { pile: f.pile, index: top };
  const col = s.tableau[Number(f.pile.slice(1))];
  if (top < 0) return { pile: f.pile, index: -1 };
  return { pile: f.pile, index: Math.min(top, Math.max(col.faceUpFrom, f.index)) };
}

/** Column under each top-row pile (for Down) and the top-row pile above each column (for Up). */
const BELOW: Record<string, PileId> = { S: 'T0', W: 'T1', F0: 'T3', F1: 'T4', F2: 'T5', F3: 'T6' };
const ABOVE: PileKey[] = ['S', 'W', 'W', 'F0', 'F1', 'F2', 'F3'];

export function stepFocus(s: GameState, f: Focus | null, dir: 'left' | 'right' | 'up' | 'down'): Focus {
  const at = (pile: PileKey): Focus => ({ pile, index: topIndex(s, pile) });
  if (!f) return at('T0');
  if (dir === 'left' || dir === 'right') {
    const n = PILE_ORDER.length;
    const i = PILE_ORDER.indexOf(f.pile);
    return at(PILE_ORDER[(i + (dir === 'right' ? 1 : n - 1)) % n]);
  }
  if (f.pile[0] !== 'T') return dir === 'down' ? at(BELOW[f.pile]) : f;
  const ci = Number(f.pile.slice(1));
  const col = s.tableau[ci];
  if (dir === 'up') return f.index > col.faceUpFrom ? { ...f, index: f.index - 1 } : at(ABOVE[ci]);
  return { ...f, index: Math.min(col.cards.length - 1, f.index + 1) };
}

export type Activation =
  | { action: 'stock' }
  | { action: 'select'; selection: Selection }
  | { action: 'move'; move: Move }
  | { action: 'cancel' }
  | { action: 'reject' };

export function activate(s: GameState, f: Focus, selection: Selection | null): Activation {
  if (f.pile === 'S') return { action: 'stock' };
  if (selection) {
    if (f.pile === selection.from) return { action: 'cancel' };
    const move: Move = { type: 'move', from: selection.from, to: f.pile, count: selection.count };
    return canMove(s, move) ? { action: 'move', move } : { action: 'reject' };
  }
  const top = topIndex(s, f.pile);
  if (f.index < 0 || top < 0) return { action: 'reject' };
  if (f.pile[0] !== 'T') return f.index === top ? { action: 'select', selection: { from: f.pile, count: 1 } } : { action: 'reject' };
  const col = s.tableau[Number(f.pile.slice(1))];
  if (f.index < col.faceUpFrom) return { action: 'reject' };
  return { action: 'select', selection: { from: f.pile, count: col.cards.length - f.index } };
}
