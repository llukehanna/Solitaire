import { isRed, rankOf, suitIndex, type CardId } from '../engine/cards';
import { applyMove, applyMoves } from '../engine/apply';
import { canMove, canPlayToFoundation, maxRecycles } from '../engine/rules';
import { applySafeMoves, isWon } from '../engine/movegen';
import { drawSequence, jumpToStock, reachableStockPositions } from '../engine/stock';
import type { GameState, Move, PileId } from '../engine/types';

export type SolveResult =
  | { status: 'winnable'; solution: Move[]; nodes: number }
  | { status: 'unwinnable'; nodes: number }
  | { status: 'unknown'; nodes: number };

export interface SolveOptions {
  maxNodes: number;
  /** Absolute time (Date.now()) after which the search gives up with 'unknown'. */
  deadline?: number;
  shouldCancel?: () => boolean;
  /**
   * Respect Vegas recycle limits (used by auto-finish). Default: unlimited recycles and scoring is ignored,
   * so the solution is valid for `{ ...state, scoring: 'standard' }` but NOT necessarily for a Vegas state.
   * Callers that must replay a solution against a Vegas state must pass `limitRecycles: true`.
   */
  limitRecycles?: boolean;
}

const recyclesLimited = (s: GameState, limitRecycles: boolean): boolean =>
  limitRecycles && maxRecycles(s) !== Infinity;

export function stateKey(s: GameState, limitRecycles: boolean): string {
  const cols = s.tableau
    .map((col) => `${col.faceUpFrom}:${col.cards.join('.')}`)
    .sort()
    .join('/');
  const found = s.foundations.map((f) => f.length).join('.');
  const seq = drawSequence(s);
  let p = s.waste.length;
  if (recyclesLimited(s, limitRecycles)) return `${found}|${cols}|${seq.join('.')}|${p}|${s.recycles}`;
  if (s.drawCount === 1 || p % 3 === 0 || p === seq.length) p = 0;
  return `${found}|${cols}|${seq.join('.')}|${p}`;
}

/**
 * Stricter safe-to-foundation test for the complete pass, where foundation→tableau moves are allowed:
 * rank ≤ 2, or both opposite-colour foundations ≥ rank−1 and the other same-colour foundation ≥ rank−2.
 * (The engine's isSafeToFoundation is only a dominance when cards can never leave the foundations.)
 */
function strictSafe(s: GameState, card: CardId): boolean {
  const r = rankOf(card);
  if (r <= 2) return true;
  const suit = suitIndex(card);
  const [o1, o2] = isRed(card) ? [0, 3] : [1, 2];
  const sameOther = suit === 0 ? 3 : suit === 3 ? 0 : suit === 1 ? 2 : 1;
  return (
    s.foundations[o1].length >= r - 1 && s.foundations[o2].length >= r - 1 && s.foundations[sameOther].length >= r - 2
  );
}

function strictSafeMoves(s: GameState, includeWaste: boolean): { state: GameState; moves: Move[] } {
  const moves: Move[] = [];
  let cur = s;
  for (;;) {
    let found: Move | null = null;
    const sources: [PileId, CardId | undefined][] = [];
    if (includeWaste) sources.push(['W', cur.waste[cur.waste.length - 1]]);
    cur.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
    for (const [from, card] of sources) {
      if (card !== undefined && canPlayToFoundation(cur, card) && strictSafe(cur, card)) {
        found = mv(from, `F${suitIndex(card)}`, 1);
        break;
      }
    }
    if (!found) return { state: cur, moves };
    cur = applyMove(cur, found);
    moves.push(found);
  }
}

interface Candidate {
  moves: Move[];
  priority: number;
}

const mv = (from: PileId, to: PileId, count: number): Move => ({ type: 'move', from, to, count });

function kingWaiting(s: GameState): boolean {
  if (drawSequence(s).some((card) => rankOf(card) === 13)) return true;
  return s.tableau.some((col) => col.cards.some((card, i) => i > 0 && i >= col.faceUpFrom && rankOf(card) === 13));
}

function candidates(s: GameState, complete: boolean, limitRecycles: boolean): Candidate[] {
  const out: Candidate[] = [];

  s.tableau.forEach((col, i) => {
    const top = col.cards[col.cards.length - 1];
    if (top !== undefined && canPlayToFoundation(s, top)) out.push({ moves: [mv(`T${i}`, `F${suitIndex(top)}`, 1)], priority: 0 });
  });

  const waiting = kingWaiting(s);
  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    for (let n = 1; n <= up; n++) {
      const whole = n === up;
      for (let j = 0; j < 7; j++) {
        if (j === i) continue;
        const m = mv(`T${i}`, `T${j}`, n);
        if (!canMove(s, m)) continue;
        if (whole && col.faceUpFrom > 0) {
          out.push({ moves: [m], priority: 1 - col.faceUpFrom / 100 });
        } else if (whole) {
          if (s.tableau[j].cards.length === 0) continue; // king-led column to another empty column: pointless
          if (complete || waiting) out.push({ moves: [m], priority: 3 });
        } else if (canPlayToFoundation(s, col.cards[col.cards.length - n - 1])) {
          out.push({ moves: [m], priority: 2 });
        } else if (complete) {
          out.push({ moves: [m], priority: 4 });
        }
      }
    }
  });

  const seq = drawSequence(s);
  for (const pos of reachableStockPositions(s, !recyclesLimited(s, limitRecycles))) {
    if (pos.p === 0) continue;
    const card = seq[pos.p - 1];
    const at = pos.path.length ? jumpToStock(s, pos) : s;
    const moved = pos.path.length > 0;
    if (canPlayToFoundation(at, card)) out.push({ moves: [...pos.path, mv('W', `F${suitIndex(card)}`, 1)], priority: moved ? 2.5 : 0.5 });
    for (let j = 0; j < 7; j++) {
      const m = mv('W', `T${j}`, 1);
      if (canMove(at, m)) out.push({ moves: [...pos.path, m], priority: 2.6 });
    }
  }

  if (complete) {
    s.foundations.forEach((f, i) => {
      if (!f.length) return;
      for (let j = 0; j < 7; j++) {
        const m = mv(`F${i}`, `T${j}`, 1);
        if (canMove(s, m)) out.push({ moves: [m], priority: 5 });
      }
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

type Outcome = 'won' | 'exhausted' | 'budget';

class Search {
  nodes = 0;
  readonly path: Move[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly opts: SolveOptions,
    private readonly complete: boolean,
    private readonly budget: number,
  ) {}

  dfs(s: GameState): Outcome {
    const safe = this.complete ? strictSafeMoves(s, s.drawCount === 1) : applySafeMoves(s, s.drawCount === 1);
    this.path.push(...safe.moves);
    const cur = safe.state;
    if (isWon(cur)) return 'won';

    const key = stateKey(cur, !!this.opts.limitRecycles);
    if (this.seen.has(key)) {
      this.path.length -= safe.moves.length;
      return 'exhausted';
    }
    this.seen.add(key);

    if (++this.nodes > this.budget) return 'budget';
    if ((this.nodes & 255) === 0) {
      if (this.opts.deadline !== undefined && Date.now() > this.opts.deadline) return 'budget';
      if (this.opts.shouldCancel?.()) return 'budget';
    }

    for (const c of candidates(cur, this.complete, !!this.opts.limitRecycles)) {
      this.path.push(...c.moves);
      const r = this.dfs(applyMoves(cur, c.moves));
      if (r !== 'exhausted') return r;
      this.path.length -= c.moves.length;
    }
    this.path.length -= safe.moves.length;
    return 'exhausted';
  }
}

export function solve(state: GameState, opts: SolveOptions): SolveResult {
  if (opts.shouldCancel?.() || (opts.deadline !== undefined && Date.now() > opts.deadline)) return { status: 'unknown', nodes: 0 };
  // Scoring never affects legality except Vegas recycle limits; drop it unless limits must be honoured.
  const root: GameState = opts.limitRecycles ? state : { ...state, scoring: 'none' };

  const pruned = new Search(opts, false, opts.maxNodes);
  const r1 = pruned.dfs(root);
  if (r1 === 'won') return { status: 'winnable', solution: pruned.path.slice(), nodes: pruned.nodes };
  if (r1 === 'budget') return { status: 'unknown', nodes: pruned.nodes };

  const full = new Search(opts, true, opts.maxNodes - pruned.nodes);
  const r2 = full.dfs(root);
  const nodes = pruned.nodes + full.nodes;
  if (r2 === 'won') return { status: 'winnable', solution: full.path.slice(), nodes };
  return r2 === 'exhausted' ? { status: 'unwinnable', nodes } : { status: 'unknown', nodes };
}
