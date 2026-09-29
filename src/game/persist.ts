import { applyMove } from '../engine/apply';
import { isWon } from '../engine/movegen';
import { canMove } from '../engine/rules';
import type { DrawCount, GameState, Move, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from '../store/storage';
import { newSession, type Session } from './session';
import { elapsed } from './timer';

export interface SavedGame {
  v: 1;
  seed: number;
  drawCount: DrawCount;
  scoring: Scoring;
  turns: Move[][];
  redo: Move[][];
  undos: number;
  elapsedMs: number;
}

export function toSaved(s: Session, now: number): SavedGame {
  return {
    v: 1,
    seed: s.seed,
    drawCount: s.drawCount,
    scoring: s.scoring,
    turns: s.turns,
    redo: s.redo,
    undos: s.undos,
    elapsedMs: Math.round(elapsed(s.timer, now)),
  };
}

const PILE = /^(W|F[0-3]|T[0-6])$/;

export function isMove(x: unknown): x is Move {
  const r = asRecord(x);
  if (r.type === 'draw' || r.type === 'recycle') return Object.keys(r).length === 1;
  return (
    r.type === 'move' &&
    typeof r.from === 'string' && PILE.test(r.from) &&
    typeof r.to === 'string' && PILE.test(r.to) &&
    Number.isInteger(r.count) && (r.count as number) >= 1 && (r.count as number) <= 13
  );
}

const isTurnList = (v: unknown): v is Move[][] => Array.isArray(v) && v.every((t) => Array.isArray(t) && t.every(isMove));

export function fromSaved(raw: unknown): Session | null {
  const r = asRecord(raw);
  if (
    r.v !== 1 ||
    !Number.isInteger(r.seed) ||
    (r.drawCount !== 1 && r.drawCount !== 3) ||
    !['standard', 'vegas', 'none'].includes(r.scoring as string) ||
    !isTurnList(r.turns) ||
    !isTurnList(r.redo) ||
    !Number.isInteger(r.undos) ||
    typeof r.elapsedMs !== 'number' || !(r.elapsedMs >= 0)
  ) {
    return null;
  }
  const base = newSession(r.seed as number, r.drawCount as DrawCount, r.scoring as Scoring);
  const history: GameState[] = [];
  let state = base.state;
  for (const turn of r.turns) {
    history.push(state);
    for (const m of turn) {
      if (!canMove(state, m)) return null;
      state = applyMove(state, m);
    }
  }
  return {
    ...base,
    state,
    history,
    turns: r.turns,
    redo: r.redo,
    undos: r.undos as number,
    timer: { accumulatedMs: r.elapsedMs, runningSince: null },
    status: isWon(state) ? 'won' : 'playing',
  };
}

export const loadSavedGame = (): Session | null => fromSaved(readJSON(KEYS.game));
export const saveGame = (s: Session, now: number): void => writeJSON(KEYS.game, toSaved(s, now));
