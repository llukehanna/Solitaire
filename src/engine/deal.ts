import { shuffledDeck } from './rng';
import type { Column, DrawCount, GameState, Scoring } from './types';

export function deal(seed: number, drawCount: DrawCount, scoring: Scoring): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Column[] = [];
  let k = 0;
  for (let i = 0; i < 7; i++) {
    tableau.push({ cards: deck.slice(k, k + i + 1), faceUpFrom: i });
    k += i + 1;
  }
  return {
    seed,
    drawCount,
    scoring,
    stock: deck.slice(k),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    recycles: 0,
    score: scoring === 'vegas' ? -52 : 0,
    moves: 0,
  };
}
