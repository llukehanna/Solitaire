import { cardId, type CardId, type Suit } from '../src/engine/cards';
import type { Column, GameState } from '../src/engine/types';

/** 'TH' → ten of hearts, 'AS' → ace of spades */
export function c(code: string): CardId {
  const rank = 'A23456789TJQK'.indexOf(code[0]) + 1;
  if (rank === 0 || !'SHDC'.includes(code[1])) throw new Error(`bad card code ${code}`);
  return cardId(code[1] as Suit, rank);
}

export function cards(codes: string): CardId[] {
  const t = codes.trim();
  return t ? t.split(/\s+/).map(c) : [];
}

/** Foundation pile of `suit` holding ace..rank */
export function upTo(suit: Suit, rank: number): CardId[] {
  return Array.from({ length: rank }, (_, i) => cardId(suit, i + 1));
}

type StateInput = Partial<Omit<GameState, 'tableau'>> & {
  /** columns as [codes bottom→top, faceUpFrom] */
  cols?: [string, number][];
  tableau?: Column[];
};

export function makeState(p: StateInput): GameState {
  const { cols, tableau, ...rest } = p;
  const t: Column[] = tableau ?? (cols ?? []).map(([codes, faceUpFrom]) => ({ cards: cards(codes), faceUpFrom }));
  while (t.length < 7) t.push({ cards: [], faceUpFrom: 0 });
  return {
    seed: 0,
    drawCount: 1,
    scoring: 'standard',
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    recycles: 0,
    score: 0,
    moves: 0,
    ...rest,
    tableau: t,
  };
}
