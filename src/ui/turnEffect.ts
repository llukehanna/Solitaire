import type { GameState } from '../engine/types';

export type TurnEffect = 'draw' | 'recycle' | 'flip' | 'foundation' | 'move';

const onFoundations = (s: GameState) => s.foundations.reduce((n, f) => n + f.length, 0);
const faceDown = (s: GameState) => s.tableau.reduce((n, c) => n + c.faceUpFrom, 0);

export function turnEffect(prev: GameState, next: GameState): TurnEffect | null {
  if (prev === next || next.moves === 0) return null;
  if (next.recycles > prev.recycles) return 'recycle';
  if (faceDown(next) < faceDown(prev)) return 'flip';
  if (onFoundations(next) > onFoundations(prev)) return 'foundation';
  if (next.stock.length < prev.stock.length && next.waste.length > prev.waste.length) return 'draw';
  return 'move';
}
