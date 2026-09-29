import type { GameState } from '../engine/types';
import { findLastWinnable } from './rewind';
import { solve, type SolveResult } from './solve';

export type WorkerRequest =
  | { id: number; kind: 'solve'; state: GameState; maxNodes: number; timeMs: number }
  | { id: number; kind: 'lastWinnable'; states: GameState[]; timeMs: number };

export type WorkerResponse =
  | { id: number; kind: 'solve'; result: SolveResult }
  | { id: number; kind: 'lastWinnable'; index: number };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(m: WorkerResponse): void;
};

const limitRecycles = (s: GameState) => s.scoring === 'vegas';

ctx.onmessage = (e) => {
  const req = e.data;
  if (req.kind === 'solve') {
    const result = solve(req.state, {
      maxNodes: req.maxNodes,
      deadline: Date.now() + req.timeMs,
      limitRecycles: limitRecycles(req.state),
    });
    ctx.postMessage({ id: req.id, kind: 'solve', result });
    return;
  }
  const end = Date.now() + req.timeMs;
  const probes = Math.ceil(Math.log2(req.states.length + 1)) + 1;
  const perProbe = Math.max(250, req.timeMs / probes);
  const index = findLastWinnable(
    req.states,
    (s) =>
      solve(s, { maxNodes: 400_000, deadline: Math.min(end, Date.now() + perProbe), limitRecycles: limitRecycles(s) }).status ===
      'winnable',
  );
  ctx.postMessage({ id: req.id, kind: 'lastWinnable', index });
};
