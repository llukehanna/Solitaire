import type { CardId } from './cards';

export type DrawCount = 1 | 3;
export type Scoring = 'standard' | 'vegas' | 'none';

export interface Column {
  /** cards[0] is the bottom card, cards[length - 1] the top. */
  cards: CardId[];
  /** Card i is face up iff i >= faceUpFrom. Empty column: 0. */
  faceUpFrom: number;
}

export interface GameState {
  seed: number;
  drawCount: DrawCount;
  scoring: Scoring;
  /** Face-down stock; last element is the top card. */
  stock: CardId[];
  /** Face-up waste; last element is the top (playable) card. */
  waste: CardId[];
  /** Four foundations indexed by suitIndex (S, H, D, C); last element is the top. */
  foundations: CardId[][];
  tableau: Column[];
  recycles: number;
  score: number;
  moves: number;
}

export type PileId = 'W' | `F${number}` | `T${number}`;

export type Move =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: PileId; to: PileId; count: number };

export type PileRef = { kind: 'W' } | { kind: 'F'; i: number } | { kind: 'T'; i: number };

export function parsePile(id: PileId): PileRef {
  if (id === 'W') return { kind: 'W' };
  const i = Number(id.slice(1));
  return id[0] === 'F' ? { kind: 'F', i } : { kind: 'T', i };
}

export const FOUNDATION_IDS: PileId[] = ['F0', 'F1', 'F2', 'F3'];
export const TABLEAU_IDS: PileId[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
