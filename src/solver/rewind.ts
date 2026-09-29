import type { GameState } from '../engine/types';

/**
 * Index of the most recent winnable state. Assumes states[0] is winnable (bank deals are) and that
 * once a line is lost it stays lost, so the boundary can be binary-searched.
 */
export function findLastWinnable(states: readonly GameState[], isWinnable: (s: GameState) => boolean): number {
  if (states.length === 0) return -1;
  let lo = 0;
  let hi = states.length - 1;
  if (isWinnable(states[hi])) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (isWinnable(states[mid])) lo = mid;
    else hi = mid;
  }
  return lo;
}
