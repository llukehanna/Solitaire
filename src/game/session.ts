import { applyMove } from '../engine/apply';
import { deal } from '../engine/deal';
import { allFaceUp, applySafeMoves, isWon } from '../engine/movegen';
import { canMove } from '../engine/rules';
import type { DrawCount, GameState, Move, Scoring } from '../engine/types';
import { autoFinish } from '../solver/autoFinish';
import { newTimer, pauseTimer, startTimer, type Timer } from './timer';

export type Status = 'playing' | 'finishing' | 'won';

export interface Session {
  seed: number;
  drawCount: DrawCount;
  scoring: Scoring;
  state: GameState;
  /** history[i] is the state before turns[i]. */
  history: GameState[];
  turns: Move[][];
  /** Stack of undone turns; the last element is the next redo. */
  redo: Move[][];
  undos: number;
  timer: Timer;
  status: Status;
  /** Moves still to animate while status === 'finishing'. */
  finishQueue: Move[];
}

export type Action =
  | { type: 'new'; seed: number; drawCount: DrawCount; scoring: Scoring }
  | { type: 'restart' }
  | { type: 'turn'; moves: Move[]; autoPlay: boolean; now: number }
  | { type: 'undo' }
  | { type: 'redo'; now: number }
  | { type: 'rewindTo'; index: number }
  | { type: 'finishStep'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'load'; session: Session };

export function newSession(seed: number, drawCount: DrawCount, scoring: Scoring): Session {
  return {
    seed,
    drawCount,
    scoring,
    state: deal(seed, drawCount, scoring),
    history: [],
    turns: [],
    redo: [],
    undos: 0,
    timer: newTimer(),
    status: 'playing',
    finishQueue: [],
  };
}

function tryApply(state: GameState, moves: readonly Move[]): GameState | null {
  let cur = state;
  for (const m of moves) {
    if (!canMove(cur, m)) return null;
    cur = applyMove(cur, m);
  }
  return cur;
}

/** Record `moves` as one turn, then check for a win or an auto-finish. */
function commit(s: Session, moves: Move[], now: number): Session {
  const next = tryApply(s.state, moves);
  if (!next) return s;
  const played: Session = {
    ...s,
    state: next,
    history: [...s.history, s.state],
    turns: [...s.turns, moves],
    timer: startTimer(s.timer, now),
  };
  if (isWon(next)) return { ...played, status: 'won', timer: pauseTimer(played.timer, now) };
  if (allFaceUp(next)) {
    const finish = autoFinish(next);
    if (finish && finish.length) {
      return {
        ...played,
        status: 'finishing',
        finishQueue: finish,
        history: [...played.history, next],
        turns: [...played.turns, finish],
      };
    }
  }
  return played;
}

export function sessionReducer(s: Session, a: Action): Session {
  switch (a.type) {
    case 'new':
      return newSession(a.seed, a.drawCount, a.scoring);
    case 'restart':
      return newSession(s.seed, s.drawCount, s.scoring);
    case 'load':
      return a.session;
    case 'turn': {
      if (s.status !== 'playing' || a.moves.length === 0) return s;
      const played = tryApply(s.state, a.moves);
      if (!played) return s;
      const auto = a.autoPlay ? applySafeMoves(played).moves : [];
      const r = commit(s, [...a.moves, ...auto], a.now);
      return r === s ? s : { ...r, redo: [] };
    }
    case 'undo': {
      if (s.status !== 'playing' || s.history.length === 0) return s;
      return {
        ...s,
        state: s.history[s.history.length - 1],
        history: s.history.slice(0, -1),
        turns: s.turns.slice(0, -1),
        redo: [...s.redo, s.turns[s.turns.length - 1]],
        undos: s.undos + 1,
      };
    }
    case 'redo': {
      if (s.status !== 'playing' || s.redo.length === 0) return s;
      const r = commit(s, s.redo[s.redo.length - 1], a.now);
      return r === s ? s : { ...r, redo: s.redo.slice(0, -1) };
    }
    case 'rewindTo': {
      if (s.status !== 'playing' || a.index < 0 || a.index >= s.history.length) return s;
      const undone = s.turns.slice(a.index);
      return {
        ...s,
        state: s.history[a.index],
        history: s.history.slice(0, a.index),
        turns: s.turns.slice(0, a.index),
        redo: [...s.redo, ...undone.reverse()],
        undos: s.undos + undone.length,
      };
    }
    case 'finishStep': {
      if (s.status !== 'finishing' || s.finishQueue.length === 0) return s;
      const [m, ...rest] = s.finishQueue;
      const state = applyMove(s.state, m);
      if (rest.length) return { ...s, state, finishQueue: rest };
      return { ...s, state, finishQueue: [], status: 'won', timer: pauseTimer(s.timer, a.now) };
    }
    case 'pause':
      return s.timer.runningSince === null ? s : { ...s, timer: pauseTimer(s.timer, a.now) };
    case 'resume':
      return s.status === 'playing' && s.turns.length > 0 && s.timer.runningSince === null
        ? { ...s, timer: startTimer(s.timer, a.now) }
        : s;
  }
}
