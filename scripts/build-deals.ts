import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/engine/rng';
import type { DrawCount } from '../src/engine/types';

const TARGET = Number(process.env.TARGET ?? 2000);
const MAX_NODES = Number(process.env.MAX_NODES ?? 200_000);
const THREADS = Math.max(1, availableParallelism() - 1);

interface Result {
  index: number;
  seed: number;
  status: 'winnable' | 'unwinnable' | 'unknown';
  length: number;
  ms: number;
}

function seedStream(drawCount: DrawCount): () => number {
  const rand = mulberry32(drawCount === 1 ? 0x5eed0001 : 0x5eed0003);
  const seen = new Set<number>();
  return () => {
    for (;;) {
      const s = Math.floor(rand() * 2 ** 32) >>> 0;
      if (!seen.has(s)) {
        seen.add(s);
        return s;
      }
    }
  };
}

async function build(drawCount: DrawCount): Promise<void> {
  const next = seedStream(drawCount);
  const results: Result[] = [];
  let index = 0;
  let winnable = 0;
  const started = Date.now();

  await new Promise<void>((resolve, reject) => {
    let running = THREADS;
    for (let t = 0; t < THREADS; t++) {
      const w = new Worker(new URL('./deal-worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] });
      // Each worker has at most one job in flight, so every dispatched index gets a result.
      const dispatch = () => {
        if (winnable >= TARGET) {
          void w.terminate();
          if (--running === 0) resolve();
          return;
        }
        w.postMessage({ index: index++, seed: next(), drawCount, maxNodes: MAX_NODES });
      };
      w.on('message', (r: Result) => {
        results.push(r);
        if (r.status === 'winnable') winnable++;
        if (results.length % 100 === 0) {
          const secs = ((Date.now() - started) / 1000).toFixed(0);
          console.log(`draw-${drawCount}: ${results.length} tried, ${winnable} winnable, ${secs}s`);
        }
        dispatch();
      });
      w.on('error', reject);
      dispatch();
    }
  });

  results.sort((a, b) => a.index - b.index);
  const entries = results.filter((r) => r.status === 'winnable').slice(0, TARGET).map((r) => [r.seed, r.length]);
  const count = (st: Result['status']) => results.filter((r) => r.status === st).length;
  console.log(
    `draw-${drawCount} done: banked ${entries.length}; winnable ${count('winnable')}, unwinnable ${count('unwinnable')}, unknown ${count('unknown')}`,
  );
  const out = new URL(`../src/deals/bank-draw${drawCount}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify({ version: 1, drawCount, maxNodes: MAX_NODES, entries }) + '\n');
}

const modes = (process.argv[2] ? [Number(process.argv[2])] : [1, 3]) as DrawCount[];
for (const d of modes) await build(d);
