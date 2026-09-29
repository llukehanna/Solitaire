import type { GameState } from '../engine/types';
import type { SolveResult } from './solve';
import type { WorkerRequest, WorkerResponse } from './worker';

type Pending = { resolve(r: WorkerResponse): void; reject(e: Error): void };
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private ensure(): Worker {
    if (!this.worker) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        p.resolve(e.data);
      };
      w.onerror = (e) => {
        this.failAll(new Error(e.message || 'Solver worker failed'));
        w.terminate();
        if (this.worker === w) this.worker = null;
      };
      this.worker = w;
    }
    return this.worker;
  }

  private request(body: RequestBody): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const worker = this.ensure(); // may throw if the worker can't be created; the promise then rejects
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...body, id } as WorkerRequest);
    });
  }

  async solve(state: GameState, timeMs = 1500, maxNodes = 400_000): Promise<SolveResult> {
    const r = await this.request({ kind: 'solve', state, maxNodes, timeMs });
    if (r.kind !== 'solve') throw new Error('unexpected solver response');
    return r.result;
  }

  async lastWinnable(states: GameState[], timeMs = 5000): Promise<number> {
    const r = await this.request({ kind: 'lastWinnable', states, timeMs });
    if (r.kind !== 'lastWinnable') throw new Error('unexpected solver response');
    return r.index;
  }

  /** Abort in-flight work (the player moved). Pending promises reject with Error('cancelled'). */
  cancel(): void {
    if (this.pending.size === 0) return;
    this.dispose();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new Error('cancelled'));
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
