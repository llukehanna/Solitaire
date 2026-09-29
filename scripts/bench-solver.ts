import { deal } from '../src/engine/deal';
import { solve } from '../src/solver/solve';

const N = Number(process.argv[2] ?? 100);
const MAX_NODES = Number(process.argv[3] ?? 200_000);

for (const drawCount of [1, 3] as const) {
  const times: number[] = [];
  const counts = { winnable: 0, unwinnable: 0, unknown: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const t = performance.now();
    const r = solve(deal(seed, drawCount, 'standard'), { maxNodes: MAX_NODES });
    times.push(performance.now() - t);
    counts[r.status]++;
  }
  times.sort((a, b) => a - b);
  const pct = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(0);
  console.log(`draw-${drawCount}`, counts, `median ${pct(0.5)}ms p90 ${pct(0.9)}ms max ${pct(1)}ms`);
}
