import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasProductiveMove, heuristicHint } from '../engine/analysis';
import type { GameState, Move } from '../engine/types';
import { SolverClient } from '../solver/client';
import type { SolveResult } from '../solver/solve';
import type { Hint } from './types';
import type { Game } from './useGame';

export type Busy = 'hint' | 'check' | 'rewind' | null;
export type Stuck = 'no-moves' | 'unwinnable' | null;

export const toHint = (m: Move): Hint =>
  m.type === 'move' ? { kind: 'move', from: m.from, to: m.to, count: m.count } : { kind: 'stock' };

/** Identifies the board apart from stock/waste, so cycling the stock doesn't look like a new position. */
export const boardKey = (s: GameState) =>
  JSON.stringify([s.foundations.map((f) => f.length), s.tableau.map((c) => [c.cards, c.faceUpFrom])]);

/** What to tell the player when the automatic check finds no productive move: nothing if the solver can still win. */
export const stuckFor = (r: SolveResult): Stuck =>
  r.status === 'winnable' ? null : r.status === 'unwinnable' ? 'unwinnable' : 'no-moves';

const cancelled = (e: unknown) => e instanceof Error && e.message === 'cancelled';

export function useSolver(game: Game, notify: (msg: string) => void) {
  const client = useMemo(() => new SolverClient(), []);
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [stuck, setStuck] = useState<Stuck>(null);
  const { session, rewindTo } = game;
  const { state, status, history } = session;

  const stateRef = useRef(state);
  stateRef.current = state;
  /** Board the player dismissed the no-moves prompt on; suppresses re-prompting until the board changes. */
  const dismissedKey = useRef<string | null>(null);

  useEffect(() => () => client.dispose(), [client]);

  // Any change to the position invalidates hints and cancels solver work.
  useEffect(() => {
    setHint(null);
    client.cancel();
  }, [state, client]);

  // After a turn, notice when nothing useful is left. Having no productive move doesn't mean the deal is lost
  // (the stock may still be worth cycling), so ask the solver before telling the player.
  useEffect(() => {
    if (dismissedKey.current !== null && dismissedKey.current !== boardKey(state)) dismissedKey.current = null;
    if (status !== 'playing' || session.turns.length === 0 || dismissedKey.current !== null || hasProductiveMove(state)) return;
    let live = true;
    client
      .solve(state, 1500)
      .then((r) => {
        if (live && stateRef.current === state) setStuck(stuckFor(r));
      })
      .catch((e) => {
        if (live && !cancelled(e) && stateRef.current === state) setStuck('no-moves');
      });
    return () => {
      live = false;
    };
  }, [state, status, session.turns.length, client]);

  const closeStuck = useCallback(() => {
    dismissedKey.current = boardKey(stateRef.current);
    setStuck(null);
  }, []);

  /** Player dismissed the dialog: abort any search it started, and don't re-open it for this board. */
  const dismissStuck = useCallback(() => {
    client.cancel();
    closeStuck();
  }, [client, closeStuck]);

  const requestHint = useCallback(async () => {
    if (busy || status !== 'playing') return;
    const snapshot = state;
    setBusy('hint');
    try {
      const r = await client.solve(snapshot, 1500);
      if (stateRef.current !== snapshot) return;
      if (r.status === 'winnable' && r.solution.length) setHint(toHint(r.solution[0]));
      else if (r.status === 'unwinnable') setStuck('unwinnable');
      else {
        const h = heuristicHint(snapshot);
        if (h) setHint(toHint(h));
        else setStuck('no-moves');
      }
    } catch (e) {
      if (!cancelled(e)) {
        const h = heuristicHint(snapshot);
        if (h) setHint(toHint(h));
      }
    } finally {
      setBusy(null);
    }
  }, [busy, status, state, client]);

  const checkWinnable = useCallback(async () => {
    if (busy || status !== 'playing') return;
    setBusy('check');
    try {
      const snapshot = state;
      const r = await client.solve(snapshot, 3000, 1_500_000);
      if (stateRef.current !== snapshot) return;
      if (r.status === 'winnable') notify('Still winnable. Keep going!');
      else if (r.status === 'unwinnable') setStuck('unwinnable');
      else notify("Couldn't tell in time. Too many possibilities to check.");
    } catch (e) {
      if (!cancelled(e)) notify('The solver is unavailable right now.');
    } finally {
      setBusy(null);
    }
  }, [busy, status, state, client, notify]);

  const rewind = useCallback(async () => {
    if (busy || status !== 'playing') return;
    setBusy('rewind');
    try {
      const snapshot = state;
      const index = await client.lastWinnable([...history, snapshot], 5000);
      if (stateRef.current !== snapshot) return;
      closeStuck();
      if (index >= history.length) notify('Still winnable. No need to rewind.');
      else {
        const target = Math.max(0, index);
        const n = history.length - target;
        rewindTo(target);
        notify(`Rewound ${n} move${n === 1 ? '' : 's'} to the last winnable position.`);
      }
    } catch (e) {
      if (!cancelled(e)) notify('The solver is unavailable right now.');
    } finally {
      setBusy(null);
    }
  }, [busy, status, history, state, client, notify, rewindTo, closeStuck]);

  return { hint, busy, stuck, dismissStuck, requestHint, checkWinnable, rewind };
}
