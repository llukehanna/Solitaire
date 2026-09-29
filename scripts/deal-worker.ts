import { parentPort } from 'node:worker_threads';
import { deal } from '../src/engine/deal';
import { solve } from '../src/solver/solve';
import type { DrawCount } from '../src/engine/types';

interface Job {
  index: number;
  seed: number;
  drawCount: DrawCount;
  maxNodes: number;
}

parentPort!.on('message', (job: Job) => {
  const t = performance.now();
  const r = solve(deal(job.seed, job.drawCount, 'standard'), { maxNodes: job.maxNodes });
  parentPort!.postMessage({
    index: job.index,
    seed: job.seed,
    status: r.status,
    length: r.status === 'winnable' ? r.solution.length : 0,
    ms: performance.now() - t,
  });
});
