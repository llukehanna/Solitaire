// Downloads Adrian Kennard's public-domain (CC0) SVG deck from his generator and splits it into one file per card.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://www.me.uk/cards/makeadeck.cgi?view=1&ace=Goodall&ace1=&ace2=&qr=&back=Diamond';
const SETS = [
  { dir: 'public/cards/classic', query: '' },
  { dir: 'public/cards/classic-4c', query: '&fourcolour=on' },
];
const CODES = [...'SHDC'].flatMap((s) => [...'A23456789TJQK'].map((r) => r + s));

function normalise(svg: string): string {
  return svg.replace(/ width="2\.5in"/, ' width="240"').replace(/ height="3\.5in"/, ' height="336"');
}

const fetched: Map<string, string>[] = [];
for (const set of SETS) {
  const res = await fetch(BASE + set.query);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${set.dir}`);
  const html = await res.text();
  const found = new Map<string, string>();
  for (const m of html.matchAll(/<svg[^>]*class="card"[^>]*face="([^"]+)"[\s\S]*?<\/svg>(?=<\/div>)/g)) found.set(m[1], m[0]);
  mkdirSync(set.dir, { recursive: true });
  for (const code of CODES) {
    const svg = found.get(code);
    if (!svg) throw new Error(`missing ${code} in ${set.dir}`);
    writeFileSync(`${set.dir}/${code}.svg`, normalise(svg));
  }
  const back = found.get('1B');
  if (!back) throw new Error(`missing back in ${set.dir}`);
  writeFileSync(`${set.dir}/back.svg`, normalise(back));
  fetched.push(found);
  console.log(`${set.dir}: wrote ${CODES.length} faces + back`);
}
if (fetched[0].get('2D') === fetched[1].get('2D')) throw new Error('four-colour set is identical to the standard set');
