import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasProductiveMove, heuristicHint } from '../engine/analysis';
import type { Move } from '../engine/types';
import { SolverClient } from '../solver/client';
import type { Hint } from './types';
import type { Game } from './useGame';

export type Busy = 'hint' | 'check' | 'rewind' | null;
export type Stuck = 'no-moves' | 'unwinnable' | null;

export const toHint = (m: Move): Hint =>
  m.type === 'move' ? { kind: 'move', from: m.from, to: m.to, count: m.count } : { kind: 'stock' };

const cancelled = (e: unknown) => e instanceof Error && e.message === 'cancelled';

export function useSolver(game: Game, notify: (msg: string) => void) {
  const client = useMemo(() => new SolverClient(), []);
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [stuck, setStuck] = useState<Stuck>(null);
  const { session, rewindTo } = game;
  const { state, status, history } = session;

  useEffect(() => () => client.dispose(), [client]);

  // Any change to the position invalidates hints and cancels solver work.
  useEffect(() => {
    setHint(null);
    client.cancel();
  }, [state, client]);

  // After a turn, notice when nothing useful is left.
  useEffect(() => {
    if (status === 'playing' && session.turns.length > 0 && !hasProductiveMove(state)) setStuck('no-moves');
  }, [state, status, session.turns.length]);

  const requestHint = useCallback(async () => {
    if (busy || status !== 'playing') return;
    const snapshot = state;
    setBusy('hint');
    try {
      const r = await client.solve(snapshot, 1500);
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
      const r = await client.solve(state, 3000, 1_500_000);
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
      const index = await client.lastWinnable([...history, state], 5000);
      setStuck(null);
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
  }, [busy, status, history, state, client, notify, rewindTo]);

  return { hint, busy, stuck, dismissStuck: () => setStuck(null), requestHint, checkWinnable, rewind };
}
