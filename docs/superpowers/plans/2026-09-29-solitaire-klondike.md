# Solitaire (Klondike) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an ad-free, offline-capable Klondike web app at solitaire.lukeghanna.com where every deal is guaranteed winnable, with solver-backed hints, auto-finish, themes, and local stats.

**Architecture:** Pure TypeScript rules engine (`src/engine`) with no DOM; a TypeScript DFS solver (`src/solver`) over that engine, used offline in Node to build a bank of winnable seeds and at runtime in a Web Worker for hints and winnability checks; a pure session reducer (`src/game`) for turns/undo/timer; localStorage persistence (`src/store`); and a React UI (`src/ui`) that renders 52 absolutely-positioned cards whose positions are a pure function of state + layout, animated with CSS transforms.

**Tech Stack:** Node 24, npm, Vite, React 19, TypeScript (strict), Vitest, Playwright, tsx (scripts), vite-plugin-pwa, Vercel (static hosting).

**Spec:** `docs/superpowers/specs/2026-09-29-solitaire-klondike-design.md` — read it before starting any task.

## Global Constraints

- Klondike only. Every new game comes from the winnable seed bank; there is no random-deal option and no daily deal.
- No backend, no accounts, no ads, no analytics, no third-party network calls at runtime.
- localStorage keys: `sol.v1.game`, `sol.v1.settings`, `sol.v1.stats`, `sol.v1.recent`. Every read is validated; every access is wrapped in try/catch.
- `src/engine` imports nothing outside `src/engine`. Dependency direction: `ui → game/store → engine`, `ui → solver (worker) → engine`, `game → solver/autoFinish`, `scripts → solver → engine`.
- Scoring (standard): waste→tableau +5, waste→foundation +10, tableau→foundation +10, tableau card turned face-up +5, foundation→tableau −15, recycle −100 (draw-1) / −20 (draw-3), floor at 0. Vegas: starts −52, +5 per card to foundation, −5 per card taken back from foundation; recycle limits draw-1 → 0 recycles (1 pass), draw-3 → 2 recycles (3 passes). None: score stays 0.
- Timer: always shown; starts on the first move; pauses when the tab is hidden or a dialog is open; stops on win; persisted with the game.
- Auto-finish: fires as soon as every tableau card is face up and `autoFinish` finds a finish; otherwise play continues and it re-checks after every turn.
- Tap a card = move to best destination (foundation → non-empty tableau → empty tableau). No tap-again cycling. A second tap on the same card within 300 ms is ignored.
- Performance: initial JS ≤ 150 KB gzipped (card art excluded); input never waits on the solver.
- UI copy is American English ("color"); identifiers use `fourColor`.
- Commit after every task with a Conventional Commit message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

```
index.html, package.json, tsconfig.json, vite.config.ts, playwright.config.ts, vercel.json
public/icon.svg (+ generated PWA icons), public/cards/{classic,classic-4c}/{AS..KC,back}.svg, public/cards/LICENSE.txt
scripts/vendor-cards.ts      download CC0 card SVGs from Adrian Kennard's generator
scripts/build-deals.ts       multi-core seed-bank builder (main thread)
scripts/deal-worker.ts       worker_threads solver worker for build-deals
scripts/bench-solver.ts      solver benchmark
src/main.tsx, src/App.tsx
src/engine/cards.ts          card ids, suit/rank helpers, names/codes
src/engine/types.ts          GameState, Column, Move, PileId, parsePile
src/engine/rng.ts            mulberry32 + seeded shuffle
src/engine/deal.ts           seed → initial GameState
src/engine/rules.ts          legality: canMove, canDraw, canRecycle, movingCards...
src/engine/apply.ts          applyMove / applyMoves (immutable) incl. scoring & flips
src/engine/movegen.ts        legalMoves, destinationsFor, safe auto-moves, isWon, allFaceUp
src/engine/stock.ts          stock-cycle positions (drawSequence, reachableStockPositions, jumpToStock)
src/engine/analysis.ts       hasProductiveMove, heuristicHint
src/solver/solve.ts          DFS solver with transposition table
src/solver/autoFinish.ts     greedy + solver finish for all-face-up positions
src/solver/rewind.ts         findLastWinnable (binary search over history)
src/solver/worker.ts         Web Worker entry
src/solver/client.ts         promise-based worker client with cancellation
src/deals/bank.ts            bank access + pickSeed
src/deals/bank-draw1.json, bank-draw3.json   generated
src/game/timer.ts            pure timer
src/game/session.ts          session reducer (turns, undo/redo, finish queue)
src/game/persist.ts          Session ⇄ SavedGame
src/store/storage.ts         safe localStorage JSON
src/store/settings.ts        Settings type, defaults, parse/load/save
src/store/stats.ts           Stats type, recordResult, parse/load/save
src/store/recent.ts          recently played seeds per draw mode
src/ui/layout.ts             computeLayout, cardPositions, pileRect, pickDropTarget
src/ui/cards/minimal.ts      Modern Minimal SVG card renderer
src/ui/CardFront.tsx         theme-aware card face
src/ui/Card.tsx              one positioned card
src/ui/Table.tsx             table: slots, cards, hint overlay
src/ui/useTableInput.ts      pointer input (tap + drag)
src/ui/useSize.ts            ResizeObserver hook
src/ui/useGame.ts            app state: session, settings, stats, persistence
src/ui/Toolbar.tsx, StatusBar.tsx, Toast.tsx
src/ui/dialogs/Modal.tsx, SettingsDialog.tsx, StatsDialog.tsx, ResultDialog.tsx, NoMovesDialog.tsx
src/ui/useSolver.ts          hint / winnable check / rewind orchestration
src/ui/WinCascade.tsx        bouncing-card canvas
src/ui/sound.ts              Web Audio synthesized sounds
src/ui/useKeyboard.ts        keyboard play + shortcuts
src/ui/announce.ts           screen-reader move descriptions
src/styles/global.css, themes.css, table.css, chrome.css
tests/**                     Vitest; e2e/** Playwright
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`, `tests/smoke.test.ts`
- Modify: `.gitignore` (already exists)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `test`, `test:deals`, `e2e`, `deals`, `bench`, `cards`; Vitest config (tests in `tests/**/*.test.ts`, node environment).

- [ ] **Step 1: Create package.json**

```json
{
  "name": "solitaire",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:deals": "FULL_DEALS=1 vitest run tests/deals",
    "e2e": "playwright test",
    "deals": "tsx scripts/build-deals.ts",
    "bench": "tsx scripts/bench-solver.ts",
    "cards": "tsx scripts/vendor-cards.ts"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i react react-dom
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest tsx @playwright/test vite-plugin-pwa
npx playwright install chromium
```
Expected: installs succeed; `node_modules/` exists (already gitignored).

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
```

- [ ] **Step 5: Create index.html, src/main.tsx, src/App.tsx, src/styles/global.css**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f5132" />
    <meta name="description" content="Ad-free Klondike solitaire. Every deal is winnable." />
    <title>Solitaire</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <main className="app">Solitaire</main>;
}
```

`src/styles/global.css`:
```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
}
button { font: inherit; }
```

- [ ] **Step 6: Write smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect([1, 2, 3].map((n) => n * 2)).toEqual([2, 4, 6]);
  });
});
```

- [ ] **Step 7: Verify toolchain**

Run: `npm test && npm run build`
Expected: 1 test passes; `vite build` writes `dist/` with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Engine — cards, types, RNG, deal

**Files:**
- Create: `src/engine/cards.ts`, `src/engine/types.ts`, `src/engine/rng.ts`, `src/engine/deal.ts`, `tests/helpers.ts`
- Test: `tests/engine/deal.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `type Suit = 'S'|'H'|'D'|'C'`; `type CardId = number` (0–51; `suitIndex = floor(id/13)` in order S,H,D,C; `rank = id%13 + 1`)
  - `SUITS`, `suitIndex(id)`, `suitOf(id)`, `rankOf(id)`, `isRed(id)`, `cardId(suit, rank)`, `cardName(id)` → `"queen of spades"`, `cardCode(id)` → `"QS"` / `"TH"`, `rankLabel(id)` → `"A"…"10"…"K"`, `SUIT_NAMES`
  - `type DrawCount = 1|3`; `type Scoring = 'standard'|'vegas'|'none'`
  - `interface Column { cards: CardId[]; faceUpFrom: number }` — `cards[0]` bottom; card *i* is face up iff `i >= faceUpFrom`; empty column has `faceUpFrom = 0`
  - `interface GameState { seed; drawCount; scoring; stock: CardId[] /* last = top */; waste: CardId[] /* last = top */; foundations: CardId[][] /* [4], index = suitIndex */; tableau: Column[] /* [7] */; recycles: number; score: number; moves: number }`
  - `type PileId = 'W' | \`F${number}\` | \`T${number}\``; `type Move = {type:'draw'} | {type:'recycle'} | {type:'move'; from: PileId; to: PileId; count: number}`
  - `parsePile(id): {kind:'W'} | {kind:'F'; i} | {kind:'T'; i}`, `FOUNDATION_IDS`, `TABLEAU_IDS`
  - `mulberry32(seed): () => number`, `shuffledDeck(seed): CardId[]`
  - `deal(seed, drawCount, scoring): GameState`
  - test helpers `c(code)`, `cards(codes)`, `upTo(suit, rank)`, `makeState(partial)`

- [ ] **Step 1: Write the failing tests**

`tests/helpers.ts`:
```ts
import { cardId, type CardId, type Suit } from '../src/engine/cards';
import type { Column, GameState } from '../src/engine/types';

/** 'TH' → ten of hearts, 'AS' → ace of spades */
export function c(code: string): CardId {
  const rank = 'A23456789TJQK'.indexOf(code[0]) + 1;
  if (rank === 0 || !'SHDC'.includes(code[1])) throw new Error(`bad card code ${code}`);
  return cardId(code[1] as Suit, rank);
}

export function cards(codes: string): CardId[] {
  const t = codes.trim();
  return t ? t.split(/\s+/).map(c) : [];
}

/** Foundation pile of `suit` holding ace..rank */
export function upTo(suit: Suit, rank: number): CardId[] {
  return Array.from({ length: rank }, (_, i) => cardId(suit, i + 1));
}

type StateInput = Partial<Omit<GameState, 'tableau'>> & {
  /** columns as [codes bottom→top, faceUpFrom] */
  cols?: [string, number][];
  tableau?: Column[];
};

export function makeState(p: StateInput): GameState {
  const { cols, tableau, ...rest } = p;
  const t: Column[] = tableau ?? (cols ?? []).map(([codes, faceUpFrom]) => ({ cards: cards(codes), faceUpFrom }));
  while (t.length < 7) t.push({ cards: [], faceUpFrom: 0 });
  return {
    seed: 0,
    drawCount: 1,
    scoring: 'standard',
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    recycles: 0,
    score: 0,
    moves: 0,
    ...rest,
    tableau: t,
  };
}
```

`tests/engine/deal.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cardCode, cardId, cardName, isRed, rankLabel, rankOf, suitOf } from '../../src/engine/cards';
import { mulberry32, shuffledDeck } from '../../src/engine/rng';
import { deal } from '../../src/engine/deal';
import { parsePile } from '../../src/engine/types';

const FULL = Array.from({ length: 52 }, (_, i) => i);

describe('cards', () => {
  it('maps ids to suit and rank', () => {
    expect(suitOf(0)).toBe('S');
    expect(rankOf(0)).toBe(1);
    expect(suitOf(13)).toBe('H');
    expect(rankOf(25)).toBe(13);
    expect(cardId('D', 7)).toBe(32);
    expect(isRed(cardId('H', 5))).toBe(true);
    expect(isRed(cardId('D', 5))).toBe(true);
    expect(isRed(cardId('C', 5))).toBe(false);
    expect(cardName(cardId('S', 12))).toBe('queen of spades');
    expect(cardCode(cardId('H', 10))).toBe('TH');
    expect(rankLabel(cardId('C', 10))).toBe('10');
  });
});

describe('piles', () => {
  it('parses pile ids', () => {
    expect(parsePile('W')).toEqual({ kind: 'W' });
    expect(parsePile('F2')).toEqual({ kind: 'F', i: 2 });
    expect(parsePile('T6')).toEqual({ kind: 'T', i: 6 });
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('shuffles a full deck deterministically', () => {
    const d = shuffledDeck(7);
    expect([...d].sort((x, y) => x - y)).toEqual(FULL);
    expect(shuffledDeck(7)).toEqual(d);
    expect(shuffledDeck(8)).not.toEqual(d);
  });
});

describe('deal', () => {
  it('lays out Klondike', () => {
    const s = deal(123, 1, 'standard');
    expect(s.tableau.map((col) => col.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.tableau.map((col) => col.faceUpFrom)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.stock).toHaveLength(24);
    expect(s.waste).toEqual([]);
    expect(s.foundations).toEqual([[], [], [], []]);
    const all = [...s.stock, ...s.tableau.flatMap((col) => col.cards)].sort((a, b) => a - b);
    expect(all).toEqual(FULL);
    expect(s).toMatchObject({ seed: 123, drawCount: 1, scoring: 'standard', score: 0, moves: 0, recycles: 0 });
  });
  it('is fully determined by seed', () => {
    expect(deal(5, 3, 'none')).toEqual(deal(5, 3, 'none'));
    expect(deal(5, 3, 'none').stock).not.toEqual(deal(6, 3, 'none').stock);
  });
  it('starts Vegas at -52', () => {
    expect(deal(1, 1, 'vegas').score).toBe(-52);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/deal.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/cards`.

- [ ] **Step 3: Implement**

`src/engine/cards.ts`:
```ts
export type Suit = 'S' | 'H' | 'D' | 'C';
/** 0..51. suitIndex = floor(id / 13) in SUITS order; rank = id % 13 + 1 (1 = ace, 13 = king). */
export type CardId = number;

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_NAMES: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_CODES = 'A23456789TJQK';

export const suitIndex = (id: CardId): number => Math.floor(id / 13);
export const suitOf = (id: CardId): Suit => SUITS[suitIndex(id)];
export const rankOf = (id: CardId): number => (id % 13) + 1;
export const isRed = (id: CardId): boolean => {
  const s = suitIndex(id);
  return s === 1 || s === 2;
};
export const cardId = (suit: Suit, rank: number): CardId => SUITS.indexOf(suit) * 13 + rank - 1;
export const cardName = (id: CardId): string => `${RANK_NAMES[rankOf(id) - 1]} of ${SUIT_NAMES[suitOf(id)]}`;
export const rankLabel = (id: CardId): string => RANK_LABELS[rankOf(id) - 1];
/** Two-char code used for card art file names: 'AS', 'TH', 'KC'. */
export const cardCode = (id: CardId): string => RANK_CODES[rankOf(id) - 1] + suitOf(id);
```

`src/engine/types.ts`:
```ts
import type { CardId } from './cards';

export type DrawCount = 1 | 3;
export type Scoring = 'standard' | 'vegas' | 'none';

export interface Column {
  /** cards[0] is the bottom card, cards[length - 1] the top. */
  cards: CardId[];
  /** Card i is face up iff i >= faceUpFrom. Empty column: 0. */
  faceUpFrom: number;
}

export interface GameState {
  seed: number;
  drawCount: DrawCount;
  scoring: Scoring;
  /** Face-down stock; last element is the top card. */
  stock: CardId[];
  /** Face-up waste; last element is the top (playable) card. */
  waste: CardId[];
  /** Four foundations indexed by suitIndex (S, H, D, C); last element is the top. */
  foundations: CardId[][];
  tableau: Column[];
  recycles: number;
  score: number;
  moves: number;
}

export type PileId = 'W' | `F${number}` | `T${number}`;

export type Move =
  | { type: 'draw' }
  | { type: 'recycle' }
  | { type: 'move'; from: PileId; to: PileId; count: number };

export type PileRef = { kind: 'W' } | { kind: 'F'; i: number } | { kind: 'T'; i: number };

export function parsePile(id: PileId): PileRef {
  if (id === 'W') return { kind: 'W' };
  const i = Number(id.slice(1));
  return id[0] === 'F' ? { kind: 'F', i } : { kind: 'T', i };
}

export const FOUNDATION_IDS: PileId[] = ['F0', 'F1', 'F2', 'F3'];
export const TABLEAU_IDS: PileId[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
```

`src/engine/rng.ts`:
```ts
import type { CardId } from './cards';

/** Small, fast, deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of 0..51 driven by mulberry32(seed). */
export function shuffledDeck(seed: number): CardId[] {
  const rand = mulberry32(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
```

`src/engine/deal.ts`:
```ts
import { shuffledDeck } from './rng';
import type { Column, DrawCount, GameState, Scoring } from './types';

export function deal(seed: number, drawCount: DrawCount, scoring: Scoring): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Column[] = [];
  let k = 0;
  for (let i = 0; i < 7; i++) {
    tableau.push({ cards: deck.slice(k, k + i + 1), faceUpFrom: i });
    k += i + 1;
  }
  return {
    seed,
    drawCount,
    scoring,
    stock: deck.slice(k),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    recycles: 0,
    score: scoring === 'vegas' ? -52 : 0,
    moves: 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/deal.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine tests
git commit -m "feat(engine): cards, types, seeded shuffle and deal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine — rules and applyMove

**Files:**
- Create: `src/engine/rules.ts`, `src/engine/apply.ts`
- Test: `tests/engine/apply.test.ts`

**Interfaces:**
- Consumes: Task 2 types and card helpers.
- Produces:
  - `maxRecycles(s): number` (Infinity unless Vegas)
  - `canDraw(s)`, `canRecycle(s)`, `canStack(card, onto)`, `canPlayToFoundation(s, card, f = suitIndex(card))`
  - `movingCards(s, from: PileId, count): CardId[] | null`
  - `canMove(s, m: Move): boolean`
  - `applyMove(s, m): GameState` (pure; throws `Error('Illegal move: …')` if `!canMove`); `applyMoves(s, ms): GameState`

- [ ] **Step 1: Write the failing tests**

`tests/engine/apply.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyMove, applyMoves } from '../../src/engine/apply';
import { canMove, canRecycle } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import type { Move, PileId } from '../../src/engine/types';
import { c, cards, makeState, upTo } from '../helpers';

const mv = (from: PileId, to: PileId, count = 1): Move => ({ type: 'move', from, to, count });

describe('draw and recycle', () => {
  it('draw-1 moves the stock top to the waste', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const n = applyMove(s, { type: 'draw' });
    expect(n.stock).toEqual(cards('2C 3C'));
    expect(n.waste).toEqual(cards('4C'));
    expect(n.moves).toBe(1);
  });
  it('draw-3 deals three, the third drawn ends on top', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C') });
    const n = applyMove(s, { type: 'draw' });
    expect(n.stock).toEqual(cards('2C'));
    expect(n.waste).toEqual(cards('5C 4C 3C'));
  });
  it('draw-3 with fewer than three left draws what remains', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C') });
    expect(applyMove(s, { type: 'draw' }).waste).toEqual(cards('3C 2C'));
  });
  it('recycle turns the waste back into the stock in original order', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const drawn = applyMoves(s, [{ type: 'draw' }, { type: 'draw' }, { type: 'draw' }]);
    const r = applyMove(drawn, { type: 'recycle' });
    expect(r.stock).toEqual(s.stock);
    expect(r.waste).toEqual([]);
    expect(r.recycles).toBe(1);
  });
  it('recycle is illegal while the stock has cards or the waste is empty', () => {
    expect(canMove(makeState({ stock: cards('2C'), waste: cards('3C') }), { type: 'recycle' })).toBe(false);
    expect(canMove(makeState({}), { type: 'recycle' })).toBe(false);
  });
  it('recycle costs 100 in draw-1 and 20 in draw-3, floored at 0', () => {
    expect(applyMove(makeState({ waste: cards('2C'), score: 150 }), { type: 'recycle' }).score).toBe(50);
    expect(applyMove(makeState({ waste: cards('2C'), score: 50 }), { type: 'recycle' }).score).toBe(0);
    expect(applyMove(makeState({ drawCount: 3, waste: cards('2C'), score: 50 }), { type: 'recycle' }).score).toBe(30);
  });
  it('Vegas allows no recycles in draw-1 and two in draw-3', () => {
    expect(canRecycle(makeState({ scoring: 'vegas', waste: cards('2C') }))).toBe(false);
    const v3 = makeState({ scoring: 'vegas', drawCount: 3, waste: cards('2C') });
    expect(canRecycle(v3)).toBe(true);
    expect(canRecycle({ ...v3, recycles: 1 })).toBe(true);
    expect(canRecycle({ ...v3, recycles: 2 })).toBe(false);
  });
});

describe('card moves', () => {
  it('tableau to foundation flips the exposed card and scores 15', () => {
    const s = makeState({ cols: [['5S AH', 1]] });
    const n = applyMove(s, mv('T0', 'F1'));
    expect(n.foundations[1]).toEqual(cards('AH'));
    expect(n.tableau[0]).toEqual({ cards: cards('5S'), faceUpFrom: 0 });
    expect(n.score).toBe(15);
  });
  it('foundation accepts only the next rank of its own suit', () => {
    const s = makeState({ foundations: [upTo('S', 2), [], [], []], cols: [['3S', 0], ['4S', 0], ['3H', 0]] });
    expect(canMove(s, mv('T0', 'F0'))).toBe(true);
    expect(canMove(s, mv('T1', 'F0'))).toBe(false);
    expect(canMove(s, mv('T2', 'F0'))).toBe(false);
    expect(canMove(s, mv('T0', 'F1'))).toBe(false);
  });
  it('only kings go to an empty column', () => {
    const s = makeState({ cols: [['KH', 0], ['QH', 0]] });
    expect(canMove(s, mv('T0', 'T2'))).toBe(true);
    expect(canMove(s, mv('T1', 'T2'))).toBe(false);
  });
  it('moves a face-up run onto an alternating-colour higher card', () => {
    const s = makeState({ cols: [['9C 8H 7S', 1], ['9S', 0], ['9D', 0]] });
    expect(canMove(s, mv('T0', 'T2', 2))).toBe(false);
    const n = applyMove(s, mv('T0', 'T1', 2));
    expect(n.tableau[1]).toEqual({ cards: cards('9S 8H 7S'), faceUpFrom: 0 });
    expect(n.tableau[0]).toEqual({ cards: cards('9C'), faceUpFrom: 0 });
    expect(n.score).toBe(5);
  });
  it('cannot move face-down cards', () => {
    const s = makeState({ cols: [['9C 8H 7S', 1], ['TD', 0]] });
    expect(canMove(s, mv('T0', 'T1', 3))).toBe(false);
  });
  it('waste to tableau scores 5, foundation to tableau costs 15', () => {
    const s = makeState({ waste: cards('8H'), cols: [['9S', 0], ['8C', 0]], foundations: [[], upTo('H', 7), [], []], score: 20 });
    expect(applyMove(s, mv('W', 'T0')).score).toBe(25);
    expect(applyMove(s, mv('F1', 'T1')).score).toBe(5);
  });
  it('Vegas scores +5 per foundation card and -5 when taken back', () => {
    const s = makeState({ scoring: 'vegas', score: -52, cols: [['AH', 0], ['8C', 0]], foundations: [[], [], upTo('D', 7), []] });
    expect(applyMove(s, mv('T0', 'F1')).score).toBe(-47);
    expect(applyMove(s, mv('F2', 'T1')).score).toBe(-57);
  });
  it('none scoring never changes score', () => {
    const s = makeState({ scoring: 'none', cols: [['5S AH', 1]] });
    expect(applyMove(s, mv('T0', 'F1')).score).toBe(0);
  });
  it('rejects nonsense moves', () => {
    const s = makeState({ cols: [['AH', 0]] });
    expect(canMove(s, mv('T0', 'T0'))).toBe(false);
    expect(canMove(s, mv('T0', 'W'))).toBe(false);
    expect(canMove(s, mv('T0', 'F1', 0))).toBe(false);
    expect(canMove(s, mv('W', 'F1'))).toBe(false);
    expect(() => applyMove(s, mv('T0', 'F0'))).toThrow(/Illegal move/);
  });
  it('never mutates its input', () => {
    const s = deal(99, 1, 'standard');
    const before = JSON.stringify(s);
    applyMove(s, { type: 'draw' });
    const col6top = s.tableau[6].cards[6];
    for (let to = 0; to < 7; to++) {
      const m = mv('T6', `T${to}` as PileId);
      if (canMove(s, m)) applyMove(s, m);
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(s.tableau[6].cards[6]).toBe(col6top);
    expect(c('AS')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/apply.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/apply`.

- [ ] **Step 3: Implement rules**

`src/engine/rules.ts`:
```ts
import { isRed, rankOf, suitIndex, type CardId } from './cards';
import { parsePile, type GameState, type Move, type PileId } from './types';

/** Recycles allowed per game: unlimited except Vegas (draw-1: 1 pass → 0 recycles; draw-3: 3 passes → 2). */
export function maxRecycles(s: GameState): number {
  if (s.scoring !== 'vegas') return Infinity;
  return s.drawCount === 1 ? 0 : 2;
}

export const canDraw = (s: GameState): boolean => s.stock.length > 0;

export const canRecycle = (s: GameState): boolean =>
  s.stock.length === 0 && s.waste.length > 0 && s.recycles < maxRecycles(s);

/** Tableau building rule: one rank lower, opposite colour. */
export const canStack = (card: CardId, onto: CardId): boolean =>
  rankOf(onto) === rankOf(card) + 1 && isRed(onto) !== isRed(card);

export const canPlayToFoundation = (s: GameState, card: CardId, f: number = suitIndex(card)): boolean =>
  suitIndex(card) === f && s.foundations[f].length === rankOf(card) - 1;

/** The cards that would be lifted from `from`, or null if that pickup is impossible. */
export function movingCards(s: GameState, from: PileId, count: number): CardId[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const p = parsePile(from);
  if (p.kind === 'W') return count === 1 && s.waste.length > 0 ? [s.waste[s.waste.length - 1]] : null;
  if (p.kind === 'F') {
    const f = s.foundations[p.i];
    return f && count === 1 && f.length > 0 ? [f[f.length - 1]] : null;
  }
  const col = s.tableau[p.i];
  if (!col || count > col.cards.length - col.faceUpFrom) return null;
  return col.cards.slice(col.cards.length - count);
}

export function canMove(s: GameState, m: Move): boolean {
  if (m.type === 'draw') return canDraw(s);
  if (m.type === 'recycle') return canRecycle(s);
  if (m.from === m.to) return false;
  const moving = movingCards(s, m.from, m.count);
  if (!moving) return false;
  const to = parsePile(m.to);
  if (to.kind === 'W') return false;
  if (to.kind === 'F') {
    return to.i >= 0 && to.i < 4 && m.count === 1 && parsePile(m.from).kind !== 'F' && canPlayToFoundation(s, moving[0], to.i);
  }
  const col = s.tableau[to.i];
  if (!col) return false;
  if (col.cards.length === 0) return rankOf(moving[0]) === 13;
  return canStack(moving[0], col.cards[col.cards.length - 1]);
}
```

- [ ] **Step 4: Implement applyMove**

`src/engine/apply.ts`:
```ts
import type { CardId } from './cards';
import { canMove } from './rules';
import { parsePile, type GameState, type Move, type PileRef } from './types';

function scoreDelta(s: GameState, from: PileRef['kind'], to: PileRef['kind'], flipped: boolean): number {
  if (s.scoring === 'none') return 0;
  if (s.scoring === 'vegas') return to === 'F' ? 5 : from === 'F' ? -5 : 0;
  let d = 0;
  if (from === 'W' && to === 'T') d += 5;
  if (to === 'F') d += 10;
  if (from === 'F' && to === 'T') d -= 15;
  if (flipped) d += 5;
  return d;
}

const addScore = (s: GameState, delta: number): number =>
  s.scoring === 'standard' ? Math.max(0, s.score + delta) : s.score + delta;

/** Pure: returns a new state; untouched piles are shared with the input. Throws on illegal moves. */
export function applyMove(s: GameState, m: Move): GameState {
  if (!canMove(s, m)) throw new Error(`Illegal move: ${JSON.stringify(m)}`);
  const moves = s.moves + 1;

  if (m.type === 'draw') {
    const n = Math.min(s.drawCount, s.stock.length);
    const drawn = s.stock.slice(s.stock.length - n).reverse();
    return { ...s, stock: s.stock.slice(0, s.stock.length - n), waste: [...s.waste, ...drawn], moves };
  }

  if (m.type === 'recycle') {
    const penalty = s.scoring === 'standard' ? (s.drawCount === 1 ? -100 : -20) : 0;
    return { ...s, stock: [...s.waste].reverse(), waste: [], recycles: s.recycles + 1, score: addScore(s, penalty), moves };
  }

  const from = parsePile(m.from);
  const to = parsePile(m.to);
  const next: GameState = { ...s, moves, tableau: s.tableau.slice(), foundations: s.foundations.slice() };
  let moving: CardId[];
  let flipped = false;

  if (from.kind === 'W') {
    moving = [s.waste[s.waste.length - 1]];
    next.waste = s.waste.slice(0, -1);
  } else if (from.kind === 'F') {
    const f = s.foundations[from.i];
    moving = [f[f.length - 1]];
    next.foundations[from.i] = f.slice(0, -1);
  } else {
    const col = s.tableau[from.i];
    const keep = col.cards.length - m.count;
    moving = col.cards.slice(keep);
    let faceUpFrom = col.faceUpFrom;
    if (keep === 0) faceUpFrom = 0;
    else if (col.faceUpFrom >= keep) {
      faceUpFrom = keep - 1;
      flipped = true;
    }
    next.tableau[from.i] = { cards: col.cards.slice(0, keep), faceUpFrom };
  }

  if (to.kind === 'F') {
    next.foundations[to.i] = [...s.foundations[to.i], ...moving];
  } else {
    const col = next.tableau[to.i];
    next.tableau[to.i] = { cards: [...col.cards, ...moving], faceUpFrom: col.cards.length === 0 ? 0 : col.faceUpFrom };
  }

  next.score = addScore(s, scoreDelta(s, from.kind, to.kind, flipped));
  return next;
}

export function applyMoves(s: GameState, ms: readonly Move[]): GameState {
  let cur = s;
  for (const m of ms) cur = applyMove(cur, m);
  return cur;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/engine`
Expected: PASS (all engine tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine tests
git commit -m "feat(engine): move legality, applyMove with scoring and flips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Engine — move generation, safe moves, stock cycle

**Files:**
- Create: `src/engine/movegen.ts`, `src/engine/stock.ts`
- Test: `tests/engine/movegen.test.ts`, `tests/engine/stock.test.ts`

**Interfaces:**
- Consumes: Task 2–3.
- Produces:
  - `legalMoves(s): Move[]`
  - `destinationsFor(s, from: PileId, count): PileId[]` — legal destinations ordered: foundations, then non-empty tableau (left→right), then empty tableau
  - `isWon(s)`, `allFaceUp(s)`
  - `isSafeToFoundation(s, card)`, `nextSafeMove(s, includeWaste = true): Move | null`, `applySafeMoves(s, includeWaste = true): { state; moves: Move[] }`
  - `interface StockPosition { p: number; path: Move[] }` — `p` = number of cards in the waste; `path` = draws/recycles from the current state to reach it
  - `drawSequence(s): CardId[]` — waste bottom→top then stock in draw order
  - `reachableStockPositions(s, unlimitedRecycles = false): StockPosition[]` (first entry is the current position with empty path)
  - `jumpToStock(s, pos): GameState` — equals `applyMoves(s, pos.path)` but O(n)

- [ ] **Step 1: Write the failing tests**

`tests/engine/movegen.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { allFaceUp, applySafeMoves, destinationsFor, isSafeToFoundation, isWon, legalMoves, nextSafeMove } from '../../src/engine/movegen';
import { canMove } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import { c, cards, makeState, upTo } from '../helpers';

describe('legalMoves', () => {
  it('offers draw on a fresh deal and every move is legal', () => {
    const s = deal(3, 1, 'standard');
    const ms = legalMoves(s);
    expect(ms).toContainEqual({ type: 'draw' });
    expect(ms).not.toContainEqual({ type: 'recycle' });
    for (const m of ms) expect(canMove(s, m)).toBe(true);
  });
});

describe('destinationsFor', () => {
  it('orders foundation, then non-empty tableau, then empty tableau', () => {
    const s = makeState({
      foundations: [[], upTo('H', 1), [], []],
      cols: [['KD', 0], ['3S', 0], ['2H', 0], ['3C', 0]],
    });
    expect(destinationsFor(s, 'T2', 1)).toEqual(['F1', 'T1', 'T3']);
    expect(destinationsFor(s, 'T0', 1)).toEqual(['T4', 'T5', 'T6']);
  });
});

describe('safe foundation moves', () => {
  it('aces and twos are always safe', () => {
    const s = makeState({});
    expect(isSafeToFoundation(s, c('AH'))).toBe(true);
    expect(isSafeToFoundation(s, c('2C'))).toBe(true);
  });
  it('a card is safe when both opposite-colour foundations reach rank - 1', () => {
    const low = makeState({ foundations: [upTo('S', 4), [], [], upTo('C', 3)] });
    const ok = makeState({ foundations: [upTo('S', 4), [], [], upTo('C', 4)] });
    expect(isSafeToFoundation(low, c('5H'))).toBe(false);
    expect(isSafeToFoundation(ok, c('5H'))).toBe(true);
  });
  it('chains safe moves, flipping cards as it goes', () => {
    const s = makeState({ cols: [['2S AS', 1]] });
    const r = applySafeMoves(s);
    expect(r.moves).toHaveLength(2);
    expect(r.state.foundations[0]).toEqual(cards('AS 2S'));
    expect(r.state.tableau[0].cards).toEqual([]);
  });
  it('can skip the waste', () => {
    const s = makeState({ waste: cards('AD') });
    expect(nextSafeMove(s, false)).toBeNull();
    expect(nextSafeMove(s, true)).toEqual({ type: 'move', from: 'W', to: 'F2', count: 1 });
  });
});

describe('win and face-up detection', () => {
  it('detects a win', () => {
    expect(isWon(makeState({ foundations: [upTo('S', 13), upTo('H', 13), upTo('D', 13), upTo('C', 13)] }))).toBe(true);
    expect(isWon(deal(1, 1, 'standard'))).toBe(false);
  });
  it('detects all tableau cards face up', () => {
    expect(allFaceUp(makeState({ cols: [['KS QH', 0]], stock: cards('2C') }))).toBe(true);
    expect(allFaceUp(deal(1, 1, 'standard'))).toBe(false);
  });
});
```

`tests/engine/stock.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyMoves } from '../../src/engine/apply';
import { deal } from '../../src/engine/deal';
import { drawSequence, jumpToStock, reachableStockPositions } from '../../src/engine/stock';
import { cards, makeState } from '../helpers';

describe('stock cycle', () => {
  it('draw-1 reaches every position including a recycle', () => {
    const s = makeState({ stock: cards('2C 3C 4C') });
    const ps = reachableStockPositions(s);
    expect(ps.map((p) => p.p)).toEqual([0, 1, 2, 3]);
    const withWaste = makeState({ stock: cards('2C'), waste: cards('3C 4C') });
    expect(reachableStockPositions(withWaste).map((p) => p.p)).toEqual([2, 3, 0, 1]);
  });
  it('draw-3 visits multiples of three and the end', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C 6C 7C 8C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([0, 3, 6, 7]);
  });
  it('draw-3 from an off-grid position continues then settles on the grid', () => {
    const s = makeState({ drawCount: 3, waste: cards('2C'), stock: cards('3C 4C 5C 6C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([1, 4, 5, 0, 3]);
  });
  it('respects Vegas recycle limits unless told otherwise', () => {
    const s = makeState({ scoring: 'vegas', stock: cards('2C 3C') });
    expect(reachableStockPositions(s).map((p) => p.p)).toEqual([0, 1, 2]);
    expect(reachableStockPositions(s, true).map((p) => p.p)).toEqual([0, 1, 2]);
    const mid = makeState({ scoring: 'vegas', waste: cards('2C'), stock: cards('3C') });
    expect(reachableStockPositions(mid).map((p) => p.p)).toEqual([1, 2]);
    expect(reachableStockPositions(mid, true).map((p) => p.p)).toEqual([1, 2, 0]);
  });
  it('jumpToStock matches replaying the path', () => {
    for (const drawCount of [1, 3] as const) {
      const s = applyMoves(deal(11, drawCount, 'standard'), [{ type: 'draw' }]);
      for (const pos of reachableStockPositions(s)) {
        expect(jumpToStock(s, pos)).toEqual(applyMoves(s, pos.path));
      }
    }
  });
  it('drawSequence lists waste then stock in draw order', () => {
    const s = makeState({ waste: cards('2C 3C'), stock: cards('4C 5C') });
    expect(drawSequence(s)).toEqual(cards('2C 3C 5C 4C'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/movegen.test.ts tests/engine/stock.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement movegen**

`src/engine/movegen.ts`:
```ts
import { isRed, rankOf, suitIndex, type CardId } from './cards';
import { applyMove } from './apply';
import { canDraw, canMove, canPlayToFoundation, canRecycle } from './rules';
import { FOUNDATION_IDS, TABLEAU_IDS, type GameState, type Move, type PileId } from './types';

const DESTINATIONS: PileId[] = [...FOUNDATION_IDS, ...TABLEAU_IDS];

export function legalMoves(s: GameState): Move[] {
  const out: Move[] = [];
  if (canDraw(s)) out.push({ type: 'draw' });
  if (canRecycle(s)) out.push({ type: 'recycle' });
  const sources: { from: PileId; count: number }[] = [];
  if (s.waste.length) sources.push({ from: 'W', count: 1 });
  s.foundations.forEach((f, i) => {
    if (f.length) sources.push({ from: `F${i}`, count: 1 });
  });
  s.tableau.forEach((col, i) => {
    for (let n = 1; n <= col.cards.length - col.faceUpFrom; n++) sources.push({ from: `T${i}`, count: n });
  });
  for (const src of sources) {
    for (const to of DESTINATIONS) {
      const m: Move = { type: 'move', from: src.from, to, count: src.count };
      if (canMove(s, m)) out.push(m);
    }
  }
  return out;
}

/** Legal destinations for a pickup, best first: foundations, non-empty tableau (left→right), empty tableau. */
export function destinationsFor(s: GameState, from: PileId, count: number): PileId[] {
  const legal = DESTINATIONS.filter((to) => canMove(s, { type: 'move', from, to, count }));
  const rank = (to: PileId) => (to[0] === 'F' ? 0 : s.tableau[Number(to.slice(1))].cards.length ? 1 : 2);
  return legal.sort((a, b) => rank(a) - rank(b));
}

export const isWon = (s: GameState): boolean => s.foundations.every((f) => f.length === 13);

export const allFaceUp = (s: GameState): boolean => s.tableau.every((col) => col.faceUpFrom === 0);

/** Safe = can never be needed in the tableau: rank ≤ 2, or both opposite-colour foundations are at ≥ rank − 1. */
export function isSafeToFoundation(s: GameState, card: CardId): boolean {
  const r = rankOf(card);
  if (r <= 2) return true;
  const opposite = isRed(card) ? [0, 3] : [1, 2];
  return opposite.every((f) => s.foundations[f].length >= r - 1);
}

export function nextSafeMove(s: GameState, includeWaste = true): Move | null {
  const sources: [PileId, CardId | undefined][] = [];
  if (includeWaste) sources.push(['W', s.waste[s.waste.length - 1]]);
  s.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
  for (const [from, card] of sources) {
    if (card === undefined) continue;
    if (canPlayToFoundation(s, card) && isSafeToFoundation(s, card)) {
      return { type: 'move', from, to: `F${suitIndex(card)}`, count: 1 };
    }
  }
  return null;
}

export function applySafeMoves(s: GameState, includeWaste = true): { state: GameState; moves: Move[] } {
  const moves: Move[] = [];
  let cur = s;
  for (let m = nextSafeMove(cur, includeWaste); m; m = nextSafeMove(cur, includeWaste)) {
    cur = applyMove(cur, m);
    moves.push(m);
  }
  return { state: cur, moves };
}
```

- [ ] **Step 4: Implement stock cycle**

`src/engine/stock.ts`:
```ts
import type { CardId } from './cards';
import { maxRecycles } from './rules';
import type { GameState, Move } from './types';

export interface StockPosition {
  /** Number of cards in the waste at this position; the playable card is drawSequence(s)[p - 1]. */
  p: number;
  /** Draws/recycles that reach this position from the current state. */
  path: Move[];
}

/** Waste (bottom→top) followed by the stock in the order it will be drawn. Draws never reorder this. */
export function drawSequence(s: GameState): CardId[] {
  return [...s.waste, ...s.stock.slice().reverse()];
}

export function reachableStockPositions(s: GameState, unlimitedRecycles = false): StockPosition[] {
  const n = s.waste.length + s.stock.length;
  let p = s.waste.length;
  let path: Move[] = [];
  let recyclesLeft = unlimitedRecycles ? Infinity : maxRecycles(s) - s.recycles;
  const seen = new Set<number>();
  const out: StockPosition[] = [];
  while (!seen.has(p)) {
    seen.add(p);
    out.push({ p, path });
    if (p < n) {
      p = Math.min(p + s.drawCount, n);
      path = [...path, { type: 'draw' }];
    } else if (n > 0 && recyclesLeft > 0) {
      recyclesLeft--;
      p = 0;
      path = [...path, { type: 'recycle' }];
    } else break;
  }
  return out;
}

/** Equivalent to applyMoves(s, pos.path) without replaying every draw. */
export function jumpToStock(s: GameState, pos: StockPosition): GameState {
  if (pos.path.length === 0) return s;
  const seq = drawSequence(s);
  const recycles = pos.path.filter((m) => m.type === 'recycle').length;
  const penalty = s.scoring === 'standard' ? (s.drawCount === 1 ? 100 : 20) * recycles : 0;
  return {
    ...s,
    waste: seq.slice(0, pos.p),
    stock: seq.slice(pos.p).reverse(),
    recycles: s.recycles + recycles,
    moves: s.moves + pos.path.length,
    score: s.scoring === 'standard' ? Math.max(0, s.score - penalty) : s.score,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/engine`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine tests
git commit -m "feat(engine): move generation, safe auto-moves, stock cycle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Engine — productive-move detection and heuristic hint

**Files:**
- Create: `src/engine/analysis.ts`
- Test: `tests/engine/analysis.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `hasProductiveMove(s): boolean` — false means "No moves left" (only pointless stock cycling / shuffles remain). Respects Vegas recycle limits.
  - `heuristicHint(s): Move | null` — a sensible next move without the solver; `null` iff `!hasProductiveMove(s)`.
  - Test fixtures `DEAD_STATE`/`EASY_STATE` are defined in `tests/fixtures.ts` and reused by solver tests.

- [ ] **Step 1: Write fixtures and failing tests**

`tests/fixtures.ts`:
```ts
import { cards, makeState, upTo } from './helpers';

/** Black suits complete, red suits at ace; every column is red-only with 2♥/2♦ buried. No legal productive move exists. */
export const DEAD_STATE = makeState({
  foundations: [upTo('S', 13), upTo('H', 1), upTo('D', 1), upTo('C', 13)],
  cols: [
    ['2H 3H 4H 5H', 3],
    ['2D 3D 4D 5D', 3],
    ['6H 7H 8H', 2],
    ['6D 7D 8D', 2],
    ['9H TH JH', 2],
    ['9D TD JD', 2],
    ['QH KH QD KD', 3],
  ],
});

/** Same cards, stacked so every column plays straight up. Winnable. */
export const EASY_STATE = makeState({
  foundations: [upTo('S', 13), upTo('H', 1), upTo('D', 1), upTo('C', 13)],
  cols: [
    ['5H 4H 3H 2H', 3],
    ['5D 4D 3D 2D', 3],
    ['8H 7H 6H', 2],
    ['8D 7D 6D', 2],
    ['JH TH 9H', 2],
    ['JD TD 9D', 2],
    ['KD KH QD QH', 3],
  ],
});

/** All face up, draw-3: 6♥ always lands on top of 5♥ in the stock and nothing can move. Unwinnable. */
export const STUCK_DRAW3 = makeState({
  drawCount: 3,
  foundations: [upTo('S', 13), upTo('H', 4), upTo('D', 13), upTo('C', 13)],
  cols: [['8H', 0], ['9H', 0], ['TH', 0], ['JH', 0], ['QH', 0], ['KH', 0], ['7H', 0]],
  stock: cards('6H 5H'), // 5♥ is the stock top; one draw-3 turns both and leaves 6♥ showing
});

/** The same layout in draw-1 finishes: draw 5♥, play, draw 6♥, play, then the tableau runs up. */
export const FINISH_DRAW1 = { ...STUCK_DRAW3, drawCount: 1 as const };
```

`tests/engine/analysis.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hasProductiveMove, heuristicHint } from '../../src/engine/analysis';
import { canMove } from '../../src/engine/rules';
import { deal } from '../../src/engine/deal';
import { cards, makeState, upTo } from '../helpers';
import { DEAD_STATE, EASY_STATE, STUCK_DRAW3 } from '../fixtures';

describe('hasProductiveMove', () => {
  it('is true on a fresh deal', () => {
    expect(hasProductiveMove(deal(1, 1, 'standard'))).toBe(true);
  });
  it('is false for a dead position', () => {
    expect(hasProductiveMove(DEAD_STATE)).toBe(false);
    expect(hasProductiveMove(STUCK_DRAW3)).toBe(false);
  });
  it('sees a playable card deeper in the stock', () => {
    // 8♣ is drawn first, then A♥
    expect(hasProductiveMove(makeState({ stock: cards('AH 8C') }))).toBe(true);
  });
  it('ignores moving a lone king between empty columns', () => {
    // Q♠ is deliberately absent, so K♠ can only shuffle between empty columns
    const s = makeState({ foundations: [upTo('S', 11), upTo('H', 13), upTo('D', 13), upTo('C', 13)], cols: [['KS', 0]] });
    expect(hasProductiveMove(s)).toBe(false);
  });
});

describe('heuristicHint', () => {
  it('prefers a foundation move', () => {
    expect(heuristicHint(EASY_STATE)).toEqual({ type: 'move', from: 'T0', to: 'F1', count: 1 });
  });
  it('suggests drawing when the useful card is in the stock', () => {
    const s = makeState({ stock: cards('AH 8C') });
    expect(heuristicHint(s)).toEqual({ type: 'draw' });
  });
  it('returns null when there is nothing productive', () => {
    expect(heuristicHint(DEAD_STATE)).toBeNull();
  });
  it('returns legal moves on real deals', () => {
    let hints = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = deal(seed, 3, 'standard');
      const h = heuristicHint(s);
      if (h) {
        hints++;
        expect(canMove(s, h)).toBe(true);
      }
    }
    expect(hints).toBeGreaterThanOrEqual(18);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/analysis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/engine/analysis.ts`:
```ts
import { rankOf } from './cards';
import { destinationsFor } from './movegen';
import { canDraw, canPlayToFoundation, canRecycle } from './rules';
import { drawSequence, jumpToStock, reachableStockPositions } from './stock';
import type { GameState, Move, PileId } from './types';

function kingCouldUseEmptyColumn(s: GameState, exceptCol: number): boolean {
  if (drawSequence(s).some((card) => rankOf(card) === 13)) return true;
  return s.tableau.some(
    (col, i) => i !== exceptCol && col.cards.some((card, idx) => idx > 0 && idx >= col.faceUpFrom && rankOf(card) === 13),
  );
}

const toTableau = (dests: PileId[]) => dests.filter((d) => d[0] === 'T');

/** Moves available right now (no stock movement), best first. Only "productive" moves are returned. */
function productiveMovesNow(s: GameState): Move[] {
  const out: Move[] = [];
  const reveal: { m: Move; hidden: number }[] = [];
  const mv = (from: PileId, to: PileId, count: number): Move => ({ type: 'move', from, to, count });

  s.tableau.forEach((col, i) => {
    const top = col.cards[col.cards.length - 1];
    if (top !== undefined && canPlayToFoundation(s, top)) out.push(mv(`T${i}`, `F${Math.floor(top / 13)}`, 1));
  });
  const wasteTop = s.waste[s.waste.length - 1];
  if (wasteTop !== undefined && canPlayToFoundation(s, wasteTop)) out.push(mv('W', `F${Math.floor(wasteTop / 13)}`, 1));

  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    if (!up) return;
    const dests = toTableau(destinationsFor(s, `T${i}`, up));
    if (!dests.length) return;
    if (col.faceUpFrom > 0) reveal.push({ m: mv(`T${i}`, dests[0], up), hidden: col.faceUpFrom });
  });
  reveal.sort((a, b) => b.hidden - a.hidden).forEach((r) => out.push(r.m));

  if (wasteTop !== undefined) {
    const dests = toTableau(destinationsFor(s, 'W', 1));
    if (dests.length) out.push(mv('W', dests[0], 1));
  }

  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    for (let n = 1; n < up; n++) {
      const exposed = col.cards[col.cards.length - n - 1];
      const dests = toTableau(destinationsFor(s, `T${i}`, n));
      if (dests.length && canPlayToFoundation(s, exposed)) out.push(mv(`T${i}`, dests[0], n));
    }
    if (up && col.faceUpFrom === 0) {
      const dests = toTableau(destinationsFor(s, `T${i}`, up)).filter((d) => s.tableau[Number(d.slice(1))].cards.length > 0);
      if (dests.length && kingCouldUseEmptyColumn(s, i)) out.push(mv(`T${i}`, dests[0], up));
    }
  });
  return out;
}

/** True if some move other than pointless stock cycling or shuffling would make progress. */
export function hasProductiveMove(s: GameState): boolean {
  if (productiveMovesNow(s).length) return true;
  const seq = drawSequence(s);
  for (const pos of reachableStockPositions(s)) {
    if (pos.p === 0 || pos.path.length === 0) continue;
    const at = jumpToStock(s, pos);
    const card = seq[pos.p - 1];
    if (canPlayToFoundation(at, card) || toTableau(destinationsFor(at, 'W', 1)).length) return true;
  }
  return false;
}

/** Best-effort hint without search. Null iff there is no productive move. */
export function heuristicHint(s: GameState): Move | null {
  const now = productiveMovesNow(s);
  if (now.length) return now[0];
  if (!hasProductiveMove(s)) return null;
  if (canDraw(s)) return { type: 'draw' };
  if (canRecycle(s)) return { type: 'recycle' };
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine tests
git commit -m "feat(engine): productive-move detection and heuristic hint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Solver — depth-first search with transposition table

**Files:**
- Create: `src/solver/solve.ts`, `scripts/bench-solver.ts`
- Test: `tests/solver/solve.test.ts`

**Interfaces:**
- Consumes: engine (`applyMoves`, `canMove`, `canPlayToFoundation`, `applySafeMoves`, `isWon`, `drawSequence`, `jumpToStock`, `reachableStockPositions`).
- Produces:
  - `type SolveResult = { status: 'winnable'; solution: Move[]; nodes: number } | { status: 'unwinnable'; nodes: number } | { status: 'unknown'; nodes: number }`
  - `interface SolveOptions { maxNodes: number; deadline?: number /* Date.now() ms */; shouldCancel?: () => boolean; limitRecycles?: boolean }`
  - `solve(state, opts): SolveResult` — `solution` is a list of primitive engine moves (including draws, recycles and the safe moves the solver auto-applied) that `applyMoves(state, solution)` turns into a won state. Without `limitRecycles`, recycles are treated as unlimited (Vegas states are solved as if standard). Deterministic.
  - `stateKey(s, limitRecycles): string`

**How the search works (read before coding):**
1. At every node, apply safe foundation moves first (from the waste only in draw-1) and record them in the path.
2. Key the state: foundation heights + tableau columns sorted as strings (symmetric column orders collapse) + stock draw sequence + stock position. With unlimited recycles the position is normalised: draw-1 → always 0 (every position is reachable from every other); draw-3 → 0 when on the 3-grid or at the end. A seen key is skipped.
3. Candidate moves, lowest priority number first: tableau→foundation (0); waste→foundation at the current position (0.5); tableau run that reveals a face-down card (≈1, more hidden cards first); partial run that exposes a foundation-playable card (2); stock compound move ending in waste→foundation (2.5) or waste→tableau (2.6); whole-column move onto a non-empty column when a king is waiting (3).
4. First pass is **pruned** (only the candidates above). If it exhausts, a second **complete** pass also allows every partial-run move (4), every whole-column move onto a non-empty column (3) and foundation→tableau (5). Only an exhausted complete pass returns `unwinnable`. Any budget/deadline/cancel hit returns `unknown`.

- [ ] **Step 1: Write the failing tests**

`tests/solver/solve.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { solve, stateKey } from '../../src/solver/solve';
import { applyMove, applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';
import { DEAD_STATE, EASY_STATE, STUCK_DRAW3 } from '../fixtures';

describe('stateKey', () => {
  it('ignores column order', () => {
    const a = makeState({ cols: [['KS', 0], ['QH', 0]] });
    const b = makeState({ cols: [['QH', 0], ['KS', 0]] });
    expect(stateKey(a, false)).toBe(stateKey(b, false));
  });
  it('ignores the draw-1 stock position', () => {
    const s = makeState({ stock: cards('2C 3C') });
    expect(stateKey(applyMove(s, { type: 'draw' }), false)).toBe(stateKey(s, false));
  });
  it('keeps an off-grid draw-3 position distinct', () => {
    const s = makeState({ drawCount: 3, stock: cards('2C 3C 4C 5C') });
    expect(stateKey(applyMove(s, { type: 'draw' }), false)).toBe(stateKey(s, false));
    const off = makeState({ drawCount: 3, waste: cards('5C'), stock: cards('2C 3C 4C') });
    expect(stateKey(off, false)).not.toBe(stateKey(s, false));
  });
});

describe('solve', () => {
  it('solves an easy position with a replayable solution', () => {
    const r = solve(EASY_STATE, { maxNodes: 10_000 });
    expect(r.status).toBe('winnable');
    if (r.status === 'winnable') expect(isWon(applyMoves(EASY_STATE, r.solution))).toBe(true);
  });
  it('proves dead positions unwinnable', () => {
    expect(solve(DEAD_STATE, { maxNodes: 10_000 }).status).toBe('unwinnable');
    expect(solve(STUCK_DRAW3, { maxNodes: 10_000 }).status).toBe('unwinnable');
  });
  it('returns unknown when the budget runs out', () => {
    expect(solve(deal(1, 1, 'standard'), { maxNodes: 1 }).status).toBe('unknown');
  });
  it('returns unknown when cancelled', () => {
    expect(solve(deal(1, 1, 'standard'), { maxNodes: 1e7, shouldCancel: () => true }).status).toBe('unknown');
  });
  it('solves most real draw-1 deals, and every solution replays to a win', () => {
    let winnable = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const start = deal(seed, 1, 'standard');
      const r = solve(start, { maxNodes: 200_000 });
      if (r.status === 'winnable') {
        winnable++;
        expect(isWon(applyMoves(start, r.solution)), `seed ${seed}`).toBe(true);
      }
    }
    expect(winnable).toBeGreaterThanOrEqual(6);
  }, 120_000);
  it('honours Vegas recycle limits when asked', () => {
    const start = deal(4, 3, 'vegas');
    const r = solve(start, { maxNodes: 200_000, limitRecycles: true });
    if (r.status === 'winnable') expect(isWon(applyMoves(start, r.solution))).toBe(true);
    expect(['winnable', 'unwinnable', 'unknown']).toContain(r.status);
  }, 60_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/solver/solve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the solver**

`src/solver/solve.ts`:
```ts
import { rankOf, suitIndex } from '../engine/cards';
import { applyMoves } from '../engine/apply';
import { canMove, canPlayToFoundation } from '../engine/rules';
import { applySafeMoves, isWon } from '../engine/movegen';
import { drawSequence, jumpToStock, reachableStockPositions } from '../engine/stock';
import type { GameState, Move, PileId } from '../engine/types';

export type SolveResult =
  | { status: 'winnable'; solution: Move[]; nodes: number }
  | { status: 'unwinnable'; nodes: number }
  | { status: 'unknown'; nodes: number };

export interface SolveOptions {
  maxNodes: number;
  /** Absolute time (Date.now()) after which the search gives up with 'unknown'. */
  deadline?: number;
  shouldCancel?: () => boolean;
  /** Respect Vegas recycle limits (used by auto-finish). Default: unlimited recycles. */
  limitRecycles?: boolean;
}

export function stateKey(s: GameState, limitRecycles: boolean): string {
  const cols = s.tableau
    .map((col) => `${col.faceUpFrom}:${col.cards.join('.')}`)
    .sort()
    .join('/');
  const found = s.foundations.map((f) => f.length).join('.');
  const seq = drawSequence(s);
  let p = s.waste.length;
  if (limitRecycles) return `${found}|${cols}|${seq.join('.')}|${p}|${s.recycles}`;
  if (s.drawCount === 1 || p % 3 === 0 || p === seq.length) p = 0;
  return `${found}|${cols}|${seq.join('.')}|${p}`;
}

interface Candidate {
  moves: Move[];
  priority: number;
}

const mv = (from: PileId, to: PileId, count: number): Move => ({ type: 'move', from, to, count });

function kingWaiting(s: GameState): boolean {
  if (drawSequence(s).some((card) => rankOf(card) === 13)) return true;
  return s.tableau.some((col) => col.cards.some((card, i) => i > 0 && i >= col.faceUpFrom && rankOf(card) === 13));
}

function candidates(s: GameState, complete: boolean, limitRecycles: boolean): Candidate[] {
  const out: Candidate[] = [];

  s.tableau.forEach((col, i) => {
    const top = col.cards[col.cards.length - 1];
    if (top !== undefined && canPlayToFoundation(s, top)) out.push({ moves: [mv(`T${i}`, `F${suitIndex(top)}`, 1)], priority: 0 });
  });

  const waiting = kingWaiting(s);
  s.tableau.forEach((col, i) => {
    const up = col.cards.length - col.faceUpFrom;
    for (let n = 1; n <= up; n++) {
      const whole = n === up;
      for (let j = 0; j < 7; j++) {
        if (j === i) continue;
        const m = mv(`T${i}`, `T${j}`, n);
        if (!canMove(s, m)) continue;
        if (whole && col.faceUpFrom > 0) {
          out.push({ moves: [m], priority: 1 - col.faceUpFrom / 100 });
        } else if (whole) {
          if (s.tableau[j].cards.length === 0) continue; // king-led column to another empty column: pointless
          if (complete || waiting) out.push({ moves: [m], priority: 3 });
        } else if (canPlayToFoundation(s, col.cards[col.cards.length - n - 1])) {
          out.push({ moves: [m], priority: 2 });
        } else if (complete) {
          out.push({ moves: [m], priority: 4 });
        }
      }
    }
  });

  const seq = drawSequence(s);
  for (const pos of reachableStockPositions(s, !limitRecycles)) {
    if (pos.p === 0) continue;
    const card = seq[pos.p - 1];
    const at = pos.path.length ? jumpToStock(s, pos) : s;
    const moved = pos.path.length > 0;
    if (canPlayToFoundation(at, card)) out.push({ moves: [...pos.path, mv('W', `F${suitIndex(card)}`, 1)], priority: moved ? 2.5 : 0.5 });
    for (let j = 0; j < 7; j++) {
      const m = mv('W', `T${j}`, 1);
      if (canMove(at, m)) out.push({ moves: [...pos.path, m], priority: 2.6 });
    }
  }

  if (complete) {
    s.foundations.forEach((f, i) => {
      if (!f.length) return;
      for (let j = 0; j < 7; j++) {
        const m = mv(`F${i}`, `T${j}`, 1);
        if (canMove(s, m)) out.push({ moves: [m], priority: 5 });
      }
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

type Outcome = 'won' | 'exhausted' | 'budget';

class Search {
  nodes = 0;
  readonly path: Move[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly opts: SolveOptions,
    private readonly complete: boolean,
    private readonly budget: number,
  ) {}

  dfs(s: GameState): Outcome {
    const safe = applySafeMoves(s, s.drawCount === 1);
    this.path.push(...safe.moves);
    const cur = safe.state;
    if (isWon(cur)) return 'won';

    const key = stateKey(cur, !!this.opts.limitRecycles);
    if (this.seen.has(key)) {
      this.path.length -= safe.moves.length;
      return 'exhausted';
    }
    this.seen.add(key);

    if (++this.nodes > this.budget) return 'budget';
    if ((this.nodes & 255) === 0) {
      if (this.opts.deadline !== undefined && Date.now() > this.opts.deadline) return 'budget';
      if (this.opts.shouldCancel?.()) return 'budget';
    }

    for (const c of candidates(cur, this.complete, !!this.opts.limitRecycles)) {
      this.path.push(...c.moves);
      const r = this.dfs(applyMoves(cur, c.moves));
      if (r !== 'exhausted') return r;
      this.path.length -= c.moves.length;
    }
    this.path.length -= safe.moves.length;
    return 'exhausted';
  }
}

export function solve(state: GameState, opts: SolveOptions): SolveResult {
  if (opts.shouldCancel?.()) return { status: 'unknown', nodes: 0 };
  // Scoring never affects legality except Vegas recycle limits; drop it unless limits must be honoured.
  const root: GameState = opts.limitRecycles ? state : { ...state, scoring: 'none' };

  const pruned = new Search(opts, false, opts.maxNodes);
  const r1 = pruned.dfs(root);
  if (r1 === 'won') return { status: 'winnable', solution: pruned.path.slice(), nodes: pruned.nodes };
  if (r1 === 'budget') return { status: 'unknown', nodes: pruned.nodes };

  const full = new Search(opts, true, opts.maxNodes - pruned.nodes);
  const r2 = full.dfs(root);
  const nodes = pruned.nodes + full.nodes;
  if (r2 === 'won') return { status: 'winnable', solution: full.path.slice(), nodes };
  return r2 === 'exhausted' ? { status: 'unwinnable', nodes } : { status: 'unknown', nodes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/solver/solve.test.ts`
Expected: PASS. If "solves most real draw-1 deals" fails on the count, do not lower the bar yet — go to Step 5 and benchmark first.

- [ ] **Step 5: Add and run the benchmark**

`scripts/bench-solver.ts`:
```ts
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
```

Run: `npm run bench -- 100 200000`
Expected (acceptance): draw-1 `winnable` ≥ 70 of 100 and median ≤ 500 ms. Paste the output into the task report.

If acceptance fails, profile before changing behaviour (`node --cpu-prof --import tsx scripts/bench-solver.ts 30`). Allowed optimisations, in order: (a) skip generating waste→tableau candidates to an *empty* column when another empty column has a lower index (symmetry); (b) cache `drawSequence` per node; (c) in `stateKey`, build the string with array `join` once. Re-run tests after each change. Do not change which moves are legal or add non-safe pruning to the complete pass.

- [ ] **Step 6: Commit**

```bash
git add src/solver scripts/bench-solver.ts tests/solver
git commit -m "feat(solver): DFS solver with transposition table and pruning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Solver — auto-finish and last-winnable search

**Files:**
- Create: `src/solver/autoFinish.ts`, `src/solver/rewind.ts`
- Test: `tests/solver/autoFinish.test.ts`, `tests/solver/rewind.test.ts`

**Interfaces:**
- Consumes: `solve` (Task 6), engine.
- Produces:
  - `lowestFoundationMove(s): Move | null`
  - `autoFinish(s): Move[] | null` — null unless every tableau card is face up and a finish exists (respecting Vegas recycle limits); otherwise the full move list to a won state.
  - `findLastWinnable(states: GameState[], isWinnable: (s: GameState) => boolean): number` — index of the most recent state for which `isWinnable` is true, assuming `states[0]` is winnable and winnability never returns once lost; −1 for an empty list.

- [ ] **Step 1: Write the failing tests**

`tests/solver/autoFinish.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { autoFinish } from '../../src/solver/autoFinish';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { deal } from '../../src/engine/deal';
import { makeState, upTo } from '../helpers';
import { FINISH_DRAW1, STUCK_DRAW3 } from '../fixtures';

describe('autoFinish', () => {
  it('finishes an all-face-up draw-1 game with cards left in the stock', () => {
    const moves = autoFinish(FINISH_DRAW1);
    expect(moves).not.toBeNull();
    expect(isWon(applyMoves(FINISH_DRAW1, moves!))).toBe(true);
  });
  it('returns null when a draw-3 stock order makes finishing impossible', () => {
    expect(autoFinish(STUCK_DRAW3)).toBeNull();
  });
  it('returns null while cards are face down', () => {
    expect(autoFinish(deal(1, 1, 'standard'))).toBeNull();
  });
  it('falls back to the solver when a tableau move is needed', () => {
    // K♥ sits on 6♦; greedy can't play anything, but moving K♥ to an empty column unlocks everything.
    const s = makeState({
      foundations: [upTo('S', 13), upTo('H', 11), upTo('D', 5), upTo('C', 13)],
      cols: [['QH 6D KH', 0], ['KD QD JD TD 9D 8D 7D', 0]],
    });
    const moves = autoFinish(s);
    expect(moves).not.toBeNull();
    expect(isWon(applyMoves(s, moves!))).toBe(true);
  });
});
```

`tests/solver/rewind.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findLastWinnable } from '../../src/solver/rewind';
import { deal } from '../../src/engine/deal';

const states = Array.from({ length: 10 }, (_, i) => ({ ...deal(1, 1, 'standard'), moves: i }));

describe('findLastWinnable', () => {
  it('returns the newest state when it is winnable', () => {
    expect(findLastWinnable(states, () => true)).toBe(9);
  });
  it('binary-searches the boundary', () => {
    const checked: number[] = [];
    const idx = findLastWinnable(states, (s) => {
      checked.push(s.moves);
      return s.moves <= 5;
    });
    expect(idx).toBe(5);
    expect(checked.length).toBeLessThanOrEqual(5);
  });
  it('falls back to the start', () => {
    expect(findLastWinnable(states, (s) => s.moves === 0)).toBe(0);
  });
  it('handles an empty history', () => {
    expect(findLastWinnable([], () => true)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/solver`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/solver/autoFinish.ts`:
```ts
import { rankOf, suitIndex, type CardId } from '../engine/cards';
import { applyMove } from '../engine/apply';
import { canDraw, canPlayToFoundation, canRecycle } from '../engine/rules';
import { allFaceUp, isWon } from '../engine/movegen';
import type { GameState, Move, PileId } from '../engine/types';
import { solve } from './solve';

/** The lowest-ranked card (waste top or tableau top) that can go to its foundation. */
export function lowestFoundationMove(s: GameState): Move | null {
  const sources: [PileId, CardId | undefined][] = [['W', s.waste[s.waste.length - 1]]];
  s.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
  let best: Move | null = null;
  let bestRank = Infinity;
  for (const [from, card] of sources) {
    if (card === undefined || !canPlayToFoundation(s, card)) continue;
    if (rankOf(card) < bestRank) {
      bestRank = rankOf(card);
      best = { type: 'move', from, to: `F${suitIndex(card)}`, count: 1 };
    }
  }
  return best;
}

export function autoFinish(s: GameState): Move[] | null {
  if (isWon(s) || !allFaceUp(s)) return null;

  const moves: Move[] = [];
  let cur = s;
  let idle = 0;
  while (!isWon(cur)) {
    const m = lowestFoundationMove(cur);
    if (m) {
      cur = applyMove(cur, m);
      moves.push(m);
      idle = 0;
      continue;
    }
    const step: Move | null = canDraw(cur) ? { type: 'draw' } : canRecycle(cur) ? { type: 'recycle' } : null;
    if (!step || idle > cur.stock.length + cur.waste.length + 1) break;
    cur = applyMove(cur, step);
    moves.push(step);
    idle++;
  }
  if (isWon(cur)) return moves;

  const r = solve(s, { maxNodes: 50_000, limitRecycles: true });
  return r.status === 'winnable' ? r.solution : null;
}
```

`src/solver/rewind.ts`:
```ts
import type { GameState } from '../engine/types';

/**
 * Index of the most recent winnable state. Assumes states[0] is winnable (bank deals are) and that
 * once a line is lost it stays lost, so the boundary can be binary-searched.
 */
export function findLastWinnable(states: readonly GameState[], isWinnable: (s: GameState) => boolean): number {
  if (states.length === 0) return -1;
  let lo = 0;
  let hi = states.length - 1;
  if (isWinnable(states[hi])) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (isWinnable(states[mid])) lo = mid;
    else hi = mid;
  }
  return lo;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/solver`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solver tests/solver
git commit -m "feat(solver): auto-finish and last-winnable search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Winnable deal bank

**Files:**
- Create: `scripts/build-deals.ts`, `scripts/deal-worker.ts`, `src/deals/bank.ts`, `src/deals/bank-draw1.json` (generated), `src/deals/bank-draw3.json` (generated)
- Test: `tests/deals/bank.test.ts`

**Interfaces:**
- Consumes: `deal`, `solve`, `mulberry32`.
- Produces:
  - `interface Bank { version: 1; drawCount: DrawCount; maxNodes: number; entries: [seed: number, solutionLength: number][] }`
  - `bankFor(drawCount): Bank`
  - `pickSeed(drawCount, recent: readonly number[], rand = Math.random): number` — random bank seed not in `recent` (falls back to the whole bank if every seed is recent)

- [ ] **Step 1: Write the build script and worker**

`scripts/deal-worker.ts`:
```ts
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
```

`scripts/build-deals.ts`:
```ts
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/engine/rng';
import type { DrawCount } from '../src/engine/types';

const TARGET = Number(process.env.TARGET ?? 2000);
const MAX_NODES = Number(process.env.MAX_NODES ?? 1_000_000);
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
```

- [ ] **Step 2: Smoke-test the build script with a tiny target**

Run: `TARGET=20 MAX_NODES=200000 npm run deals`
Expected: logs a "done: banked 20" line per mode and writes both JSON files. If the worker fails to load TypeScript, confirm `tsx` is installed and Node ≥ 20.6 (`node -v`).

- [ ] **Step 3: Write the failing bank tests**

`tests/deals/bank.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { bankFor, pickSeed } from '../../src/deals/bank';
import { deal } from '../../src/engine/deal';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import { solve } from '../../src/solver/solve';

const FULL = !!process.env.FULL_DEALS;
const MIN_ENTRIES = Number(process.env.MIN_BANK ?? 2000);

describe.each([1, 3] as const)('draw-%i bank', (drawCount) => {
  const bank = bankFor(drawCount);

  it('holds enough unique uint32 seeds', () => {
    expect(bank.drawCount).toBe(drawCount);
    expect(bank.entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
    const seeds = bank.entries.map(([seed]) => seed);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const s of seeds) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });

  it('re-solves banked seeds to replayable wins', () => {
    const sample = FULL ? bank.entries : bank.entries.filter((_, i) => i % 100 === 0);
    for (const [seed, length] of sample) {
      const start = deal(seed, drawCount, 'standard');
      const r = solve(start, { maxNodes: bank.maxNodes });
      expect(r.status, `seed ${seed}`).toBe('winnable');
      if (r.status !== 'winnable') continue;
      expect(r.solution.length).toBe(length);
      expect(isWon(applyMoves(start, r.solution))).toBe(true);
    }
  }, FULL ? 3_600_000 : 300_000);
});

describe('pickSeed', () => {
  const bank = bankFor(1);
  const seeds = bank.entries.map(([s]) => s);

  it('never returns a recent seed while others remain', () => {
    const recent = seeds.slice(1);
    for (let i = 0; i < 20; i++) expect(pickSeed(1, recent)).toBe(seeds[0]);
  });
  it('falls back to the whole bank when everything is recent', () => {
    expect(seeds).toContain(pickSeed(1, seeds));
  });
  it('uses the supplied random source', () => {
    expect(pickSeed(1, [], () => 0)).toBe(seeds[0]);
    expect(pickSeed(1, [], () => 0.999999)).toBe(seeds[seeds.length - 1]);
  });
});
```

- [ ] **Step 4: Implement the bank module**

`src/deals/bank.ts`:
```ts
import type { DrawCount } from '../engine/types';
import draw1 from './bank-draw1.json';
import draw3 from './bank-draw3.json';

export interface Bank {
  version: 1;
  drawCount: DrawCount;
  maxNodes: number;
  entries: [seed: number, solutionLength: number][];
}

const BANKS: Record<DrawCount, Bank> = {
  1: draw1 as unknown as Bank,
  3: draw3 as unknown as Bank,
};

export const bankFor = (drawCount: DrawCount): Bank => BANKS[drawCount];

export function pickSeed(drawCount: DrawCount, recent: readonly number[], rand: () => number = Math.random): number {
  const entries = bankFor(drawCount).entries;
  const recentSet = new Set(recent);
  const pool = entries.filter(([seed]) => !recentSet.has(seed));
  const from = pool.length ? pool : entries;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))][0];
}
```

- [ ] **Step 5: Run the tests against the tiny bank**

Run: `MIN_BANK=20 npx vitest run tests/deals`
Expected: PASS (the sample is entry 0 only at this size).

- [ ] **Step 6: Build the real bank**

Run: `npm run deals`
Expected: both modes finish with "banked 2000". Record wall-clock time and the winnable/unwinnable/unknown counts in the task report. (If draw-3 takes more than 30 minutes, stop and report — do not reduce TARGET without approval.)

- [ ] **Step 7: Run the bank tests at full size**

Run: `npx vitest run tests/deals`
Expected: PASS (2000+ entries each; 20 sampled replays per mode).

- [ ] **Step 8: Commit**

```bash
git add scripts/build-deals.ts scripts/deal-worker.ts src/deals tests/deals
git commit -m "feat(deals): multi-core winnable seed bank (2000 per draw mode)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Game session reducer and timer

**Files:**
- Create: `src/game/timer.ts`, `src/game/session.ts`
- Test: `tests/game/timer.test.ts`, `tests/game/session.test.ts`

**Interfaces:**
- Consumes: engine, `autoFinish` (Task 7).
- Produces:
  - `interface Timer { accumulatedMs: number; runningSince: number | null }`; `newTimer()`, `startTimer(t, now)`, `pauseTimer(t, now)`, `elapsed(t, now)`
  - `type Status = 'playing' | 'finishing' | 'won'`
  - `interface Session { seed; drawCount; scoring; state: GameState; history: GameState[]; turns: Move[][]; redo: Move[][]; undos: number; timer: Timer; status: Status; finishQueue: Move[] }` — `history[i]` is the state before `turns[i]`. While `status === 'finishing'` the finish sequence is already recorded as the last turn; `state` advances one `finishStep` at a time.
  - `type Action = {type:'new'; seed; drawCount; scoring} | {type:'restart'} | {type:'turn'; moves: Move[]; autoPlay: boolean; now: number} | {type:'undo'} | {type:'redo'; now: number} | {type:'rewindTo'; index: number} | {type:'finishStep'; now: number} | {type:'pause'; now: number} | {type:'resume'; now: number} | {type:'load'; session: Session}`
  - `newSession(seed, drawCount, scoring): Session`, `sessionReducer(s, a): Session` (returns the same object when an action is a no-op)

- [ ] **Step 1: Write the failing tests**

`tests/game/timer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { elapsed, newTimer, pauseTimer, startTimer } from '../../src/game/timer';

describe('timer', () => {
  it('accumulates only while running', () => {
    let t = newTimer();
    expect(elapsed(t, 1000)).toBe(0);
    t = startTimer(t, 1000);
    expect(elapsed(t, 4000)).toBe(3000);
    t = pauseTimer(t, 5000);
    expect(elapsed(t, 9000)).toBe(4000);
    t = startTimer(t, 10_000);
    expect(elapsed(t, 10_500)).toBe(4500);
  });
  it('start and pause are idempotent', () => {
    const t = startTimer(newTimer(), 100);
    expect(startTimer(t, 500)).toBe(t);
    const p = pauseTimer(t, 200);
    expect(pauseTimer(p, 900)).toBe(p);
  });
});
```

`tests/game/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newSession, sessionReducer, type Session } from '../../src/game/session';
import { elapsed } from '../../src/game/timer';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import type { GameState, Move } from '../../src/engine/types';
import { cards, makeState, upTo } from '../helpers';

const draw: Move = { type: 'draw' };
const withState = (state: GameState): Session => ({ ...newSession(1, state.drawCount, state.scoring), state });
const turn = (s: Session, moves: Move[], autoPlay = false, now = 1000) =>
  sessionReducer(s, { type: 'turn', moves, autoPlay, now });

describe('session', () => {
  it('starts playing with a stopped timer', () => {
    const s = newSession(42, 1, 'standard');
    expect(s.status).toBe('playing');
    expect(s.timer.runningSince).toBeNull();
    expect(s.state.seed).toBe(42);
  });

  it('records a turn and starts the timer', () => {
    const s = turn(newSession(42, 1, 'standard'), [draw], false, 5000);
    expect(s.history).toHaveLength(1);
    expect(s.turns).toEqual([[draw]]);
    expect(s.state.waste).toHaveLength(1);
    expect(s.timer.runningSince).toBe(5000);
  });

  it('ignores illegal turns', () => {
    const s = newSession(42, 1, 'standard');
    expect(turn(s, [{ type: 'recycle' }])).toBe(s);
  });

  it('undo and redo round-trip; a new turn clears redo', () => {
    const s0 = newSession(42, 1, 'standard');
    const s1 = turn(s0, [draw]);
    const s2 = turn(s1, [draw]);
    const u = sessionReducer(s2, { type: 'undo' });
    expect(u.state).toEqual(s1.state);
    expect(u.redo).toHaveLength(1);
    expect(u.undos).toBe(1);
    const r = sessionReducer(u, { type: 'redo', now: 2000 });
    expect(r.state).toEqual(s2.state);
    expect(r.redo).toHaveLength(0);
    expect(turn(u, [draw]).redo).toHaveLength(0);
  });

  it('appends safe auto-moves to the same turn when autoPlay is on', () => {
    const s = withState(makeState({ stock: cards('9C'), cols: [['AS', 0]] }));
    const r = turn(s, [draw], true);
    expect(r.turns[0]).toEqual([draw, { type: 'move', from: 'T0', to: 'F0', count: 1 }]);
    expect(sessionReducer(r, { type: 'undo' }).state).toEqual(s.state);
  });

  it('detects a win and stops the timer', () => {
    const s = withState(
      makeState({ foundations: [upTo('S', 12), upTo('H', 13), upTo('D', 13), upTo('C', 13)], cols: [['KS', 0]] }),
    );
    const started = { ...s, timer: { accumulatedMs: 0, runningSince: 0 } };
    const r = turn(started, [{ type: 'move', from: 'T0', to: 'F0', count: 1 }], false, 7000);
    expect(r.status).toBe('won');
    expect(elapsed(r.timer, 99_999)).toBe(7000);
    expect(sessionReducer(r, { type: 'undo' })).toBe(r);
  });

  it('auto-finishes once the last face-down card is revealed', () => {
    const s = withState(
      makeState({
        foundations: [upTo('S', 13), upTo('H', 4), upTo('D', 12), upTo('C', 13)],
        cols: [['6H KD', 1], ['7H', 0], ['8H', 0], ['9H', 0], ['TH', 0], ['JH', 0], ['QH', 0]],
        stock: cards('KH 5H'),
      }),
    );
    let r = turn(s, [{ type: 'move', from: 'T0', to: 'F2', count: 1 }]);
    expect(r.status).toBe('finishing');
    expect(r.turns).toHaveLength(2);
    expect(r.finishQueue.length).toBeGreaterThan(0);
    expect(turn(r, [draw])).toBe(r); // input locked while finishing
    let steps = 0;
    while (r.status === 'finishing') {
      r = sessionReducer(r, { type: 'finishStep', now: 2000 + steps });
      steps++;
    }
    expect(r.status).toBe('won');
    expect(isWon(r.state)).toBe(true);
    expect(isWon(applyMoves(s.state, r.turns.flat()))).toBe(true);
  });

  it('rewinds to a history index, pushing undone turns onto redo in order', () => {
    let s = newSession(42, 1, 'standard');
    for (let i = 0; i < 3; i++) s = turn(s, [draw]);
    const r = sessionReducer(s, { type: 'rewindTo', index: 1 });
    expect(r.state).toEqual(s.history[1]);
    expect(r.turns).toHaveLength(1);
    expect(r.undos).toBe(2);
    const again = sessionReducer(r, { type: 'redo', now: 0 });
    expect(again.state).toEqual(s.history[2]);
  });

  it('restart deals the same seed again', () => {
    const s = turn(newSession(42, 3, 'vegas'), [draw]);
    const r = sessionReducer(s, { type: 'restart' });
    expect(r.state).toEqual(newSession(42, 3, 'vegas').state);
    expect(r.turns).toHaveLength(0);
  });

  it('pause and resume drive the timer; resume waits for the first move', () => {
    const fresh = newSession(42, 1, 'standard');
    expect(sessionReducer(fresh, { type: 'resume', now: 5 })).toBe(fresh);
    const s = turn(fresh, [draw], false, 1000);
    const p = sessionReducer(s, { type: 'pause', now: 3000 });
    expect(p.timer).toEqual({ accumulatedMs: 2000, runningSince: null });
    const q = sessionReducer(p, { type: 'resume', now: 10_000 });
    expect(elapsed(q.timer, 11_000)).toBe(3000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the timer**

`src/game/timer.ts`:
```ts
export interface Timer {
  accumulatedMs: number;
  runningSince: number | null;
}

export const newTimer = (): Timer => ({ accumulatedMs: 0, runningSince: null });

export const startTimer = (t: Timer, now: number): Timer => (t.runningSince !== null ? t : { ...t, runningSince: now });

export const pauseTimer = (t: Timer, now: number): Timer =>
  t.runningSince === null ? t : { accumulatedMs: t.accumulatedMs + (now - t.runningSince), runningSince: null };

export const elapsed = (t: Timer, now: number): number =>
  t.accumulatedMs + (t.runningSince === null ? 0 : now - t.runningSince);
```

- [ ] **Step 4: Implement the session reducer**

`src/game/session.ts`:
```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/game`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game tests/game
git commit -m "feat(game): session reducer with turns, undo/redo, rewind, auto-finish, timer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Persistence — storage, settings, stats, recent seeds, saved game

**Files:**
- Create: `src/store/storage.ts`, `src/store/settings.ts`, `src/store/stats.ts`, `src/store/recent.ts`, `src/game/persist.ts`, `tests/localStorage.ts`
- Test: `tests/store/store.test.ts`, `tests/game/persist.test.ts`

**Interfaces:**
- Consumes: engine types, `Session`/`newSession` (Task 9).
- Produces:
  - `KEYS = { game: 'sol.v1.game', settings: 'sol.v1.settings', stats: 'sol.v1.stats', recent: 'sol.v1.recent' }`; `readJSON(key): unknown`; `writeJSON(key, value): void`
  - `type Theme = 'classic' | 'minimal'`; `type ColorMode = 'auto' | 'light' | 'dark'`; `type AnimationSpeed = 'normal' | 'fast' | 'off'`
  - `interface Settings { drawCount; scoring; cumulativeVegas; autoPlay; sound; leftHanded; fourColor; theme; colorMode; animation }`; `DEFAULT_SETTINGS`; `parseSettings(raw)`; `loadSettings()`; `saveSettings(s)`
  - `interface ModeStats { played; won; currentStreak; bestStreak; bestTimeMs: number | null; fewestMoves: number | null; bestScore: number | null }`; `interface Stats { v: 1; draw1: ModeStats; draw3: ModeStats; vegasBank: number }`; `interface GameResult { drawCount; scoring; won; timeMs; moves; score }`; `emptyStats()`, `recordResult(stats, r)`, `winRate(m)`, `parseStats(raw)`, `loadStats()`, `saveStats(s)`
  - `RECENT_LIMIT = 200`; `loadRecent(drawCount): number[]`; `pushRecent(drawCount, seed): number[]`
  - `interface SavedGame { v: 1; seed; drawCount; scoring; turns: Move[][]; redo: Move[][]; undos: number; elapsedMs: number }`; `toSaved(s: Session, now): SavedGame`; `fromSaved(raw: unknown): Session | null`; `loadSavedGame(): Session | null`; `saveGame(s: Session, now): void`

- [ ] **Step 1: Write the localStorage stub and failing tests**

`tests/localStorage.ts`:
```ts
export function installLocalStorage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  return m;
}

export function removeLocalStorage(): void {
  delete (globalThis as { localStorage?: unknown }).localStorage;
}
```

`tests/store/store.test.ts`:
```ts
import { beforeEach, describe, it, expect } from 'vitest';
import { installLocalStorage, removeLocalStorage } from '../localStorage';
import { KEYS, readJSON, writeJSON } from '../../src/store/storage';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from '../../src/store/settings';
import { emptyStats, parseStats, recordResult, winRate } from '../../src/store/stats';
import { RECENT_LIMIT, loadRecent, pushRecent } from '../../src/store/recent';

beforeEach(() => {
  installLocalStorage();
});

describe('storage', () => {
  it('survives missing localStorage and bad JSON', () => {
    removeLocalStorage();
    expect(readJSON('x')).toBeNull();
    expect(() => writeJSON('x', 1)).not.toThrow();
    const m = installLocalStorage();
    m.set('x', '{not json');
    expect(readJSON('x')).toBeNull();
  });
});

describe('settings', () => {
  it('defaults garbage and keeps valid fields', () => {
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ drawCount: 3, scoring: 'bogus', sound: false, theme: 'minimal' })).toEqual({
      ...DEFAULT_SETTINGS,
      drawCount: 3,
      sound: false,
      theme: 'minimal',
    });
  });
  it('round-trips through storage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, leftHanded: true });
    expect(loadSettings().leftHanded).toBe(true);
  });
});

describe('stats', () => {
  it('records wins, losses, streaks and bests per draw mode', () => {
    let s = emptyStats();
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 90_000, moves: 120, score: 500 });
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 80_000, moves: 130, score: 400 });
    expect(s.draw1).toMatchObject({ played: 2, won: 2, currentStreak: 2, bestStreak: 2, bestTimeMs: 80_000, fewestMoves: 120, bestScore: 500 });
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: false, timeMs: 10_000, moves: 5, score: 0 });
    expect(s.draw1).toMatchObject({ played: 3, won: 2, currentStreak: 0, bestStreak: 2 });
    expect(winRate(s.draw1)).toBeCloseTo(2 / 3);
    expect(s.draw3.played).toBe(0);
  });
  it('accumulates the Vegas bank', () => {
    let s = recordResult(emptyStats(), { drawCount: 3, scoring: 'vegas', won: false, timeMs: 1, moves: 1, score: -32 });
    s = recordResult(s, { drawCount: 3, scoring: 'vegas', won: true, timeMs: 1, moves: 1, score: 208 });
    expect(s.vegasBank).toBe(176);
    expect(s.draw3.bestScore).toBeNull();
  });
  it('replaces corrupt data with empty stats', () => {
    expect(parseStats({ v: 1, draw1: { played: 'x' } })).toEqual(emptyStats());
    expect(parseStats(null)).toEqual(emptyStats());
  });
});

describe('recent seeds', () => {
  it('dedupes and caps per draw mode', () => {
    for (let i = 0; i < RECENT_LIMIT + 10; i++) pushRecent(1, i);
    pushRecent(1, 5);
    const r = loadRecent(1);
    expect(r).toHaveLength(RECENT_LIMIT);
    expect(r[r.length - 1]).toBe(5);
    expect(r.filter((x) => x === 5)).toHaveLength(1);
    expect(loadRecent(3)).toEqual([]);
  });
  it('ignores corrupt data', () => {
    writeJSON(KEYS.recent, { draw1: ['a', 3] });
    expect(loadRecent(1)).toEqual([]);
  });
});
```

`tests/game/persist.test.ts`:
```ts
import { beforeEach, describe, it, expect } from 'vitest';
import { installLocalStorage } from '../localStorage';
import { fromSaved, loadSavedGame, saveGame, toSaved } from '../../src/game/persist';
import { newSession, sessionReducer, type Session } from '../../src/game/session';
import { KEYS, writeJSON } from '../../src/store/storage';

beforeEach(() => {
  installLocalStorage();
});

function played(): Session {
  let s = newSession(42, 1, 'standard');
  for (let i = 0; i < 4; i++) s = sessionReducer(s, { type: 'turn', moves: [{ type: 'draw' }], autoPlay: false, now: 1000 });
  return sessionReducer(s, { type: 'undo' });
}

describe('saved game', () => {
  it('round-trips through JSON', () => {
    const s = played();
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved(s, 4000))));
    expect(back).not.toBeNull();
    expect(back!.state).toEqual(s.state);
    expect(back!.history).toEqual(s.history);
    expect(back!.redo).toEqual(s.redo);
    expect(back!.undos).toBe(1);
    expect(back!.timer).toEqual({ accumulatedMs: 3000, runningSince: null });
    expect(back!.status).toBe('playing');
  });
  it('rejects wrong versions, bad shapes and illegal moves', () => {
    const good = toSaved(played(), 4000);
    expect(fromSaved({ ...good, v: 2 })).toBeNull();
    expect(fromSaved({ ...good, turns: 'x' })).toBeNull();
    expect(fromSaved({ ...good, turns: [[{ type: 'move', from: 'T0', to: 'F9', count: 1 }]] })).toBeNull();
    expect(fromSaved({ ...good, turns: [[{ type: 'recycle' }]] })).toBeNull();
    expect(fromSaved(null)).toBeNull();
  });
  it('saves to and loads from localStorage', () => {
    const s = played();
    saveGame(s, 4000);
    expect(loadSavedGame()!.state).toEqual(s.state);
    writeJSON(KEYS.game, { garbage: true });
    expect(loadSavedGame()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store tests/game/persist.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement storage, settings, stats, recent**

`src/store/storage.ts`:
```ts
export const KEYS = {
  game: 'sol.v1.game',
  settings: 'sol.v1.settings',
  stats: 'sol.v1.stats',
  recent: 'sol.v1.recent',
} as const;

export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota, blocked) — the game still works, it just won't persist.
  }
}

export const asRecord = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
```

`src/store/settings.ts`:
```ts
import type { DrawCount, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export type Theme = 'classic' | 'minimal';
export type ColorMode = 'auto' | 'light' | 'dark';
export type AnimationSpeed = 'normal' | 'fast' | 'off';

export interface Settings {
  drawCount: DrawCount;
  scoring: Scoring;
  cumulativeVegas: boolean;
  autoPlay: boolean;
  sound: boolean;
  leftHanded: boolean;
  fourColor: boolean;
  theme: Theme;
  colorMode: ColorMode;
  animation: AnimationSpeed;
}

export const DEFAULT_SETTINGS: Settings = {
  drawCount: 1,
  scoring: 'standard',
  cumulativeVegas: false,
  autoPlay: true,
  sound: true,
  leftHanded: false,
  fourColor: false,
  theme: 'classic',
  colorMode: 'auto',
  animation: 'normal',
};

const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function parseSettings(raw: unknown): Settings {
  const r = asRecord(raw);
  const d = DEFAULT_SETTINGS;
  return {
    drawCount: oneOf(r.drawCount, [1, 3] as const, d.drawCount),
    scoring: oneOf(r.scoring, ['standard', 'vegas', 'none'] as const, d.scoring),
    cumulativeVegas: bool(r.cumulativeVegas, d.cumulativeVegas),
    autoPlay: bool(r.autoPlay, d.autoPlay),
    sound: bool(r.sound, d.sound),
    leftHanded: bool(r.leftHanded, d.leftHanded),
    fourColor: bool(r.fourColor, d.fourColor),
    theme: oneOf(r.theme, ['classic', 'minimal'] as const, d.theme),
    colorMode: oneOf(r.colorMode, ['auto', 'light', 'dark'] as const, d.colorMode),
    animation: oneOf(r.animation, ['normal', 'fast', 'off'] as const, d.animation),
  };
}

export const loadSettings = (): Settings => parseSettings(readJSON(KEYS.settings));
export const saveSettings = (s: Settings): void => writeJSON(KEYS.settings, s);
```

`src/store/stats.ts`:
```ts
import type { DrawCount, Scoring } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export interface ModeStats {
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  bestTimeMs: number | null;
  fewestMoves: number | null;
  bestScore: number | null;
}

export interface Stats {
  v: 1;
  draw1: ModeStats;
  draw3: ModeStats;
  vegasBank: number;
}

export interface GameResult {
  drawCount: DrawCount;
  scoring: Scoring;
  won: boolean;
  timeMs: number;
  moves: number;
  score: number;
}

export const emptyModeStats = (): ModeStats => ({
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTimeMs: null,
  fewestMoves: null,
  bestScore: null,
});

export const emptyStats = (): Stats => ({ v: 1, draw1: emptyModeStats(), draw3: emptyModeStats(), vegasBank: 0 });

const lower = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));

export function recordResult(stats: Stats, r: GameResult): Stats {
  const key = r.drawCount === 1 ? 'draw1' : 'draw3';
  const m = stats[key];
  const next: ModeStats = r.won
    ? {
        played: m.played + 1,
        won: m.won + 1,
        currentStreak: m.currentStreak + 1,
        bestStreak: Math.max(m.bestStreak, m.currentStreak + 1),
        bestTimeMs: lower(m.bestTimeMs, r.timeMs),
        fewestMoves: lower(m.fewestMoves, r.moves),
        bestScore: r.scoring === 'standard' ? Math.max(m.bestScore ?? 0, r.score) : m.bestScore,
      }
    : { ...m, played: m.played + 1, currentStreak: 0 };
  return { ...stats, [key]: next, vegasBank: r.scoring === 'vegas' ? stats.vegasBank + r.score : stats.vegasBank };
}

export const winRate = (m: ModeStats): number => (m.played ? m.won / m.played : 0);

const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const countOrNull = (v: unknown) => v === null || count(v);

function parseMode(raw: unknown): ModeStats | null {
  const r = asRecord(raw);
  const ok =
    count(r.played) && count(r.won) && count(r.currentStreak) && count(r.bestStreak) &&
    countOrNull(r.bestTimeMs) && countOrNull(r.fewestMoves) && countOrNull(r.bestScore);
  return ok ? (r as unknown as ModeStats) : null;
}

export function parseStats(raw: unknown): Stats {
  const r = asRecord(raw);
  const draw1 = parseMode(r.draw1);
  const draw3 = parseMode(r.draw3);
  if (r.v !== 1 || !draw1 || !draw3 || typeof r.vegasBank !== 'number' || !Number.isFinite(r.vegasBank)) return emptyStats();
  return { v: 1, draw1, draw3, vegasBank: r.vegasBank };
}

export const loadStats = (): Stats => parseStats(readJSON(KEYS.stats));
export const saveStats = (s: Stats): void => writeJSON(KEYS.stats, s);
```

`src/store/recent.ts`:
```ts
import type { DrawCount } from '../engine/types';
import { KEYS, asRecord, readJSON, writeJSON } from './storage';

export const RECENT_LIMIT = 200;

type Recent = Record<'draw1' | 'draw3', number[]>;

const seeds = (v: unknown): number[] =>
  Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0) ? (v as number[]) : [];

function load(): Recent {
  const r = asRecord(readJSON(KEYS.recent));
  return { draw1: seeds(r.draw1), draw3: seeds(r.draw3) };
}

export const loadRecent = (d: DrawCount): number[] => load()[d === 1 ? 'draw1' : 'draw3'];

export function pushRecent(d: DrawCount, seed: number): number[] {
  const all = load();
  const key = d === 1 ? 'draw1' : 'draw3';
  const next = [...all[key].filter((s) => s !== seed), seed].slice(-RECENT_LIMIT);
  writeJSON(KEYS.recent, { ...all, [key]: next });
  return next;
}
```

- [ ] **Step 4: Implement saved-game conversion**

`src/game/persist.ts`:
```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (entire suite).

- [ ] **Step 6: Commit**

```bash
git add src/store src/game/persist.ts tests
git commit -m "feat(store): validated localStorage for settings, stats, recent seeds, saved game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Card art — vendored Classic set and Modern Minimal renderer

**Files:**
- Create: `scripts/vendor-cards.ts`, `public/cards/classic/*.svg`, `public/cards/classic-4c/*.svg` (generated), `public/cards/LICENSE.txt`, `src/ui/cards/minimal.ts`, `src/ui/CardFront.tsx`
- Test: `tests/ui/cards.test.ts`

**Interfaces:**
- Consumes: `cardCode`, `rankLabel`, `rankOf`, `suitOf`, `Suit`, `CardId`; `Theme` (Task 10).
- Produces:
  - Files `public/cards/{classic,classic-4c}/{AS,2S,…,TS,JS,QS,KS,…,KC}.svg` and `back.svg`, each 240×336 user units.
  - `interface Palette { S; H; D; C; face; edge }` (CSS colour strings); `CSS_PALETTE` (uses `var(--suit-S)` etc.); `SUIT_PATHS: Record<Suit, string>` (100×100 box); `minimalCardSvg(id, palette = CSS_PALETTE): string` (standalone SVG with xmlns, viewBox 0 0 240 336)
  - `<CardFront id theme fourColor />`

- [ ] **Step 1: Write the vendoring script**

`scripts/vendor-cards.ts`:
```ts
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
```

`public/cards/LICENSE.txt`:
```
Classic card art: SVG playing cards by Adrian Kennard (RevK), https://www.me.uk/cards/
Released by the author into the public domain (CC0). Court cards based on 19th-century Goodall & Son designs.
```

- [ ] **Step 2: Run it and inspect**

Run: `npm run cards && ls public/cards/classic | wc -l && du -sh public/cards`
Expected: `53` files per directory; total roughly 1–1.5 MB. Open `public/cards/classic/QH.svg` and `public/cards/classic-4c/2D.svg` in the browser pane (`preview_start` with a `file://` URL) and confirm they render (queen art; blue diamonds).

- [ ] **Step 3: Write the failing tests**

`tests/ui/cards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { cardCode, rankLabel } from '../../src/engine/cards';
import { minimalCardSvg, type Palette } from '../../src/ui/cards/minimal';

const IDS = Array.from({ length: 52 }, (_, i) => i);
const PAL: Palette = { S: '#111111', H: '#cc0000', D: '#0055cc', C: '#008800', face: '#ffffff', edge: '#cccccc' };

describe('vendored classic cards', () => {
  it.each(['classic', 'classic-4c'])('%s has 52 faces and a back', (dir) => {
    for (const id of IDS) {
      const file = `public/cards/${dir}/${cardCode(id)}.svg`;
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`face="${cardCode(id)}"`);
      expect(svg).toContain('width="240"');
    }
    expect(existsSync(`public/cards/${dir}/back.svg`)).toBe(true);
  });
});

describe('minimal renderer', () => {
  it('renders every card as a standalone SVG with its rank and suit colour', () => {
    const seen = new Set<string>();
    for (const id of IDS) {
      const svg = minimalCardSvg(id, PAL);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).toContain(`>${rankLabel(id)}</text>`);
      expect(svg).toContain(`fill:${PAL[(['S', 'H', 'D', 'C'] as const)[Math.floor(id / 13)]]}`);
      seen.add(svg);
    }
    expect(seen.size).toBe(52);
  });
  it('uses CSS variables by default', () => {
    expect(minimalCardSvg(0)).toContain('var(--suit-S)');
  });
});
```

- [ ] **Step 4: Run tests to verify the renderer test fails**

Run: `npx vitest run tests/ui/cards.test.ts`
Expected: vendored-cards tests PASS; minimal renderer tests FAIL (module not found).

- [ ] **Step 5: Implement the renderer and CardFront**

`src/ui/cards/minimal.ts`:
```ts
import { rankLabel, rankOf, suitOf, type CardId, type Suit } from '../../engine/cards';

export interface Palette {
  S: string;
  H: string;
  D: string;
  C: string;
  face: string;
  edge: string;
}

export const CSS_PALETTE: Palette = {
  S: 'var(--suit-S)',
  H: 'var(--suit-H)',
  D: 'var(--suit-D)',
  C: 'var(--suit-C)',
  face: 'var(--card-face)',
  edge: 'var(--card-edge)',
};

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Suit shapes drawn in a 100×100 box. */
export const SUIT_PATHS: Record<Suit, string> = {
  S: 'M50 2C62 24 98 42 98 66C98 80 87 89 75 89C66 89 58 85 54 78C55 88 59 95 67 100H33C41 95 45 88 46 78C42 85 34 89 25 89C13 89 2 80 2 66C2 42 38 24 50 2Z',
  H: 'M50 94C22 72 2 54 2 30C2 14 14 3 28 3C38 3 46 9 50 18C54 9 62 3 72 3C86 3 98 14 98 30C98 54 78 72 50 94Z',
  D: 'M50 2L90 50L50 98L10 50Z',
  C: `${circle(50, 27, 21)}${circle(27, 58, 21)}${circle(73, 58, 21)}M44 54H56C56 76 60 88 70 100H30C40 88 44 76 44 54Z`,
};

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const cache = new Map<string, string>();

/** Large-index card: big rank top-left, suit top-right (both visible when fanned), big centre suit or court letter. */
export function minimalCardSvg(id: CardId, pal: Palette = CSS_PALETTE): string {
  const key = `${id}|${pal.S}|${pal.H}|${pal.D}|${pal.C}|${pal.face}|${pal.edge}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const suit = suitOf(id);
  const color = pal[suit];
  const label = rankLabel(id);
  const pip = (cx: number, cy: number, size: number) =>
    `<path d="${SUIT_PATHS[suit]}" style="fill:${color}" transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})"/>`;
  const text = (x: number, y: number, size: number, anchor: string, content: string) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="${anchor}" font-family="${FONT}" style="fill:${color}">${content}</text>`;

  const centre = rankOf(id) > 10 ? text(120, 262, 140, 'middle', label) : pip(120, 205, 120);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" width="240" height="336">` +
    `<rect x="2" y="2" width="236" height="332" rx="18" style="fill:${pal.face};stroke:${pal.edge};stroke-width:3"/>` +
    text(18, 72, label.length > 1 ? 62 : 72, 'start', label) +
    pip(200, 46, 54) +
    centre +
    `</svg>`;
  cache.set(key, svg);
  return svg;
}
```

`src/ui/CardFront.tsx`:
```tsx
import { memo } from 'react';
import { cardCode, type CardId } from '../engine/cards';
import type { Theme } from '../store/settings';
import { minimalCardSvg } from './cards/minimal';

export const classicCardUrl = (id: CardId, fourColor: boolean) =>
  `/cards/${fourColor ? 'classic-4c' : 'classic'}/${cardCode(id)}.svg`;

export const CardFront = memo(function CardFront(p: { id: CardId; theme: Theme; fourColor: boolean }) {
  if (p.theme === 'classic') {
    return <img className="card-img" src={classicCardUrl(p.id, p.fourColor)} alt="" draggable={false} />;
  }
  return <div className="card-svg" dangerouslySetInnerHTML={{ __html: minimalCardSvg(p.id) }} />;
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/ui/cards.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor-cards.ts public/cards src/ui tests/ui
git commit -m "feat(ui): vendored CC0 classic cards and minimal SVG card renderer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Layout — card sizes, positions, drop targets

**Files:**
- Create: `src/ui/layout.ts`
- Test: `tests/ui/layout.test.ts`

**Interfaces:**
- Consumes: engine types.
- Produces:
  - `interface Point { x; y }`, `interface Rect { x; y; w; h }`
  - `interface Layout { width; height; cardW; cardH; gap; stock: Point; waste: Point; foundations: Point[]; tableau: Point[]; tableauBottom: number; wasteFan: number }`
  - `type PileKey = PileId | 'S'` (`'S'` = stock)
  - `interface CardPos { x; y; z; faceUp: boolean; pile: PileKey; index: number }`
  - `computeLayout(width, height, leftHanded): Layout`
  - `columnOffsets(layout, col): { down: number; up: number }`
  - `cardPositions(state, layout): Map<CardId, CardPos>`
  - `slotRect(layout, pile: PileKey): Rect` (the empty-pile outline)
  - `pileRect(state, layout, pile: PileId): Rect` (drop zone; tableau = whole column)
  - `overlapArea(a, b): number`
  - `pickDropTarget(state, layout, dragRect, candidates: PileId[]): PileId | null`
  - `pickupAt(state, pos: CardPos): { from: PileId; count: number } | null` and `pickupIds(state, pickup): CardId[]`

- [ ] **Step 1: Write the failing tests**

`tests/ui/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cardPositions, computeLayout, pickDropTarget, pickupAt, pickupIds, pileRect } from '../../src/ui/layout';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';

const VIEWPORTS: [number, number][] = [
  [375, 640],
  [390, 720],
  [768, 900],
  [1280, 740],
  [1920, 1000],
];

describe('computeLayout', () => {
  it.each(VIEWPORTS)('fits seven columns and two card heights in %ix%i', (w, h) => {
    const L = computeLayout(w, h, false);
    expect(7 * L.cardW + 6 * L.gap).toBeLessThanOrEqual(w);
    expect(L.tableau[0].y + L.cardH).toBeLessThanOrEqual(h);
    expect(L.cardH).toBe(Math.round(L.cardW * 1.4));
  });
  it('mirrors the top row for left-handed play', () => {
    const r = computeLayout(1000, 800, false);
    const l = computeLayout(1000, 800, true);
    expect(r.stock.x).toBeLessThan(r.foundations[0].x);
    expect(l.stock.x).toBeGreaterThan(l.foundations[3].x);
  });
});

describe('cardPositions', () => {
  it('places all 52 cards with face-up flags matching the state', () => {
    const s = deal(9, 1, 'standard');
    const pos = cardPositions(s, computeLayout(1000, 800, false));
    expect(pos.size).toBe(52);
    expect([...pos.values()].filter((p) => p.faceUp)).toHaveLength(7);
    expect(pos.get(s.stock[0])!.pile).toBe('S');
  });
  it('compresses long columns to stay on screen', () => {
    const L = computeLayout(390, 640, false);
    const s = makeState({ cols: [['2C 3C 4C 5C 6C 7C KS QH JS TH 9S 8H 7S 6H 5S 4H 3S 2H', 6]] });
    const pos = cardPositions(s, L);
    const top = s.tableau[0].cards[s.tableau[0].cards.length - 1];
    expect(pos.get(top)!.y + L.cardH).toBeLessThanOrEqual(L.tableauBottom + 0.5);
  });
  it('fans the top three waste cards in draw-3', () => {
    const s = makeState({ drawCount: 3, waste: cards('2C 3C 4C 5C') });
    const L = computeLayout(1000, 800, false);
    const pos = cardPositions(s, L);
    const xs = s.waste.map((id) => pos.get(id)!.x);
    expect(xs[0]).toBe(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[2]).toBeLessThan(xs[3]);
  });
});

describe('drop targets and pickups', () => {
  const s = makeState({ cols: [['9C 8H 7S', 1], ['9S', 0]], waste: cards('KD') });
  const L = computeLayout(1000, 800, false);

  it('picks the overlapping candidate', () => {
    const r = pileRect(s, L, 'T1');
    expect(pickDropTarget(s, L, { x: r.x + 10, y: r.y + 20, w: L.cardW, h: L.cardH }, ['T1', 'T4'])).toBe('T1');
  });
  it('returns null far from every candidate', () => {
    expect(pickDropTarget(s, L, { x: 5000, y: 5000, w: L.cardW, h: L.cardH }, ['T1'])).toBeNull();
  });
  it('computes pickups from a pressed card', () => {
    const pos = cardPositions(s, L);
    expect(pickupAt(s, pos.get(s.tableau[0].cards[1])!)).toEqual({ from: 'T0', count: 2 });
    expect(pickupAt(s, pos.get(s.tableau[0].cards[0])!)).toBeNull();
    expect(pickupAt(s, pos.get(s.waste[0])!)).toEqual({ from: 'W', count: 1 });
    expect(pickupIds(s, { from: 'T0', count: 2 })).toEqual(cards('8H 7S'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/ui/layout.ts`:
```ts
import type { CardId } from '../engine/cards';
import type { Column, GameState, PileId } from '../engine/types';

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Layout {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  gap: number;
  stock: Point;
  waste: Point;
  foundations: Point[];
  tableau: Point[];
  tableauBottom: number;
  wasteFan: number;
}
export type PileKey = PileId | 'S';
export interface CardPos {
  x: number;
  y: number;
  z: number;
  faceUp: boolean;
  pile: PileKey;
  index: number;
}

const RATIO = 1.4;
const GAP_RATIO = 0.14;

export function computeLayout(width: number, height: number, leftHanded: boolean): Layout {
  const margin = Math.max(6, Math.min(24, width * 0.02));
  const byWidth = (width - 2 * margin) / (7 + 6 * GAP_RATIO);
  const byHeight = (height - 2 * margin) / (RATIO * 3.3);
  const cardW = Math.floor(Math.max(30, Math.min(byWidth, byHeight, 150)));
  const cardH = Math.round(cardW * RATIO);
  const gap = Math.round(cardW * GAP_RATIO);
  const left = Math.round((width - (7 * cardW + 6 * gap)) / 2);
  const colX = (i: number) => left + i * (cardW + gap);
  const top = Math.round(margin);
  const stockCol = leftHanded ? 6 : 0;
  const wasteCol = leftHanded ? 4 : 1;
  const firstFoundation = leftHanded ? 0 : 3;
  const tableauY = top + cardH + Math.round(gap * 1.5);
  return {
    width,
    height,
    cardW,
    cardH,
    gap,
    stock: { x: colX(stockCol), y: top },
    waste: { x: colX(wasteCol), y: top },
    foundations: [0, 1, 2, 3].map((i) => ({ x: colX(firstFoundation + i), y: top })),
    tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: colX(i), y: tableauY })),
    tableauBottom: height - margin,
    wasteFan: Math.round(cardW * 0.22),
  };
}

/** Vertical step after a face-down / face-up card in this column, shrunk if the column would overflow. */
export function columnOffsets(L: Layout, col: Column): { down: number; up: number } {
  const down = L.cardH * 0.12;
  const up = L.cardH * 0.26;
  const faceDown = col.faceUpFrom;
  const faceUpSteps = Math.max(0, col.cards.length - col.faceUpFrom - 1);
  const need = faceDown * down + faceUpSteps * up;
  const avail = L.tableauBottom - L.tableau[0].y - L.cardH;
  if (need <= avail || need === 0) return { down, up };
  const k = Math.max(0.2, avail / need);
  return { down: down * k, up: up * k };
}

export function cardPositions(s: GameState, L: Layout): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();
  s.stock.forEach((id, i) => out.set(id, { x: L.stock.x, y: L.stock.y, z: i, faceUp: false, pile: 'S', index: i }));

  const visible = s.drawCount === 3 ? Math.min(3, s.waste.length) : 1;
  const firstFanned = s.waste.length - visible;
  s.waste.forEach((id, i) =>
    out.set(id, {
      x: L.waste.x + Math.max(0, i - firstFanned) * L.wasteFan,
      y: L.waste.y,
      z: 100 + i,
      faceUp: true,
      pile: 'W',
      index: i,
    }),
  );

  s.foundations.forEach((f, fi) =>
    f.forEach((id, i) =>
      out.set(id, { x: L.foundations[fi].x, y: L.foundations[fi].y, z: 200 + i, faceUp: true, pile: `F${fi}`, index: i }),
    ),
  );

  s.tableau.forEach((col, ci) => {
    const { down, up } = columnOffsets(L, col);
    let y = L.tableau[ci].y;
    col.cards.forEach((id, i) => {
      const faceUp = i >= col.faceUpFrom;
      out.set(id, { x: L.tableau[ci].x, y, z: 300 + i, faceUp, pile: `T${ci}`, index: i });
      y += faceUp ? up : down;
    });
  });
  return out;
}

export function slotRect(L: Layout, pile: PileKey): Rect {
  const at = (p: Point): Rect => ({ x: p.x, y: p.y, w: L.cardW, h: L.cardH });
  if (pile === 'S') return at(L.stock);
  if (pile === 'W') return at(L.waste);
  const i = Number(pile.slice(1));
  return at(pile[0] === 'F' ? L.foundations[i] : L.tableau[i]);
}

export function pileRect(s: GameState, L: Layout, pile: PileId): Rect {
  if (pile[0] !== 'T') return slotRect(L, pile);
  const i = Number(pile.slice(1));
  const col = s.tableau[i];
  const { down, up } = columnOffsets(L, col);
  let h = L.cardH;
  for (let idx = 0; idx < col.cards.length - 1; idx++) h += idx >= col.faceUpFrom ? up : down;
  return { x: L.tableau[i].x, y: L.tableau[i].y, w: L.cardW, h };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Largest overlap wins; otherwise the nearest candidate within one card width. */
export function pickDropTarget(s: GameState, L: Layout, drag: Rect, candidates: PileId[]): PileId | null {
  let best: PileId | null = null;
  let bestArea = 0;
  for (const p of candidates) {
    const a = overlapArea(drag, pileRect(s, L, p));
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  if (best) return best;
  const cx = drag.x + drag.w / 2;
  const cy = drag.y + drag.h / 2;
  let bestDist = L.cardW;
  for (const p of candidates) {
    const r = pileRect(s, L, p);
    const px = r.x + r.w / 2;
    const py = Math.min(Math.max(cy, r.y), r.y + r.h);
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function pickupAt(s: GameState, pos: CardPos): { from: PileId; count: number } | null {
  if (!pos.faceUp || pos.pile === 'S') return null;
  if (pos.pile === 'W') return pos.index === s.waste.length - 1 ? { from: 'W', count: 1 } : null;
  if (pos.pile[0] === 'F') {
    const f = s.foundations[Number(pos.pile.slice(1))];
    return pos.index === f.length - 1 ? { from: pos.pile, count: 1 } : null;
  }
  const col = s.tableau[Number(pos.pile.slice(1))];
  return { from: pos.pile, count: col.cards.length - pos.index };
}

export function pickupIds(s: GameState, p: { from: PileId; count: number }): CardId[] {
  if (p.from === 'W') return s.waste.slice(-1);
  if (p.from[0] === 'F') return s.foundations[Number(p.from.slice(1))].slice(-1);
  const col = s.tableau[Number(p.from.slice(1))];
  return col.cards.slice(col.cards.length - p.count);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/layout.ts tests/ui/layout.test.ts
git commit -m "feat(ui): responsive layout, card positions, drop targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Playable table — cards, tap and drag input, game hook

**Files:**
- Create: `src/ui/types.ts`, `src/ui/useSize.ts`, `src/ui/useGame.ts`, `src/ui/Card.tsx`, `src/ui/Table.tsx`, `src/ui/useTableInput.ts`, `src/ui/appClass.ts`, `src/styles/themes.css`, `src/styles/table.css`
- Modify: `src/App.tsx` (replace), `src/main.tsx` (import new CSS)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `src/ui/types.ts`: `type Hint = { kind: 'move'; from: PileId; count: number; to: PileId } | { kind: 'stock' }`; `interface Focus { pile: PileKey; index: number }`; `interface Selection { from: PileId; count: number }`
  - `useGame(): Game` with `interface Game { session; settings; stats; turn(moves); stockTap(); undo(); redo(); rewindTo(index); newGame(overrides?: Partial<Settings>); restart(); switchDraw(d); updateSettings(patch): boolean /* true = change deferred to next game */; pauseTimer(); resumeTimer() }`
  - `<Table state settings locked hint focus selection onTurn onStockTap onReject? />`
  - `appClassName(settings): string`
  - e2e hook: when the URL has `?e2e`, `window.__sol = { session(): Session; turn(moves: Move[]): void; load(seed: number, drawCount: DrawCount): void }`
  - DOM contract used by e2e: each card element has `data-card`, `data-pile` (`S`, `W`, `F0-3`, `T0-6`), `data-index`, `data-faceup`; empty-pile outlines have `data-slot` with the same pile keys and `id="pile-<key>"`; cards have `id="card-<id>"`.

- [ ] **Step 1: Shared UI types and small hooks**

`src/ui/types.ts`:
```ts
import type { PileId } from '../engine/types';
import type { PileKey } from './layout';

export type Hint = { kind: 'move'; from: PileId; count: number; to: PileId } | { kind: 'stock' };

export interface Focus {
  pile: PileKey;
  /** Card index within the pile; -1 when the pile is empty. */
  index: number;
}

export interface Selection {
  from: PileId;
  count: number;
}
```

`src/ui/useSize.ts`:
```ts
import { useLayoutEffect, useState, type RefObject } from 'react';

export function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
```

`src/ui/appClass.ts`:
```ts
import type { Settings } from '../store/settings';

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const effectiveAnimation = (s: Settings) => (prefersReducedMotion() ? 'off' : s.animation);

export function appClassName(s: Settings): string {
  return [
    'app',
    `theme-${s.theme}`,
    `mode-${s.colorMode}`,
    `anim-${effectiveAnimation(s)}`,
    s.fourColor ? 'four-color' : '',
    s.leftHanded ? 'left-handed' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
```

- [ ] **Step 2: Game hook**

`src/ui/useGame.ts`:
```ts
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { pickSeed } from '../deals/bank';
import { canDraw, canRecycle } from '../engine/rules';
import type { DrawCount, Move } from '../engine/types';
import { loadSavedGame, saveGame } from '../game/persist';
import { newSession, sessionReducer, type Session } from '../game/session';
import { elapsed } from '../game/timer';
import { loadRecent, pushRecent } from '../store/recent';
import { loadSettings, saveSettings, type Settings } from '../store/settings';
import { loadStats, recordResult, saveStats, type Stats } from '../store/stats';
import { effectiveAnimation } from './appClass';

const FINISH_STEP_MS = { normal: 80, fast: 40, off: 0 } as const;

function freshSession(settings: Settings): Session {
  const seed = pickSeed(settings.drawCount, loadRecent(settings.drawCount));
  pushRecent(settings.drawCount, seed);
  return newSession(seed, settings.drawCount, settings.scoring);
}

export interface Game {
  session: Session;
  settings: Settings;
  stats: Stats;
  turn(moves: Move[]): void;
  stockTap(): void;
  undo(): void;
  redo(): void;
  rewindTo(index: number): void;
  newGame(overrides?: Partial<Settings>): void;
  restart(): void;
  switchDraw(d: DrawCount): void;
  /** Returns true when the change only applies from the next game. */
  updateSettings(patch: Partial<Settings>): boolean;
  pauseTimer(): void;
  resumeTimer(): void;
}

export function useGame(): Game {
  const [settings, setSettings] = useState(loadSettings);
  const [stats, setStats] = useState(loadStats);
  const [session, dispatch] = useReducer(sessionReducer, settings, (s) => loadSavedGame() ?? freshSession(s));

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const record = useCallback((s: Session, won: boolean) => {
    setStats((prev) => {
      const next = recordResult(prev, {
        drawCount: s.drawCount,
        scoring: s.scoring,
        won,
        timeMs: Math.round(elapsed(s.timer, Date.now())),
        moves: s.state.moves,
        score: s.state.score,
      });
      saveStats(next);
      return next;
    });
  }, []);

  // Persist after every change, and again when the page is hidden or unloaded so idle timer time is kept.
  useEffect(() => saveGame(session, Date.now()), [session]);
  useEffect(() => {
    const save = () => saveGame(sessionRef.current, Date.now());
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, []);

  // Record a win once, on the transition into 'won'.
  const prevStatus = useRef(session.status);
  useEffect(() => {
    if (prevStatus.current !== 'won' && session.status === 'won') record(session, true);
    prevStatus.current = session.status;
  }, [session, record]);

  // Drive the auto-finish animation one move at a time.
  useEffect(() => {
    if (session.status !== 'finishing') return;
    const id = window.setTimeout(
      () => dispatch({ type: 'finishStep', now: Date.now() }),
      FINISH_STEP_MS[effectiveAnimation(settingsRef.current)],
    );
    return () => window.clearTimeout(id);
  }, [session]);

  // Pause the timer while the tab is hidden.
  useEffect(() => {
    const onVisibility = () =>
      dispatch(document.hidden ? { type: 'pause', now: Date.now() } : { type: 'resume', now: Date.now() });
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const abandonCurrent = useCallback(() => {
    const s = sessionRef.current;
    if (s.turns.length > 0 && s.status !== 'won') record(s, false);
  }, [record]);

  const turn = useCallback(
    (moves: Move[]) => dispatch({ type: 'turn', moves, autoPlay: settingsRef.current.autoPlay, now: Date.now() }),
    [],
  );
  const stockTap = useCallback(() => {
    const st = sessionRef.current.state;
    if (canDraw(st)) turn([{ type: 'draw' }]);
    else if (canRecycle(st)) turn([{ type: 'recycle' }]);
  }, [turn]);
  const newGame = useCallback(
    (overrides?: Partial<Settings>) => {
      abandonCurrent();
      dispatch({ type: 'load', session: freshSession({ ...settingsRef.current, ...overrides }) });
    },
    [abandonCurrent],
  );
  const restart = useCallback(() => {
    abandonCurrent();
    dispatch({ type: 'restart' });
  }, [abandonCurrent]);
  const writeSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    saveSettings(next);
    setSettings(next);
    return next;
  }, []);
  const switchDraw = useCallback(
    (d: DrawCount) => {
      writeSettings({ drawCount: d });
      newGame({ drawCount: d });
    },
    [writeSettings, newGame],
  );
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = writeSettings(patch);
      const s = sessionRef.current;
      const rulesChanged = next.drawCount !== s.drawCount || next.scoring !== s.scoring;
      if (!rulesChanged) return false;
      if (s.turns.length === 0) {
        dispatch({ type: 'load', session: freshSession(next) });
        return false;
      }
      return true;
    },
    [writeSettings],
  );

  // Test hook for Playwright (never active without ?e2e in the URL).
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('e2e')) return;
    (window as unknown as { __sol: unknown }).__sol = {
      session: () => sessionRef.current,
      turn: (moves: Move[]) => dispatch({ type: 'turn', moves, autoPlay: false, now: Date.now() }),
      load: (seed: number, drawCount: DrawCount) => dispatch({ type: 'new', seed, drawCount, scoring: 'standard' }),
    };
  }, []);

  return {
    session,
    settings,
    stats,
    turn,
    stockTap,
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo', now: Date.now() }), []),
    rewindTo: useCallback((index: number) => dispatch({ type: 'rewindTo', index }), []),
    newGame,
    restart,
    switchDraw,
    updateSettings,
    pauseTimer: useCallback(() => dispatch({ type: 'pause', now: Date.now() }), []),
    resumeTimer: useCallback(() => dispatch({ type: 'resume', now: Date.now() }), []),
  };
}
```

- [ ] **Step 3: Card component and pointer input**

`src/ui/Card.tsx`:
```tsx
import { forwardRef, memo } from 'react';
import { cardName, type CardId } from '../engine/cards';
import type { Theme } from '../store/settings';
import { CardFront } from './CardFront';
import type { CardPos } from './layout';

interface CardProps {
  id: CardId;
  pos: CardPos;
  width: number;
  height: number;
  theme: Theme;
  fourColor: boolean;
  moving: boolean;
  hinted: boolean;
  focused: boolean;
  selected: boolean;
}

export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(function Card(p, ref) {
    const cls = ['card', p.pos.faceUp && 'faceup', p.hinted && 'hinted', p.focused && 'focused', p.selected && 'selected']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        ref={ref}
        id={`card-${p.id}`}
        className={cls}
        data-card={p.id}
        data-pile={p.pos.pile}
        data-index={p.pos.index}
        data-faceup={p.pos.faceUp}
        role="img"
        aria-label={p.pos.faceUp ? `${cardName(p.id)}, face up` : 'face-down card'}
        style={{
          width: p.width,
          height: p.height,
          transform: `translate3d(${p.pos.x}px, ${p.pos.y}px, 0)`,
          zIndex: p.moving ? 1000 + p.pos.z : p.pos.z,
        }}
      >
        <div className="card-inner">
          <div className="card-front">{p.pos.faceUp && <CardFront id={p.id} theme={p.theme} fourColor={p.fourColor} />}</div>
          <div className="card-back" />
        </div>
      </div>
    );
  }),
);
```

Note: the front is only mounted while face up, so face-down cards never reveal their identity to the DOM or accessibility tree.

`src/ui/useTableInput.ts`:
```ts
import { useRef, type MutableRefObject, type PointerEvent } from 'react';
import type { CardId } from '../engine/cards';
import { destinationsFor } from '../engine/movegen';
import type { GameState, Move, PileId } from '../engine/types';
import { pickDropTarget, pickupAt, pickupIds, type CardPos, type Layout } from './layout';

interface Args {
  state: GameState;
  layout: Layout | null;
  positions: Map<CardId, CardPos> | null;
  cardEls: MutableRefObject<Map<CardId, HTMLDivElement>>;
  locked: boolean;
  onTurn(moves: Move[]): void;
  onStockTap(): void;
  onReject?(): void;
}

interface Press {
  pointerId: number;
  x0: number;
  y0: number;
  cardId: CardId | null;
  slot: string | null;
  pickup: { from: PileId; count: number; ids: CardId[] } | null;
  dragging: boolean;
  offsetX: number;
  offsetY: number;
  tableLeft: number;
  tableTop: number;
  saved: { el: HTMLDivElement; transform: string; z: string }[];
}

const DRAG_THRESHOLD = 5;
const DOUBLE_TAP_MS = 300;

export function useTableInput(args: Args) {
  const a = useRef(args);
  a.current = args;
  const press = useRef<Press | null>(null);
  const lastTap = useRef<{ id: CardId; t: number } | null>(null);

  const dragPoint = (p: Press, e: PointerEvent) => ({
    x: e.clientX - p.tableLeft - p.offsetX,
    y: e.clientY - p.tableTop - p.offsetY,
  });

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const { state, positions, locked } = a.current;
    if (locked || !positions || e.button !== 0 || press.current) return;
    const target = e.target as Element;
    const cardEl = target.closest<HTMLElement>('[data-card]');
    const slotEl = target.closest<HTMLElement>('[data-slot]');
    const cardId = cardEl ? Number(cardEl.dataset.card) : null;
    const pos = cardId !== null ? positions.get(cardId) ?? null : null;
    const pick = pos ? pickupAt(state, pos) : null;
    const rect = e.currentTarget.getBoundingClientRect();
    press.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      cardId,
      slot: slotEl?.dataset.slot ?? null,
      pickup: pick ? { ...pick, ids: pickupIds(state, pick) } : null,
      dragging: false,
      offsetX: pos ? e.clientX - rect.left - pos.x : 0,
      offsetY: pos ? e.clientY - rect.top - pos.y : 0,
      tableLeft: rect.left,
      tableTop: rect.top,
      saved: [],
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = press.current;
    const { positions, cardEls } = a.current;
    if (!p || e.pointerId !== p.pointerId || !p.pickup || !positions) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_THRESHOLD) return;
      p.dragging = true;
      p.saved = p.pickup.ids.map((id) => {
        const el = cardEls.current.get(id)!;
        return { el, transform: el.style.transform, z: el.style.zIndex };
      });
      p.saved.forEach(({ el }, i) => {
        el.classList.add('dragging');
        el.style.zIndex = String(3000 + i);
      });
    }
    const { x, y } = dragPoint(p, e);
    const first = positions.get(p.pickup.ids[0])!;
    p.saved.forEach(({ el }, i) => {
      const pos = positions.get(p.pickup!.ids[i])!;
      el.style.transform = `translate3d(${x}px, ${y + (pos.y - first.y)}px, 0) scale(1.04)`;
    });
  }

  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = null;
    const { state, layout, positions, onTurn, onStockTap, onReject } = a.current;

    if (p.dragging && p.pickup && positions && layout) {
      const { x, y } = dragPoint(p, e);
      const first = positions.get(p.pickup.ids[0])!;
      const last = positions.get(p.pickup.ids[p.pickup.ids.length - 1])!;
      const target = cancelled
        ? null
        : pickDropTarget(
            state,
            layout,
            { x, y, w: layout.cardW, h: layout.cardH + (last.y - first.y) },
            destinationsFor(state, p.pickup.from, p.pickup.count),
          );
      p.saved.forEach(({ el, transform, z }, i) => {
        el.classList.remove('dragging');
        el.style.zIndex = z;
        // Valid drop: start the settle animation from where the card was released.
        // Invalid drop: animate back to where it came from.
        const pos = positions.get(p.pickup!.ids[i])!;
        el.style.transform = target ? `translate3d(${x}px, ${y + (pos.y - first.y)}px, 0)` : transform;
      });
      if (target) onTurn([{ type: 'move', from: p.pickup.from, to: target, count: p.pickup.count }]);
      else if (!cancelled) onReject?.();
      return;
    }
    if (cancelled) return;

    const pressedPile = p.cardId !== null ? positions?.get(p.cardId)?.pile : undefined;
    if (p.slot === 'S' || pressedPile === 'S') {
      onStockTap();
      return;
    }
    if (!p.pickup || p.cardId === null) return;
    const now = performance.now();
    if (lastTap.current && lastTap.current.id === p.cardId && now - lastTap.current.t < DOUBLE_TAP_MS) return;
    lastTap.current = { id: p.cardId, t: now };
    const [to] = destinationsFor(state, p.pickup.from, p.pickup.count);
    if (to) onTurn([{ type: 'move', from: p.pickup.from, to, count: p.pickup.count }]);
    else onReject?.();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => finish(e, true),
  };
}
```

- [ ] **Step 4: Table component**

`src/ui/Table.tsx`:
```tsx
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SUITS, type CardId } from '../engine/cards';
import { canRecycle } from '../engine/rules';
import type { GameState, Move } from '../engine/types';
import type { Settings } from '../store/settings';
import { Card } from './Card';
import { SUIT_PATHS } from './cards/minimal';
import { cardPositions, computeLayout, pickupIds, pileRect, slotRect, type CardPos, type Layout, type PileKey } from './layout';
import type { Focus, Hint, Selection } from './types';
import { useSize } from './useSize';
import { useTableInput } from './useTableInput';

interface TableProps {
  state: GameState;
  settings: Settings;
  locked: boolean;
  hint: Hint | null;
  focus: Focus | null;
  selection: Selection | null;
  onTurn(moves: Move[]): void;
  onStockTap(): void;
  onReject?(): void;
}

const PILES: PileKey[] = ['S', 'W', 'F0', 'F1', 'F2', 'F3', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const PILE_LABELS: Record<string, string> = { S: 'Stock', W: 'Waste' };
const pileLabel = (k: PileKey) =>
  PILE_LABELS[k] ?? (k[0] === 'F' ? `Foundation ${Number(k.slice(1)) + 1}` : `Column ${Number(k.slice(1)) + 1}`);

/** Cards whose pile changed in the last render get a z-index boost while they animate. */
function useMovingCards(positions: Map<CardId, CardPos> | null): Set<CardId> {
  const prev = useRef<Map<CardId, CardPos> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [moving, setMoving] = useState<Set<CardId>>(() => new Set());
  useLayoutEffect(() => {
    if (!positions) return;
    const changed = new Set<CardId>();
    if (prev.current) {
      for (const [id, pos] of positions) if (prev.current.get(id)?.pile !== pos.pile) changed.add(id);
    }
    prev.current = positions;
    if (changed.size) {
      setMoving(changed);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMoving(new Set()), 450);
    }
  }, [positions]);
  return moving;
}

export function focusedElementId(state: GameState, focus: Focus | null): string | undefined {
  if (!focus) return undefined;
  const pile =
    focus.pile === 'S' ? state.stock
    : focus.pile === 'W' ? state.waste
    : focus.pile[0] === 'F' ? state.foundations[Number(focus.pile.slice(1))]
    : state.tableau[Number(focus.pile.slice(1))].cards;
  const id = pile[focus.index];
  return id === undefined ? `pile-${focus.pile}` : `card-${id}`;
}

export function Table(p: TableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const layout: Layout | null = useMemo(
    () => (size && size.width > 0 && size.height > 0 ? computeLayout(size.width, size.height, p.settings.leftHanded) : null),
    [size, p.settings.leftHanded],
  );
  const positions = useMemo(() => (layout ? cardPositions(p.state, layout) : null), [p.state, layout]);
  const cardEls = useRef(new Map<CardId, HTMLDivElement>());
  const moving = useMovingCards(positions);
  const input = useTableInput({
    state: p.state,
    layout,
    positions,
    cardEls,
    locked: p.locked,
    onTurn: p.onTurn,
    onStockTap: p.onStockTap,
    onReject: p.onReject,
  });

  const hinted = useMemo(
    () => new Set(p.hint?.kind === 'move' ? pickupIds(p.state, { from: p.hint.from, count: p.hint.count }) : []),
    [p.hint, p.state],
  );
  const selected = useMemo(() => new Set(p.selection ? pickupIds(p.state, p.selection) : []), [p.selection, p.state]);
  const activeId = focusedElementId(p.state, p.focus);

  let hintTarget: { x: number; y: number; w: number; h: number } | null = null;
  if (layout && p.hint) {
    if (p.hint.kind === 'stock') hintTarget = slotRect(layout, 'S');
    else {
      const r = pileRect(p.state, layout, p.hint.to);
      hintTarget = { ...r, y: r.y + r.h - layout.cardH, h: layout.cardH };
    }
  }

  return (
    <div
      ref={ref}
      className="table"
      role="application"
      aria-label="Solitaire table"
      aria-roledescription="card table"
      tabIndex={0}
      aria-activedescendant={activeId}
      style={layout ? ({ '--card-w': `${layout.cardW}px` } as CSSProperties) : undefined}
      {...input}
    >
      {layout &&
        PILES.map((k) => {
          const r = slotRect(layout, k);
          const recyclable = k === 'S' && p.state.stock.length === 0 && canRecycle(p.state);
          const fIndex = k[0] === 'F' ? Number(k.slice(1)) : -1;
          return (
            <div
              key={k}
              id={`pile-${k}`}
              data-slot={k}
              className={`slot${p.focus?.pile === k && activeId === `pile-${k}` ? ' focused' : ''}`}
              role="img"
              aria-label={`${pileLabel(k)}, empty`}
              style={{ transform: `translate(${r.x}px, ${r.y}px)`, width: r.w, height: r.h }}
            >
              {k === 'S' && p.state.stock.length === 0 && (
                <span className="slot-icon" aria-hidden="true">{recyclable ? '↻' : '×'}</span>
              )}
              {fIndex >= 0 && (
                <svg className="slot-suit" viewBox="0 0 100 100" aria-hidden="true">
                  <path d={SUIT_PATHS[SUITS[fIndex]]} />
                </svg>
              )}
            </div>
          );
        })}
      {layout &&
        positions &&
        Array.from({ length: 52 }, (_, id) => (
          <Card
            key={id}
            ref={(el) => {
              if (el) cardEls.current.set(id, el);
              else cardEls.current.delete(id);
            }}
            id={id}
            pos={positions.get(id)!}
            width={layout.cardW}
            height={layout.cardH}
            theme={p.settings.theme}
            fourColor={p.settings.fourColor}
            moving={moving.has(id)}
            hinted={hinted.has(id)}
            focused={activeId === `card-${id}`}
            selected={selected.has(id)}
          />
        ))}
      {hintTarget && (
        <div
          className="hint-target"
          aria-hidden="true"
          style={{ transform: `translate(${hintTarget.x}px, ${hintTarget.y}px)`, width: hintTarget.w, height: hintTarget.h }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Styles**

`src/styles/themes.css`:
```css
.app {
  --move-ms: 220ms;
  --flip-ms: 260ms;
  --accent: #ffd54f;
  --suit-S: #1a1a1a;
  --suit-C: #1a1a1a;
  --suit-H: #c62828;
  --suit-D: #c62828;
  --card-face: #fffdf8;
  --card-edge: #d9d3c5;
  --back-a: #1d4f91;
  --back-b: #163d70;
  --slot: rgba(255, 255, 255, 0.22);
  --ink: #f5f2ea;
  --ink-muted: rgba(245, 242, 234, 0.72);
  --chrome-bg: rgba(0, 0, 0, 0.22);
  --panel-bg: #fbfaf6;
  --panel-ink: #1d1d1b;
  --panel-muted: #5f5d57;
  --panel-line: #e3dfd4;
  --table-bg: radial-gradient(ellipse at 50% 25%, #1c7247 0%, #125a37 50%, #0b3f26 100%);
  background: var(--table-bg);
  color: var(--ink);
}

.theme-minimal {
  --suit-S: #22252a;
  --suit-C: #22252a;
  --suit-H: #d33a3a;
  --suit-D: #d33a3a;
  --card-face: #ffffff;
  --card-edge: #d7dbe0;
  --back-a: #5b6b82;
  --back-b: #4d5c71;
  --slot: rgba(30, 40, 55, 0.14);
  --ink: #1f2430;
  --ink-muted: #5d6573;
  --chrome-bg: rgba(255, 255, 255, 0.6);
  --table-bg: #eef1f5;
}

.theme-minimal.mode-dark {
  --suit-S: #e9ecf1;
  --suit-C: #e9ecf1;
  --suit-H: #ff6b6b;
  --suit-D: #ff6b6b;
  --card-face: #2a2f38;
  --card-edge: #3a414d;
  --back-a: #3b4658;
  --back-b: #323c4c;
  --slot: rgba(255, 255, 255, 0.12);
  --ink: #e9ecf1;
  --ink-muted: #a3abb8;
  --chrome-bg: rgba(0, 0, 0, 0.3);
  --panel-bg: #242933;
  --panel-ink: #e9ecf1;
  --panel-muted: #a3abb8;
  --panel-line: #394150;
  --table-bg: #171b22;
}

@media (prefers-color-scheme: dark) {
  .theme-minimal.mode-auto {
    --suit-S: #e9ecf1;
    --suit-C: #e9ecf1;
    --suit-H: #ff6b6b;
    --suit-D: #ff6b6b;
    --card-face: #2a2f38;
    --card-edge: #3a414d;
    --back-a: #3b4658;
    --back-b: #323c4c;
    --slot: rgba(255, 255, 255, 0.12);
    --ink: #e9ecf1;
    --ink-muted: #a3abb8;
    --chrome-bg: rgba(0, 0, 0, 0.3);
    --panel-bg: #242933;
    --panel-ink: #e9ecf1;
    --panel-muted: #a3abb8;
    --panel-line: #394150;
    --table-bg: #171b22;
  }
}

.four-color {
  --suit-D: #1565c0;
  --suit-C: #2e7d32;
}
.theme-minimal.four-color.mode-dark { --suit-D: #64a8ff; --suit-C: #5fcf73; }
@media (prefers-color-scheme: dark) {
  .theme-minimal.four-color.mode-auto { --suit-D: #64a8ff; --suit-C: #5fcf73; }
}

.anim-fast { --move-ms: 120ms; --flip-ms: 140ms; }
.anim-off { --move-ms: 0ms; --flip-ms: 0ms; }
```

`src/styles/table.css`:
```css
.app {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  overflow: hidden;
}
.table-wrap { position: relative; flex: 1; min-height: 0; }
.table {
  position: absolute;
  inset: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
  overflow: hidden;
}
.slot {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: calc(var(--card-w) * 0.07);
  border: 2px solid var(--slot);
  display: grid;
  place-items: center;
  color: var(--slot);
}
.slot[data-slot='S'] { cursor: pointer; }
.slot-icon { font-size: calc(var(--card-w) * 0.45); line-height: 1; color: var(--ink-muted); }
.slot-suit { width: 42%; height: 42%; fill: var(--slot); }
.card {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: calc(var(--card-w) * 0.07);
  transition: transform var(--move-ms) cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
  cursor: pointer;
  perspective: 900px;
}
.card-inner {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform var(--flip-ms) ease;
  border-radius: inherit;
}
.card:not(.faceup) .card-inner { transform: rotateY(180deg); }
.card-front,
.card-back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: inherit;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  background: var(--card-face);
}
.card-back { transform: rotateY(180deg); }
.theme-classic .card-back { background: #fff url('/cards/classic/back.svg') center / 100% 100% no-repeat; }
.theme-minimal .card-back {
  background: repeating-linear-gradient(45deg, var(--back-a) 0 6px, var(--back-b) 6px 12px);
  border: 3px solid var(--card-face);
}
.card-img,
.card-svg,
.card-svg svg { display: block; width: 100%; height: 100%; }
.card.dragging { transition: none; cursor: grabbing; }
.card.dragging .card-front { box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45); }
.card.hinted .card-front { animation: hint-pulse 800ms ease-in-out 3; }
.card.selected .card-front { box-shadow: 0 0 0 3px var(--accent); }
.card.focused,
.slot.focused { outline: 3px solid var(--accent); outline-offset: 2px; }
.hint-target {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: calc(var(--card-w) * 0.07);
  box-shadow: 0 0 0 3px var(--accent), 0 0 20px var(--accent);
  pointer-events: none;
  z-index: 4000;
  animation: hint-glow 800ms ease-in-out 3;
}
@keyframes hint-pulse { 50% { box-shadow: 0 0 0 4px var(--accent), 0 0 18px var(--accent); } }
@keyframes hint-glow { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) {
  .card, .card-inner { transition: none !important; }
  .card.hinted .card-front, .hint-target { animation: none; }
}
```

- [ ] **Step 6: Wire App and CSS**

`src/main.tsx` — add imports after `global.css`:
```tsx
import './styles/themes.css';
import './styles/table.css';
```

`src/App.tsx` (replace):
```tsx
import { appClassName } from './ui/appClass';
import { Table } from './ui/Table';
import { useGame } from './ui/useGame';

export default function App() {
  const game = useGame();
  return (
    <div className={appClassName(game.settings)}>
      <main className="table-wrap">
        <Table
          state={game.session.state}
          settings={game.settings}
          locked={game.session.status !== 'playing'}
          hint={null}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npx tsc --noEmit && npm test` — expected PASS.
Then add a launch config and preview:

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [{ "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev", "--", "--port", "5173"], "port": 5173 }]
}
```
Start it with `preview_start` (name `dev`). Verify with screenshots and clicks:
1. 28 tableau cards in 7 columns, stock at top-left, 4 empty foundation outlines at top-right.
2. Clicking the stock draws a card that slides and flips onto the waste; clicking the empty stock recycles.
3. Clicking a playable face-up card moves it (foundation first); an ace goes to its foundation.
4. Dragging a card onto a legal column drops it there; dropping elsewhere springs it back.
5. Resize to 390×844 (`resize_window` mobile preset): the table fits without scrolling. Reset with the desktop preset afterwards.
6. Reload: the same game is restored.
Fix anything that fails before committing.

- [ ] **Step 8: Commit**

```bash
git add src .claude/launch.json
git commit -m "feat(ui): playable table with tap and drag, persistence and stats hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Chrome — toolbar, status bar with timer, settings and stats dialogs, toasts

**Files:**
- Create: `src/ui/Icon.tsx`, `src/ui/Toolbar.tsx`, `src/ui/StatusBar.tsx`, `src/ui/useNow.ts`, `src/ui/Toast.tsx`, `src/ui/dialogs/Modal.tsx`, `src/ui/dialogs/SettingsDialog.tsx`, `src/ui/dialogs/StatsDialog.tsx`, `src/styles/chrome.css`, `src/ui/format.ts`
- Modify: `src/App.tsx` (replace), `src/main.tsx` (import chrome.css)
- Test: `tests/ui/format.test.ts`

**Interfaces:**
- Consumes: `Game` (Task 13), `Stats`, `Settings`, `elapsed`.
- Produces:
  - `formatTime(ms): string` (`"0:07"`, `"12:34"`, `"1:02:03"`), `formatScore(session, settings, vegasBank): string | null`
  - `<Toolbar canUndo canRedo drawCount busy? onNew onRestart onSwitchDraw onUndo onRedo onHint? onCheck? onSettings onStats />` — buttons have accessible names `Undo`, `Redo`, `Hint`, `Winnable?`, `Stats`, `Settings`; the menu summary is named `Game menu` and contains `New game`, `Restart this deal`, `Draw 1`, `Draw 3`.
  - `<StatusBar session settings vegasBank />` — shows `Score`, `Moves`, `Time` (`data-testid="timer"`).
  - `<Modal open title onClose actions?>` using `<dialog>`; `useToast(): [string | null, (msg: string) => void]`; `<Toast message />`

- [ ] **Step 1: Write the failing test**

`tests/ui/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatScore, formatTime } from '../../src/ui/format';
import { newSession } from '../../src/game/session';
import { DEFAULT_SETTINGS } from '../../src/store/settings';

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(7_400)).toBe('0:07');
    expect(formatTime(754_000)).toBe('12:34');
    expect(formatTime(3_723_000)).toBe('1:02:03');
  });
});

describe('formatScore', () => {
  it('shows points, dollars, or nothing', () => {
    expect(formatScore(newSession(1, 1, 'standard'), DEFAULT_SETTINGS, 0)).toBe('0');
    expect(formatScore(newSession(1, 1, 'vegas'), DEFAULT_SETTINGS, 100)).toBe('-$52');
    expect(formatScore(newSession(1, 1, 'vegas'), { ...DEFAULT_SETTINGS, cumulativeVegas: true }, 100)).toBe('$48');
    expect(formatScore(newSession(1, 1, 'none'), DEFAULT_SETTINGS, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement format, useNow, Icon, Toast, Modal**

`src/ui/format.ts`:
```ts
import type { Session } from '../game/session';
import type { Settings } from '../store/settings';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const dollars = (n: number) => (n < 0 ? `-$${-n}` : `$${n}`);

export function formatScore(session: Session, settings: Settings, vegasBank: number): string | null {
  if (session.scoring === 'none') return null;
  if (session.scoring === 'vegas') return dollars(session.state.score + (settings.cumulativeVegas ? vegasBank : 0));
  return String(session.state.score);
}
```

`src/ui/useNow.ts`:
```ts
import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` while non-null; returns Date.now() at the last render. */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (intervalMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`src/ui/Icon.tsx`:
```tsx
const PATHS = {
  cards: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 7h2 M13 17h2',
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  bulb: 'M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  check: 'M20 6 9 17l-5-5',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
```

`src/ui/Toast.tsx`:
```tsx
import { useCallback, useRef, useState } from 'react';

export function useToast(): [string | null, (msg: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);
  return [message, show];
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast${message ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
```

`src/ui/dialogs/Modal.tsx`:
```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, actions, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${className ?? ''}`}
      aria-labelledby={titleId}
      onClose={() => open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
    >
      <div className="modal-card">
        <h2 id={titleId}>{title}</h2>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Toolbar and StatusBar**

`src/ui/Toolbar.tsx`:
```tsx
import { useRef, type ButtonHTMLAttributes } from 'react';
import type { DrawCount } from '../engine/types';
import { Icon, type IconName } from './Icon';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  drawCount: DrawCount;
  busy?: string | null;
  onNew(): void;
  onRestart(): void;
  onSwitchDraw(d: DrawCount): void;
  onUndo(): void;
  onRedo(): void;
  onHint?(): void;
  onCheck?(): void;
  onSettings(): void;
  onStats(): void;
}

function TbButton({ icon, label, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="tb-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
      <span className="tb-label">{label}</span>
    </button>
  );
}

export function Toolbar(p: ToolbarProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false;
    fn();
  };
  return (
    <header className="toolbar">
      <details className="menu" ref={menu}>
        <summary className="tb-btn" aria-label="Game menu" title="Game menu">
          <Icon name="cards" />
          <span className="tb-label">New</span>
        </summary>
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={pick(p.onNew)}>New game</button>
          <button type="button" role="menuitem" onClick={pick(p.onRestart)}>Restart this deal</button>
          <hr />
          <button type="button" role="menuitemradio" aria-checked={p.drawCount === 1} onClick={pick(() => p.onSwitchDraw(1))}>Draw 1</button>
          <button type="button" role="menuitemradio" aria-checked={p.drawCount === 3} onClick={pick(() => p.onSwitchDraw(3))}>Draw 3</button>
        </div>
      </details>
      <TbButton icon="undo" label="Undo" disabled={!p.canUndo} onClick={p.onUndo} />
      <TbButton icon="redo" label="Redo" disabled={!p.canRedo} onClick={p.onRedo} />
      {p.onHint && <TbButton icon="bulb" label={p.busy === 'hint' ? 'Thinking…' : 'Hint'} disabled={!!p.busy} onClick={p.onHint} />}
      {p.onCheck && <TbButton icon="check" label="Winnable?" disabled={!!p.busy} onClick={p.onCheck} />}
      <span className="tb-spacer" />
      <TbButton icon="chart" label="Stats" onClick={p.onStats} />
      <TbButton icon="sliders" label="Settings" onClick={p.onSettings} />
    </header>
  );
}
```

`src/ui/StatusBar.tsx`:
```tsx
import type { Session } from '../game/session';
import { elapsed } from '../game/timer';
import type { Settings } from '../store/settings';
import { formatScore, formatTime } from './format';
import { useNow } from './useNow';

export function StatusBar({ session, settings, vegasBank }: { session: Session; settings: Settings; vegasBank: number }) {
  const now = useNow(session.timer.runningSince !== null ? 1000 : null);
  const score = formatScore(session, settings, vegasBank);
  return (
    <footer className="status">
      {score !== null && (
        <span>
          Score <b>{score}</b>
          {session.scoring === 'vegas' && (
            <span className="tag" title="Vegas limits passes through the stock, so this deal may not be winnable">Vegas</span>
          )}
        </span>
      )}
      <span>
        Moves <b>{session.state.moves}</b>
      </span>
      <span>
        Time <b data-testid="timer">{formatTime(elapsed(session.timer, now))}</b>
      </span>
      <span className="status-mode">Draw {session.drawCount}</span>
    </footer>
  );
}
```

- [ ] **Step 5: Settings and Stats dialogs**

`src/ui/dialogs/SettingsDialog.tsx`:
```tsx
import type { Settings } from '../../store/settings';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
}

function Segmented<T extends string | number>(p: { label: string; value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <fieldset className="seg">
      <legend>{p.label}</legend>
      <div className="seg-row">
        {p.options.map(([v, text]) => (
          <button type="button" key={String(v)} aria-pressed={p.value === v} onClick={() => p.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle(p: { label: string; checked: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span>
        {p.label}
        {p.hint && <small>{p.hint}</small>}
      </span>
    </label>
  );
}

export function SettingsDialog({ open, settings: s, onChange, onClose }: Props) {
  return (
    <Modal open={open} title="Settings" onClose={onClose} actions={<button type="button" className="primary" onClick={onClose}>Done</button>}>
      <Segmented label="Draw" value={s.drawCount} options={[[1, 'Draw 1'], [3, 'Draw 3']]} onChange={(drawCount) => onChange({ drawCount })} />
      <Segmented
        label="Scoring"
        value={s.scoring}
        options={[['standard', 'Standard'], ['vegas', 'Vegas'], ['none', 'None']]}
        onChange={(scoring) => onChange({ scoring })}
      />
      {s.scoring === 'vegas' && (
        <>
          <p className="note">Vegas limits passes through the stock (1 in Draw 1, 3 in Draw 3), so deals may not be winnable.</p>
          <Toggle label="Cumulative Vegas bank" checked={s.cumulativeVegas} onChange={(cumulativeVegas) => onChange({ cumulativeVegas })} />
        </>
      )}
      <Toggle
        label="Auto-play to foundations"
        hint="Moves cards up automatically when it can never hurt"
        checked={s.autoPlay}
        onChange={(autoPlay) => onChange({ autoPlay })}
      />
      <Segmented label="Theme" value={s.theme} options={[['classic', 'Classic felt'], ['minimal', 'Modern minimal']]} onChange={(theme) => onChange({ theme })} />
      {s.theme === 'minimal' && (
        <Segmented
          label="Appearance"
          value={s.colorMode}
          options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]}
          onChange={(colorMode) => onChange({ colorMode })}
        />
      )}
      <Toggle label="Four-color deck" checked={s.fourColor} onChange={(fourColor) => onChange({ fourColor })} />
      <Toggle label="Left-handed layout" checked={s.leftHanded} onChange={(leftHanded) => onChange({ leftHanded })} />
      <Toggle label="Sound" checked={s.sound} onChange={(sound) => onChange({ sound })} />
      <Segmented
        label="Animation"
        value={s.animation}
        options={[['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']]}
        onChange={(animation) => onChange({ animation })}
      />
    </Modal>
  );
}
```

`src/ui/dialogs/StatsDialog.tsx`:
```tsx
import { winRate, type ModeStats, type Stats } from '../../store/stats';
import { formatTime } from '../format';
import { Modal } from './Modal';

const ROWS: [string, (m: ModeStats) => string][] = [
  ['Played', (m) => String(m.played)],
  ['Won', (m) => String(m.won)],
  ['Win rate', (m) => (m.played ? `${Math.round(winRate(m) * 100)}%` : '—')],
  ['Current streak', (m) => String(m.currentStreak)],
  ['Best streak', (m) => String(m.bestStreak)],
  ['Best time', (m) => (m.bestTimeMs === null ? '—' : formatTime(m.bestTimeMs))],
  ['Fewest moves', (m) => (m.fewestMoves === null ? '—' : String(m.fewestMoves))],
  ['Best score', (m) => (m.bestScore === null ? '—' : String(m.bestScore))],
];

export function StatsDialog({ open, stats, onClose }: { open: boolean; stats: Stats; onClose(): void }) {
  return (
    <Modal open={open} title="Statistics" onClose={onClose} actions={<button type="button" className="primary" onClick={onClose}>Close</button>}>
      <table className="stats">
        <thead>
          <tr>
            <th />
            <th scope="col">Draw 1</th>
            <th scope="col">Draw 3</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, get]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{get(stats.draw1)}</td>
              <td>{get(stats.draw3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.vegasBank !== 0 && <p className="note">Vegas bank: {stats.vegasBank < 0 ? `-$${-stats.vegasBank}` : `$${stats.vegasBank}`}</p>}
    </Modal>
  );
}
```

- [ ] **Step 6: Chrome styles**

`src/styles/chrome.css`:
```css
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--chrome-bg);
  backdrop-filter: blur(6px);
  position: relative;
  z-index: 5000;
}
.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 6px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
  font-size: 15px;
}
.tb-btn::-webkit-details-marker { display: none; }
.tb-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
.theme-minimal .tb-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
.tb-btn:disabled { opacity: 0.4; cursor: default; }
.tb-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tb-spacer { flex: 1; }
.menu { position: relative; }
.menu-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  padding: 6px;
  border-radius: 12px;
  background: var(--panel-bg);
  color: var(--panel-ink);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}
.menu-pop button {
  text-align: left;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.menu-pop button:hover { background: var(--panel-line); }
.menu-pop button[aria-checked='true']::after { content: ' ✓'; }
.menu-pop hr { border: 0; border-top: 1px solid var(--panel-line); margin: 4px 0; width: 100%; }
.status {
  display: flex;
  gap: 18px;
  justify-content: center;
  align-items: center;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--ink-muted);
  font-variant-numeric: tabular-nums;
}
.status b { color: var(--ink); font-weight: 600; margin-left: 4px; }
.status .tag { margin-left: 6px; padding: 1px 6px; border-radius: 6px; border: 1px solid currentColor; font-size: 11px; }
.modal { border: 0; padding: 0; background: transparent; max-width: min(440px, calc(100vw - 32px)); width: 100%; }
.modal::backdrop { background: rgba(0, 0, 0, 0.45); }
.modal-card {
  background: var(--panel-bg);
  color: var(--panel-ink);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  max-height: calc(100dvh - 48px);
  overflow: auto;
}
.modal h2 { margin: 0 0 12px; font-size: 20px; }
.modal-body { display: flex; flex-direction: column; gap: 14px; }
.modal-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 18px; }
.modal-actions button, .seg-row button {
  min-height: 40px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--panel-line);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.modal-actions .primary { background: #1f6f45; border-color: #1f6f45; color: #fff; }
.seg { border: 0; margin: 0; padding: 0; }
.seg legend { font-size: 13px; color: var(--panel-muted); margin-bottom: 6px; padding: 0; }
.seg-row { display: flex; flex-wrap: wrap; gap: 6px; }
.seg-row button[aria-pressed='true'] { background: #1f6f45; border-color: #1f6f45; color: #fff; }
.toggle { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
.toggle input { width: 20px; height: 20px; margin: 1px 0 0; accent-color: #1f6f45; }
.toggle small { display: block; color: var(--panel-muted); font-size: 12px; }
.note { margin: 0; font-size: 13px; color: var(--panel-muted); }
.stats { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.stats th, .stats td { padding: 8px 6px; border-bottom: 1px solid var(--panel-line); text-align: right; }
.stats th[scope='row'] { text-align: left; font-weight: 500; color: var(--panel-muted); }
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(56px + env(safe-area-inset-bottom));
  transform: translate(-50%, 20px);
  opacity: 0;
  pointer-events: none;
  background: rgba(20, 20, 20, 0.88);
  color: #fff;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 14px;
  transition: opacity 180ms, transform 180ms;
  z-index: 6000;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 640px) {
  .tb-label { display: none; }
  .tb-btn { padding: 8px; }
  .status { gap: 12px; font-size: 13px; }
}
```

- [ ] **Step 7: Wire App**

`src/main.tsx` — add `import './styles/chrome.css';` after the table.css import.

`src/App.tsx` (replace):
```tsx
import { useEffect, useState } from 'react';
import { appClassName } from './ui/appClass';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { useGame } from './ui/useGame';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (dialog) game.pauseTimer();
    else game.resumeTimer();
  }, [dialog, game.pauseTimer, game.resumeTimer]);

  const playing = session.status === 'playing';
  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || dialog !== null}
          hint={null}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
        />
      </main>
      <StatusBar session={session} settings={settings} vegasBank={stats.vegasBank} />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        onChange={(patch) => {
          if (game.updateSettings(patch)) showToast('Applies to your next game');
        }}
        onClose={() => setDialog(null)}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onClose={() => setDialog(null)} />
      <Toast message={toast} />
    </div>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit` — expected PASS.
In the browser preview: the timer starts at the first move and ticks; Undo/Redo work; the New menu starts a new deal, restarts, and switches Draw 1/3; Settings changes theme (Classic ↔ Minimal, light/dark), four-color, left-handed, animation speed live; changing Draw/Scoring mid-game shows "Applies to your next game"; Stats shows a table. Check at 390×844 that the toolbar collapses to icons.

- [ ] **Step 9: Commit**

```bash
git add src tests/ui/format.test.ts
git commit -m "feat(ui): toolbar, status bar with timer, settings and stats dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Solver in a Web Worker — hints, winnability check, rewind, "no moves" dialog

**Files:**
- Create: `src/solver/worker.ts`, `src/solver/client.ts`, `src/ui/useSolver.ts`, `src/ui/dialogs/NoMovesDialog.tsx`
- Modify: `src/App.tsx` (replace)
- Test: `tests/ui/useSolver.test.ts` (pure helper only)

**Interfaces:**
- Consumes: `solve`, `findLastWinnable`, `hasProductiveMove`, `heuristicHint`, `Game`, `Hint`.
- Produces:
  - Worker protocol: `WorkerRequest = {id; kind:'solve'; state; maxNodes; timeMs} | {id; kind:'lastWinnable'; states: GameState[]; timeMs}`; `WorkerResponse = {id; kind:'solve'; result: SolveResult} | {id; kind:'lastWinnable'; index: number}`. Vegas states are solved with `limitRecycles: true`.
  - `class SolverClient { solve(state, timeMs = 1500, maxNodes = 400_000): Promise<SolveResult>; lastWinnable(states, timeMs = 5000): Promise<number>; cancel(): void; dispose(): void }` — worker created lazily; `cancel()` terminates in-flight work and rejects pending promises with `Error('cancelled')`.
  - `toHint(move): Hint`
  - `useSolver(game, notify) → { hint; busy: 'hint' | 'check' | 'rewind' | null; stuck: 'no-moves' | 'unwinnable' | null; dismissStuck(); requestHint(); checkWinnable(); rewind() }`
  - `<NoMovesDialog kind canUndo busy onUndo onRewind onRestart onNewGame onClose />`

- [ ] **Step 1: Write the failing test**

`tests/ui/useSolver.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toHint } from '../../src/ui/useSolver';

describe('toHint', () => {
  it('maps card moves to a move hint and stock moves to the stock', () => {
    expect(toHint({ type: 'move', from: 'T2', to: 'F1', count: 1 })).toEqual({ kind: 'move', from: 'T2', to: 'F1', count: 1 });
    expect(toHint({ type: 'draw' })).toEqual({ kind: 'stock' });
    expect(toHint({ type: 'recycle' })).toEqual({ kind: 'stock' });
  });
});
```

Run: `npx vitest run tests/ui/useSolver.test.ts` — expected FAIL (module not found).

- [ ] **Step 2: Worker and client**

`src/solver/worker.ts`:
```ts
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
```

`src/solver/client.ts`:
```ts
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
      this.pending.set(id, { resolve, reject });
      this.ensure().postMessage({ ...body, id } as WorkerRequest);
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
```

- [ ] **Step 3: useSolver hook**

`src/ui/useSolver.ts`:
```ts
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
```

- [ ] **Step 4: No-moves dialog**

`src/ui/dialogs/NoMovesDialog.tsx`:
```tsx
import type { Stuck } from '../useSolver';
import { Modal } from './Modal';

interface Props {
  kind: Stuck;
  canUndo: boolean;
  busy: boolean;
  onUndo(): void;
  onRewind(): void;
  onRestart(): void;
  onNewGame(): void;
  onClose(): void;
}

export function NoMovesDialog(p: Props) {
  const lost = p.kind === 'unwinnable';
  return (
    <Modal
      open={p.kind !== null}
      title={lost ? 'No winning line from here' : 'No moves left'}
      onClose={p.onClose}
      actions={
        <>
          <button type="button" onClick={p.onClose}>Keep playing</button>
          {p.canUndo && <button type="button" onClick={p.onUndo}>Undo</button>}
          <button type="button" onClick={p.onRestart}>Restart deal</button>
          <button type="button" onClick={p.onNewGame}>New game</button>
          {p.canUndo && (
            <button type="button" className="primary" disabled={p.busy} onClick={p.onRewind}>
              {p.busy ? 'Searching…' : 'Rewind to last winnable'}
            </button>
          )}
        </>
      }
    >
      <p>
        {lost
          ? 'The solver checked every possibility: this position can’t be won. Every deal starts winnable, so you can rewind to the last position that could still be won.'
          : 'There are no useful moves left. Rewind to the last position that could still be won, or start over.'}
      </p>
    </Modal>
  );
}
```

- [ ] **Step 5: Wire App**

`src/App.tsx` (replace):
```tsx
import { useEffect, useState } from 'react';
import { appClassName } from './ui/appClass';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { useGame } from './ui/useGame';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);

  const anyDialog = dialog !== null || solver.stuck !== null;
  useEffect(() => {
    if (anyDialog) game.pauseTimer();
    else game.resumeTimer();
  }, [anyDialog, game.pauseTimer, game.resumeTimer]);

  const playing = session.status === 'playing';
  const closeStuck = (then?: () => void) => () => {
    solver.dismissStuck();
    then?.();
  };

  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        busy={solver.busy}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onHint={solver.requestHint}
        onCheck={solver.checkWinnable}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || anyDialog}
          hint={solver.hint}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
        />
      </main>
      <StatusBar session={session} settings={settings} vegasBank={stats.vegasBank} />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        onChange={(patch) => {
          if (game.updateSettings(patch)) showToast('Applies to your next game');
        }}
        onClose={() => setDialog(null)}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onClose={() => setDialog(null)} />
      <NoMovesDialog
        kind={playing ? solver.stuck : null}
        canUndo={session.history.length > 0}
        busy={solver.busy === 'rewind'}
        onUndo={closeStuck(game.undo)}
        onRewind={solver.rewind}
        onRestart={closeStuck(game.restart)}
        onNewGame={closeStuck(() => game.newGame())}
        onClose={closeStuck()}
      />
      <Toast message={toast} />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build` — expected PASS, and the build output lists a separate `worker-*.js` chunk.
In the browser preview: Hint shows "Thinking…" briefly, then pulses a card and glows its destination (or glows the stock); making any move clears the hint. "Winnable?" shows a toast. Force a dead end (play badly or repeatedly move cards to create a stuck state) and confirm the "No moves left" dialog appears and "Rewind to last winnable" rewinds with a toast. Confirm the UI never freezes while the solver runs (drag a card during "Thinking…").

- [ ] **Step 7: Commit**

```bash
git add src tests/ui/useSolver.test.ts
git commit -m "feat: solver worker with smart hints, winnability check and rewind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Win sequence, result dialog, and sound

**Files:**
- Create: `src/ui/turnEffect.ts`, `src/ui/sound.ts`, `src/ui/WinCascade.tsx`, `src/ui/dialogs/ResultDialog.tsx`
- Modify: `src/ui/Table.tsx` (add `celebrate`/`onCelebrated` props), `src/styles/table.css`, `src/App.tsx` (replace)
- Test: `tests/ui/turnEffect.test.ts`

**Interfaces:**
- Consumes: `Layout`, `classicCardUrl`, `minimalCardSvg`, `Session`, `Stats`.
- Produces:
  - `type TurnEffect = 'draw' | 'recycle' | 'flip' | 'foundation' | 'move'`; `turnEffect(prev, next): TurnEffect | null` (null for identical states or a fresh deal)
  - `playSound(e: TurnEffect | 'win' | 'nope'): void`
  - `<WinCascade layout theme fourColor onDone />` (canvas; tap to skip)
  - `<ResultDialog open session stats onNewGame onReplay onClose />` — dialog accessible name `You won!`
  - `Table` gains optional props `celebrate?: boolean; onCelebrated?(): void`

- [ ] **Step 1: Write the failing test**

`tests/ui/turnEffect.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { turnEffect } from '../../src/ui/turnEffect';
import { applyMove } from '../../src/engine/apply';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';

describe('turnEffect', () => {
  it('classifies turns', () => {
    const s = makeState({ stock: cards('2C'), waste: cards('3C'), moves: 1, cols: [['5S AH', 1], ['9C 8H', 1], ['9S', 0]] });
    expect(turnEffect(s, s)).toBeNull();
    expect(turnEffect(s, applyMove(s, { type: 'draw' }))).toBe('draw');
    expect(turnEffect(s, applyMove(s, { type: 'move', from: 'T0', to: 'F1', count: 1 }))).toBe('flip');
    const noStock = makeState({ waste: cards('3C'), moves: 1 });
    expect(turnEffect(noStock, applyMove(noStock, { type: 'recycle' }))).toBe('recycle');
    const up = makeState({ moves: 1, cols: [['AH', 0]] });
    expect(turnEffect(up, applyMove(up, { type: 'move', from: 'T0', to: 'F1', count: 1 }))).toBe('foundation');
    const t = makeState({ moves: 1, cols: [['8H', 0], ['9S', 0]] });
    expect(turnEffect(t, applyMove(t, { type: 'move', from: 'T0', to: 'T1', count: 1 }))).toBe('move');
  });
  it('is silent for a fresh deal', () => {
    expect(turnEffect(deal(1, 1, 'standard'), deal(2, 1, 'standard'))).toBeNull();
  });
});
```

Run: `npx vitest run tests/ui/turnEffect.test.ts` — expected FAIL.

- [ ] **Step 2: Implement turnEffect and sound**

`src/ui/turnEffect.ts`:
```ts
import type { GameState } from '../engine/types';

export type TurnEffect = 'draw' | 'recycle' | 'flip' | 'foundation' | 'move';

const onFoundations = (s: GameState) => s.foundations.reduce((n, f) => n + f.length, 0);
const faceDown = (s: GameState) => s.tableau.reduce((n, c) => n + c.faceUpFrom, 0);

export function turnEffect(prev: GameState, next: GameState): TurnEffect | null {
  if (prev === next || next.moves === 0) return null;
  if (next.recycles > prev.recycles) return 'recycle';
  if (faceDown(next) < faceDown(prev)) return 'flip';
  if (onFoundations(next) > onFoundations(prev)) return 'foundation';
  if (next.stock.length < prev.stock.length && next.waste.length > prev.waste.length) return 'draw';
  return 'move';
}
```

`src/ui/sound.ts`:
```ts
import type { TurnEffect } from './turnEffect';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short filtered noise burst: the "snap" of a card. */
function snap(freq: number, dur: number, vol: number) {
  const a = audio();
  if (!a) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const gain = a.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

function tone(freq: number, at: number, dur: number, vol: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playSound(e: TurnEffect | 'win' | 'nope'): void {
  switch (e) {
    case 'draw':
      snap(2600, 0.05, 0.35);
      break;
    case 'recycle':
      snap(1400, 0.14, 0.3);
      break;
    case 'flip':
      snap(1200, 0.07, 0.45);
      break;
    case 'foundation':
      snap(1800, 0.05, 0.35);
      tone(880, 0, 0.12, 0.06);
      break;
    case 'move':
      snap(1700, 0.05, 0.4);
      break;
    case 'nope':
      tone(160, 0, 0.14, 0.08);
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.1));
      break;
  }
}
```

- [ ] **Step 3: Win cascade**

`src/ui/WinCascade.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import type { CardId } from '../engine/cards';
import type { Theme } from '../store/settings';
import { classicCardUrl } from './CardFront';
import { minimalCardSvg, type Palette } from './cards/minimal';
import type { Layout } from './layout';

interface Props {
  layout: Layout;
  theme: Theme;
  fourColor: boolean;
  onDone(): void;
}

interface Particle {
  id: CardId;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The classic bouncing-card cascade: cards leave the foundations K→A and trail across a canvas that is never cleared. */
export function WinCascade({ layout, theme, fourColor, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      done.current();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(canvas);
    const v = (name: string) => css.getPropertyValue(name).trim() || '#000';
    const pal: Palette = { S: v('--suit-S'), H: v('--suit-H'), D: v('--suit-D'), C: v('--suit-C'), face: v('--card-face'), edge: v('--card-edge') };
    const images = new Map<CardId, HTMLImageElement>();
    for (let id = 0; id < 52; id++) {
      const img = new Image();
      img.src =
        theme === 'classic'
          ? classicCardUrl(id, fourColor)
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(minimalCardSvg(id, pal))}`;
      images.set(id, img);
    }

    const queue: { id: CardId; x: number; y: number }[] = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (let f = 0; f < 4; f++) queue.push({ id: f * 13 + rank - 1, ...layout.foundations[f] });
    }
    const live: Particle[] = [];
    let frame = 0;
    let raf = 0;

    const tick = () => {
      if (frame++ % 10 === 0 && queue.length) {
        const q = queue.shift()!;
        live.push({ ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 6), vy: -2 - Math.random() * 8 });
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        for (let k = 0; k < 2; k++) {
          p.vy += 0.5;
          p.x += p.vx;
          p.y += p.vy;
          if (p.y + layout.cardH > h) {
            p.y = h - layout.cardH;
            p.vy *= -0.8;
          }
          const img = images.get(p.id)!;
          if (img.complete && img.naturalWidth) ctx.drawImage(img, p.x, p.y, layout.cardW, layout.cardH);
        }
        if (p.x > w || p.x + layout.cardW < 0) live.splice(i, 1);
      }
      if (!queue.length && !live.length) {
        done.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout, theme, fourColor]);

  return <canvas ref={ref} className="win-cascade" aria-hidden="true" onPointerDown={() => done.current()} />;
}
```

Append to `src/styles/table.css`:
```css
.win-cascade { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4500; cursor: pointer; }
.result { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 0; }
.result div { background: var(--panel-line); border-radius: 12px; padding: 10px 12px; }
.result dt { font-size: 12px; color: var(--panel-muted); }
.result dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
```

In `src/ui/Table.tsx`:
1. Add to `TableProps`: `celebrate?: boolean; onCelebrated?(): void;`
2. Add the import `import { WinCascade } from './WinCascade';`
3. Just before the closing `</div>` of the table (after the hint-target block), render:
```tsx
      {layout && p.celebrate && (
        <WinCascade layout={layout} theme={p.settings.theme} fourColor={p.settings.fourColor} onDone={() => p.onCelebrated?.()} />
      )}
```

- [ ] **Step 4: Result dialog**

`src/ui/dialogs/ResultDialog.tsx`:
```tsx
import type { Session } from '../../game/session';
import { elapsed } from '../../game/timer';
import type { Stats } from '../../store/stats';
import { formatTime } from '../format';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  session: Session;
  stats: Stats;
  onNewGame(): void;
  onReplay(): void;
  onClose(): void;
}

export function ResultDialog({ open, session, stats, onNewGame, onReplay, onClose }: Props) {
  const mode = session.drawCount === 1 ? stats.draw1 : stats.draw3;
  return (
    <Modal
      open={open}
      title="You won!"
      className="result-dialog"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onReplay}>Replay deal</button>
          <button type="button" className="primary" onClick={onNewGame}>New game</button>
        </>
      }
    >
      <dl className="result">
        <div>
          <dt>Time</dt>
          <dd>{formatTime(elapsed(session.timer, Date.now()))}</dd>
        </div>
        <div>
          <dt>Moves</dt>
          <dd>{session.state.moves}</dd>
        </div>
        {session.scoring !== 'none' && (
          <div>
            <dt>Score</dt>
            <dd>{session.scoring === 'vegas' ? `$${session.state.score}` : session.state.score}</dd>
          </div>
        )}
        <div>
          <dt>Win streak</dt>
          <dd>{mode.currentStreak}</dd>
        </div>
      </dl>
    </Modal>
  );
}
```

- [ ] **Step 5: Wire App**

`src/App.tsx` (replace):
```tsx
import { useEffect, useRef, useState } from 'react';
import { appClassName, effectiveAnimation } from './ui/appClass';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { ResultDialog } from './ui/dialogs/ResultDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { playSound } from './ui/sound';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { turnEffect } from './ui/turnEffect';
import { useGame } from './ui/useGame';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);
  const [celebrate, setCelebrate] = useState(false);
  const [showResult, setShowResult] = useState(session.status === 'won');

  // Sounds and the win sequence react to state transitions.
  const prev = useRef(session);
  useEffect(() => {
    const before = prev.current;
    prev.current = session;
    if (before === session) return;
    if (settings.sound) {
      const effect = turnEffect(before.state, session.state);
      if (effect) playSound(effect);
    }
    if (before.status !== 'won' && session.status === 'won') {
      if (settings.sound) playSound('win');
      if (effectiveAnimation(settings) === 'off') setShowResult(true);
      else setCelebrate(true);
    }
    if (session.status !== 'won') {
      setCelebrate(false);
      setShowResult(false);
    }
  }, [session, settings]);

  const anyDialog = dialog !== null || solver.stuck !== null || showResult;
  useEffect(() => {
    if (anyDialog) game.pauseTimer();
    else game.resumeTimer();
  }, [anyDialog, game.pauseTimer, game.resumeTimer]);

  const playing = session.status === 'playing';
  const closeStuck = (then?: () => void) => () => {
    solver.dismissStuck();
    then?.();
  };

  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        busy={solver.busy}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onHint={solver.requestHint}
        onCheck={solver.checkWinnable}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || anyDialog}
          hint={solver.hint}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
          onReject={() => settings.sound && playSound('nope')}
          celebrate={celebrate}
          onCelebrated={() => {
            setCelebrate(false);
            setShowResult(true);
          }}
        />
      </main>
      <StatusBar session={session} settings={settings} vegasBank={stats.vegasBank} />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        onChange={(patch) => {
          if (game.updateSettings(patch)) showToast('Applies to your next game');
        }}
        onClose={() => setDialog(null)}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onClose={() => setDialog(null)} />
      <NoMovesDialog
        kind={playing ? solver.stuck : null}
        canUndo={session.history.length > 0}
        busy={solver.busy === 'rewind'}
        onUndo={closeStuck(game.undo)}
        onRewind={solver.rewind}
        onRestart={closeStuck(game.restart)}
        onNewGame={closeStuck(() => game.newGame())}
        onClose={closeStuck()}
      />
      <ResultDialog
        open={showResult}
        session={session}
        stats={stats}
        onNewGame={() => game.newGame()}
        onReplay={game.restart}
        onClose={() => setShowResult(false)}
      />
      <Toast message={toast} />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit` — expected PASS.
In the browser preview, win a game quickly: open `/?e2e=1`, then in the page console (via `javascript_tool`) replay a solver solution:
```js
// The e2e hook is active with ?e2e=1. Replace SEED with bank-draw1.json entries[0][0].
window.__sol.load(SEED, 1);
```
and drive moves from a solution computed with `npx tsx -e "import {deal} from './src/engine/deal.ts'; import {solve} from './src/solver/solve.ts'; const r = solve(deal(SEED,1,'standard'),{maxNodes:1e6}); console.log(JSON.stringify(r.solution))"` pasted into `for (const m of MOVES) { if (window.__sol.session().status !== 'playing') break; window.__sol.turn([m]); }`.
Confirm: once the last card flips, the remaining cards fly to the foundations one by one; the bouncing cascade plays (tap skips it); the "You won!" dialog shows time, moves, score and streak; Stats shows the win; sounds play when enabled and are silent when disabled. With Animation "Off", the dialog appears without the cascade.

- [ ] **Step 7: Commit**

```bash
git add src tests/ui/turnEffect.test.ts
git commit -m "feat(ui): auto-finish animation, bouncing-card win cascade, result dialog, sound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Keyboard play and screen-reader support

**Files:**
- Create: `src/ui/focus.ts`, `src/ui/useKeyboard.ts`, `src/ui/announce.ts`
- Modify: `src/ui/Table.tsx` (focus the table when keyboard focus starts), `src/App.tsx` (replace)
- Test: `tests/ui/focus.test.ts`, `tests/ui/announce.test.ts`

**Interfaces:**
- Consumes: `Focus`, `Selection`, `PileKey`, engine.
- Produces:
  - `PILE_ORDER: PileKey[]` = `['S','W','F0','F1','F2','F3','T0',…,'T6']`
  - `topIndex(state, pile): number` (−1 if empty); `clampFocus(state, focus): Focus`
  - `stepFocus(state, focus | null, dir: 'left'|'right'|'up'|'down'): Focus`
  - `type Activation = {action:'stock'} | {action:'select'; selection} | {action:'move'; move} | {action:'cancel'} | {action:'reject'}`; `activate(state, focus, selection | null): Activation`
  - `useKeyboard({ enabled, state, onTurn, onStockTap, onUndo, onRedo, onHint, onNew, onReject }) → { focus, selection }`
  - `describeTurn(before: GameState, moves: Move[]): string`
  - Shortcuts: `Z`/`Ctrl+Z`/`Cmd+Z` undo; `Shift+Z`/`Ctrl+Y`/`Cmd+Shift+Z` redo; `H` hint; `D` draw; `N` new game; arrows move focus; `Enter`/`Space` pick up / place / draw on the stock; `Esc` cancels.

- [ ] **Step 1: Write the failing tests**

`tests/ui/focus.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { activate, clampFocus, stepFocus, topIndex } from '../../src/ui/focus';
import { cards, makeState } from '../helpers';

const s = makeState({ stock: cards('2C'), waste: cards('3C'), cols: [['9C 8H 7S', 1], ['9S', 0]] });

describe('stepFocus', () => {
  it('starts on the first column', () => {
    expect(stepFocus(s, null, 'right')).toEqual({ pile: 'T0', index: 2 });
  });
  it('cycles left and right through piles, landing on the top card', () => {
    expect(stepFocus(s, { pile: 'T0', index: 2 }, 'right')).toEqual({ pile: 'T1', index: 0 });
    expect(stepFocus(s, { pile: 'S', index: 0 }, 'left')).toEqual({ pile: 'T6', index: -1 });
    expect(stepFocus(s, { pile: 'S', index: 0 }, 'right')).toEqual({ pile: 'W', index: 0 });
  });
  it('moves up and down through face-up cards, then up to the top row', () => {
    expect(stepFocus(s, { pile: 'T0', index: 2 }, 'up')).toEqual({ pile: 'T0', index: 1 });
    expect(stepFocus(s, { pile: 'T0', index: 1 }, 'up')).toEqual({ pile: 'S', index: 0 });
    expect(stepFocus(s, { pile: 'T0', index: 1 }, 'down')).toEqual({ pile: 'T0', index: 2 });
    expect(stepFocus(s, { pile: 'W', index: 0 }, 'down')).toEqual({ pile: 'T1', index: 0 });
  });
});

describe('activate', () => {
  it('draws on the stock', () => {
    expect(activate(s, { pile: 'S', index: 0 }, null)).toEqual({ action: 'stock' });
  });
  it('selects a face-up run and places it', () => {
    const sel = activate(s, { pile: 'T0', index: 1 }, null);
    expect(sel).toEqual({ action: 'select', selection: { from: 'T0', count: 2 } });
    expect(activate(s, { pile: 'T1', index: 0 }, { from: 'T0', count: 2 })).toEqual({
      action: 'move',
      move: { type: 'move', from: 'T0', to: 'T1', count: 2 },
    });
  });
  it('rejects illegal targets and cancels on the source pile', () => {
    expect(activate(s, { pile: 'W', index: 0 }, { from: 'T0', count: 2 })).toEqual({ action: 'reject' });
    expect(activate(s, { pile: 'T0', index: 2 }, { from: 'T0', count: 1 })).toEqual({ action: 'cancel' });
    expect(activate(s, { pile: 'T0', index: 0 }, null)).toEqual({ action: 'reject' });
  });
});

describe('clampFocus and topIndex', () => {
  it('keeps focus on real cards', () => {
    expect(topIndex(s, 'T2')).toBe(-1);
    expect(clampFocus(s, { pile: 'T0', index: 9 })).toEqual({ pile: 'T0', index: 2 });
    expect(clampFocus(s, { pile: 'T0', index: 0 })).toEqual({ pile: 'T0', index: 1 });
  });
});
```

`tests/ui/announce.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { describeTurn } from '../../src/ui/announce';
import { cards, makeState } from '../helpers';

describe('describeTurn', () => {
  it('describes draws, moves, flips and recycles', () => {
    const s = makeState({ stock: cards('2C 4D'), cols: [['5S AH', 1], ['9S', 0], ['9C 8H', 1]] });
    expect(describeTurn(s, [{ type: 'draw' }])).toBe('Drew 4 of diamonds.');
    expect(describeTurn(s, [{ type: 'move', from: 'T0', to: 'F1', count: 1 }])).toBe(
      'Moved ace of hearts to the foundation. Revealed 5 of spades.',
    );
    expect(describeTurn(s, [{ type: 'move', from: 'T2', to: 'T1', count: 1 }])).toBe(
      'Moved 8 of hearts to column 2. Revealed 9 of clubs.',
    );
    const r = makeState({ waste: cards('2C') });
    expect(describeTurn(r, [{ type: 'recycle' }])).toBe('Turned the waste back over.');
  });
});
```

Run: `npx vitest run tests/ui/focus.test.ts tests/ui/announce.test.ts` — expected FAIL.

- [ ] **Step 2: Implement focus logic**

`src/ui/focus.ts`:
```ts
import { canMove } from '../engine/rules';
import type { GameState, Move, PileId } from '../engine/types';
import type { PileKey } from './layout';
import type { Focus, Selection } from './types';

export const PILE_ORDER: PileKey[] = ['S', 'W', 'F0', 'F1', 'F2', 'F3', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

export function pileCards(s: GameState, pile: PileKey) {
  if (pile === 'S') return s.stock;
  if (pile === 'W') return s.waste;
  const i = Number(pile.slice(1));
  return pile[0] === 'F' ? s.foundations[i] : s.tableau[i].cards;
}

export const topIndex = (s: GameState, pile: PileKey): number => pileCards(s, pile).length - 1;

export function clampFocus(s: GameState, f: Focus): Focus {
  const top = topIndex(s, f.pile);
  if (f.pile[0] !== 'T') return { pile: f.pile, index: top };
  const col = s.tableau[Number(f.pile.slice(1))];
  if (top < 0) return { pile: f.pile, index: -1 };
  return { pile: f.pile, index: Math.min(top, Math.max(col.faceUpFrom, f.index)) };
}

/** Column under each top-row pile (for Down) and the top-row pile above each column (for Up). */
const BELOW: Record<string, PileId> = { S: 'T0', W: 'T1', F0: 'T3', F1: 'T4', F2: 'T5', F3: 'T6' };
const ABOVE: PileKey[] = ['S', 'W', 'W', 'F0', 'F1', 'F2', 'F3'];

export function stepFocus(s: GameState, f: Focus | null, dir: 'left' | 'right' | 'up' | 'down'): Focus {
  const at = (pile: PileKey): Focus => ({ pile, index: topIndex(s, pile) });
  if (!f) return at('T0');
  if (dir === 'left' || dir === 'right') {
    const n = PILE_ORDER.length;
    const i = PILE_ORDER.indexOf(f.pile);
    return at(PILE_ORDER[(i + (dir === 'right' ? 1 : n - 1)) % n]);
  }
  if (f.pile[0] !== 'T') return dir === 'down' ? at(BELOW[f.pile]) : f;
  const ci = Number(f.pile.slice(1));
  const col = s.tableau[ci];
  if (dir === 'up') return f.index > col.faceUpFrom ? { ...f, index: f.index - 1 } : at(ABOVE[ci]);
  return { ...f, index: Math.min(col.cards.length - 1, f.index + 1) };
}

export type Activation =
  | { action: 'stock' }
  | { action: 'select'; selection: Selection }
  | { action: 'move'; move: Move }
  | { action: 'cancel' }
  | { action: 'reject' };

export function activate(s: GameState, f: Focus, selection: Selection | null): Activation {
  if (f.pile === 'S') return { action: 'stock' };
  if (selection) {
    if (f.pile === selection.from) return { action: 'cancel' };
    const move: Move = { type: 'move', from: selection.from, to: f.pile, count: selection.count };
    return canMove(s, move) ? { action: 'move', move } : { action: 'reject' };
  }
  const top = topIndex(s, f.pile);
  if (f.index < 0 || top < 0) return { action: 'reject' };
  if (f.pile[0] !== 'T') return f.index === top ? { action: 'select', selection: { from: f.pile, count: 1 } } : { action: 'reject' };
  const col = s.tableau[Number(f.pile.slice(1))];
  if (f.index < col.faceUpFrom) return { action: 'reject' };
  return { action: 'select', selection: { from: f.pile, count: col.cards.length - f.index } };
}
```

- [ ] **Step 3: Implement announcements**

`src/ui/announce.ts`:
```ts
import { cardName } from '../engine/cards';
import { applyMove } from '../engine/apply';
import { movingCards } from '../engine/rules';
import type { GameState, Move } from '../engine/types';

function destination(to: string): string {
  if (to[0] === 'F') return 'the foundation';
  return `column ${Number(to.slice(1)) + 1}`;
}

/** Plain-language description of a turn for the aria-live region. */
export function describeTurn(before: GameState, moves: Move[]): string {
  const parts: string[] = [];
  let cur = before;
  for (const m of moves) {
    if (m.type === 'draw') {
      const next = applyMove(cur, m);
      parts.push(`Drew ${cardName(next.waste[next.waste.length - 1])}.`);
      cur = next;
      continue;
    }
    if (m.type === 'recycle') {
      parts.push('Turned the waste back over.');
      cur = applyMove(cur, m);
      continue;
    }
    const lifted = movingCards(cur, m.from, m.count) ?? [];
    const what = lifted.length > 1 ? `${cardName(lifted[0])} and ${lifted.length - 1} more` : cardName(lifted[0]);
    const next = applyMove(cur, m);
    parts.push(`Moved ${what} to ${destination(m.to)}.`);
    if (m.from[0] === 'T') {
      const i = Number(m.from.slice(1));
      const was = cur.tableau[i];
      const now = next.tableau[i];
      if (now.cards.length && now.faceUpFrom < was.faceUpFrom) parts.push(`Revealed ${cardName(now.cards[now.cards.length - 1])}.`);
    }
    cur = next;
  }
  return parts.join(' ');
}
```

- [ ] **Step 4: Keyboard hook**

`src/ui/useKeyboard.ts`:
```ts
import { useEffect, useRef, useState } from 'react';
import type { GameState, Move } from '../engine/types';
import { activate, clampFocus, stepFocus } from './focus';
import type { Focus, Selection } from './types';

interface Args {
  enabled: boolean;
  state: GameState;
  onTurn(moves: Move[]): void;
  onStockTap(): void;
  onUndo(): void;
  onRedo(): void;
  onHint(): void;
  onNew(): void;
  onReject(): void;
}

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export function useKeyboard(args: Args) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const a = useRef(args);
  a.current = args;
  const live = useRef({ focus, selection });
  live.current = { focus, selection };

  // Keep focus on a real card and drop any selection whenever the position changes.
  useEffect(() => {
    setSelection(null);
    setFocus((f) => (f ? clampFocus(args.state, f) : f));
  }, [args.state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { enabled, state, onTurn, onStockTap, onUndo, onRedo, onHint, onNew, onReject } = a.current;
      if (!enabled) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, dialog')) return;
      const onControl = !!target?.closest('button, summary, a');
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod && !e.shiftKey && key.toLowerCase() === 'z') return e.preventDefault(), onUndo();
      if (mod && (key.toLowerCase() === 'y' || (e.shiftKey && key.toLowerCase() === 'z'))) return e.preventDefault(), onRedo();
      if (mod || e.altKey) return;

      if (key === 'z') return onUndo();
      if (key === 'Z') return onRedo();
      if (key === 'h' || key === 'H') return onHint();
      if (key === 'd' || key === 'D') return onStockTap();
      if (key === 'n' || key === 'N') return onNew();
      if (key === 'Escape') return setSelection(null);
      if (onControl) return; // let buttons handle Enter/Space/arrows themselves

      const dir = ARROWS[key];
      if (dir) {
        e.preventDefault();
        setFocus((f) => stepFocus(state, f, dir));
        return;
      }
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const { focus: f, selection: sel } = live.current;
        if (!f) return setFocus(stepFocus(state, null, 'right'));
        const act = activate(state, f, sel);
        if (act.action === 'stock') onStockTap();
        else if (act.action === 'select') setSelection(act.selection);
        else if (act.action === 'cancel') setSelection(null);
        else if (act.action === 'move') onTurn([act.move]);
        else onReject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { focus, selection };
}
```

- [ ] **Step 5: Table focuses itself for screen readers**

In `src/ui/Table.tsx`, add `useEffect` to the React import and, after `const activeId = …`, add:
```tsx
  // When keyboard focus starts, move DOM focus to the table so aria-activedescendant is announced.
  useEffect(() => {
    if (p.focus && ref.current && document.activeElement === document.body) ref.current.focus({ preventScroll: true });
  }, [p.focus]);
```

- [ ] **Step 6: Final App**

`src/App.tsx` (replace):
```tsx
import { useEffect, useRef, useState } from 'react';
import { appClassName, effectiveAnimation } from './ui/appClass';
import { describeTurn } from './ui/announce';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { ResultDialog } from './ui/dialogs/ResultDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { playSound } from './ui/sound';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { turnEffect } from './ui/turnEffect';
import { useGame } from './ui/useGame';
import { useKeyboard } from './ui/useKeyboard';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);
  const [celebrate, setCelebrate] = useState(false);
  const [showResult, setShowResult] = useState(session.status === 'won');
  const [announcement, setAnnouncement] = useState('');

  const playing = session.status === 'playing';
  const anyDialog = dialog !== null || solver.stuck !== null || showResult;
  const reject = () => {
    if (settings.sound) playSound('nope');
    setAnnouncement("Can't move there.");
  };

  const keys = useKeyboard({
    enabled: playing && !anyDialog,
    state: session.state,
    onTurn: game.turn,
    onStockTap: game.stockTap,
    onUndo: game.undo,
    onRedo: game.redo,
    onHint: solver.requestHint,
    onNew: () => game.newGame(),
    onReject: reject,
  });

  // Sounds, announcements and the win sequence react to session transitions.
  const prev = useRef(session);
  useEffect(() => {
    const before = prev.current;
    prev.current = session;
    if (before === session) return;

    if (settings.sound) {
      const effect = turnEffect(before.state, session.state);
      if (effect) playSound(effect);
    }

    if (before.status !== 'won' && session.status === 'won') {
      setAnnouncement('You won!');
      if (settings.sound) playSound('win');
      if (effectiveAnimation(settings) === 'off') setShowResult(true);
      else setCelebrate(true);
    } else if (before.status === 'playing' && session.status === 'finishing') {
      setAnnouncement('All cards revealed. Finishing automatically.');
    } else if (session.seed !== before.seed || (session.turns.length === 0 && before.turns.length > 0 && session.undos === 0)) {
      setAnnouncement('New deal.');
    } else if (session.turns.length > before.turns.length) {
      setAnnouncement(describeTurn(session.history[session.history.length - 1], session.turns[session.turns.length - 1]));
    } else if (session.undos > before.undos) {
      setAnnouncement('Move undone.');
    }

    if (session.status !== 'won') {
      setCelebrate(false);
      setShowResult(false);
    }
  }, [session, settings]);

  useEffect(() => {
    if (anyDialog) game.pauseTimer();
    else game.resumeTimer();
  }, [anyDialog, game.pauseTimer, game.resumeTimer]);

  useEffect(() => {
    if (solver.hint) setAnnouncement('Hint shown.');
  }, [solver.hint]);

  const closeStuck = (then?: () => void) => () => {
    solver.dismissStuck();
    then?.();
  };

  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        busy={solver.busy}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onHint={solver.requestHint}
        onCheck={solver.checkWinnable}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || anyDialog}
          hint={solver.hint}
          focus={keys.focus}
          selection={keys.selection}
          onTurn={game.turn}
          onStockTap={game.stockTap}
          onReject={reject}
          celebrate={celebrate}
          onCelebrated={() => {
            setCelebrate(false);
            setShowResult(true);
          }}
        />
      </main>
      <StatusBar session={session} settings={settings} vegasBank={stats.vegasBank} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        onChange={(patch) => {
          if (game.updateSettings(patch)) showToast('Applies to your next game');
        }}
        onClose={() => setDialog(null)}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onClose={() => setDialog(null)} />
      <NoMovesDialog
        kind={playing ? solver.stuck : null}
        canUndo={session.history.length > 0}
        busy={solver.busy === 'rewind'}
        onUndo={closeStuck(game.undo)}
        onRewind={solver.rewind}
        onRestart={closeStuck(game.restart)}
        onNewGame={closeStuck(() => game.newGame())}
        onClose={closeStuck()}
      />
      <ResultDialog
        open={showResult}
        session={session}
        stats={stats}
        onNewGame={() => game.newGame()}
        onReplay={game.restart}
        onClose={() => setShowResult(false)}
      />
      <Toast message={toast} />
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit` — expected PASS.
In the browser preview, without the mouse: press an arrow key (focus ring appears on column 1's top card), move with arrows, Enter to pick up (card highlights), arrows to a legal pile, Enter to place; `D` draws; `Z` undoes; `Shift+Z` redoes; `H` shows a hint; `Esc` cancels a selection. Use `read_page` to confirm cards expose names like "7 of hearts, face up", face-down cards expose "face-down card", and the live region text updates after a move.

- [ ] **Step 8: Commit**

```bash
git add src tests/ui
git commit -m "feat(a11y): keyboard play, focus model, screen-reader announcements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: PWA (offline, installable) and end-to-end tests

**Files:**
- Create: `public/icon.svg`, generated icons in `public/`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/game.spec.ts`
- Modify: `vite.config.ts`, `index.html`, `package.json` (dev dependency)

**Interfaces:**
- Consumes: the e2e hook and DOM contract from Task 13; accessible names from Tasks 14–17.
- Produces: a service worker precaching the app shell, worker chunk, deal banks, and card art; a web manifest; `npm run e2e` green on desktop and mobile projects.

- [ ] **Step 1: Icon and PWA assets**

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#12603a"/>
  <g transform="rotate(-10 256 256)">
    <rect x="150" y="104" width="212" height="296" rx="24" fill="#fffdf8" stroke="#d9d3c5" stroke-width="6"/>
    <text x="176" y="176" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#1a1a1a">A</text>
    <path transform="translate(206 222) scale(1)" fill="#1a1a1a" d="M50 2C62 24 98 42 98 66C98 80 87 89 75 89C66 89 58 85 54 78C55 88 59 95 67 100H33C41 95 45 88 46 78C42 85 34 89 25 89C13 89 2 80 2 66C2 42 38 24 50 2Z"/>
  </g>
</svg>
```

Run:
```bash
npm i -D @vite-pwa/assets-generator
npx pwa-assets-generator --preset minimal-2023 public/icon.svg
ls public
```
Expected: `favicon.ico`, `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` in `public/`.

- [ ] **Step 2: Configure vite-plugin-pwa**

`vite.config.ts` (replace):
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Solitaire',
        short_name: 'Solitaire',
        description: 'Ad-free Klondike solitaire. Every deal is winnable.',
        theme_color: '#0f5132',
        background_color: '#0f5132',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
```

`index.html` — add inside `<head>` after the description meta:
```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

Run: `npm run build`
Expected: build prints a `PWA` summary with a precache entry count (> 100 entries including card SVGs) and writes `dist/sw.js` and `dist/manifest.webmanifest`. Check the main JS chunk's gzip size in the build output is ≤ 150 KB; if not, report the sizes before proceeding.

- [ ] **Step 3: Playwright config and helpers**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

`e2e/helpers.ts`:
```ts
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { DrawCount, GameState, Move } from '../src/engine/types';
import type { Session } from '../src/game/session';

declare global {
  interface Window {
    __sol: { session(): Session; turn(moves: Move[]): void; load(seed: number, drawCount: DrawCount): void };
  }
}

export const BANK1 = JSON.parse(readFileSync('src/deals/bank-draw1.json', 'utf8')) as { entries: [number, number][] };
export const SEED = BANK1.entries[0][0];

/** Clean storage, deterministic settings (no animation, no sound, no auto-play), optional fixed deal. */
export async function freshGame(page: Page, opts: { seed?: number; drawCount?: DrawCount; settings?: Record<string, unknown> } = {}) {
  await page.goto('/?e2e=1');
  await page.evaluate((settings) => {
    localStorage.clear();
    localStorage.setItem('sol.v1.settings', JSON.stringify({ animation: 'off', sound: false, autoPlay: false, ...settings }));
  }, opts.settings ?? {});
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  if (opts.seed !== undefined) {
    await page.evaluate(([s, d]) => window.__sol.load(s, d), [opts.seed, opts.drawCount ?? 1] as [number, DrawCount]);
  }
}

export const getSession = (page: Page) => page.evaluate(() => window.__sol.session());
export const getState = async (page: Page): Promise<GameState> => (await getSession(page)).state;
export const pileCount = (page: Page, pile: string) => page.locator(`[data-card][data-pile="${pile}"]`).count();

export async function clickCenter(page: Page, selector: string, dy?: number) {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + (dy ?? box.height / 2));
}

export const clickStock = (page: Page) => clickCenter(page, '#pile-S');
```

- [ ] **Step 4: Write the e2e tests**

`e2e/game.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { deal } from '../src/engine/deal';
import { destinationsFor, legalMoves } from '../src/engine/movegen';
import type { GameState, Move, PileId } from '../src/engine/types';
import { solve } from '../src/solver/solve';
import { clickCenter, clickStock, freshGame, getSession, getState, pileCount, SEED } from './helpers';

function firstTap(s: GameState): { id: number; to: PileId } | null {
  const sources: [PileId, number | undefined][] = [['W', s.waste[s.waste.length - 1]]];
  s.tableau.forEach((c, i) => sources.push([`T${i}` as PileId, c.cards[c.cards.length - 1]]));
  for (const [from, id] of sources) {
    if (id === undefined) continue;
    const [to] = destinationsFor(s, from, 1);
    if (to) return { id, to };
  }
  return null;
}

test('plays a banked deal to a win, auto-finishing at the end', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const r = solve(deal(SEED, 1, 'standard'), { maxNodes: 1_000_000 });
  expect(r.status).toBe('winnable');
  if (r.status !== 'winnable') return;
  let issued = 0;
  for (const m of r.solution) {
    if ((await getSession(page)).status !== 'playing') break;
    await page.evaluate((mv) => window.__sol.turn([mv]), m);
    issued++;
  }
  await expect(page.getByRole('dialog', { name: 'You won!' })).toBeVisible({ timeout: 20_000 });
  const final = await getSession(page);
  expect(final.status).toBe('won');
  expect(final.turns.length).toBe(issued + 1); // the auto-finish is recorded as one extra turn
});

test('tapping the stock draws; tapping a playable card moves it', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  for (let i = 0; i < 30; i++) {
    const tap = firstTap(await getState(page));
    if (tap) {
      await clickCenter(page, `#card-${tap.id}`);
      await expect(page.locator(`#card-${tap.id}`)).toHaveAttribute('data-pile', tap.to);
      return;
    }
    await clickStock(page);
  }
  throw new Error('no tappable move found in 30 draws');
});

test('drag and drop moves a card onto a legal column', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  for (let i = 0; i < 30; i++) {
    const s = await getState(page);
    const m = legalMoves(s).find(
      (x): x is Extract<Move, { type: 'move' }> => x.type === 'move' && x.to[0] === 'T' && (x.from === 'W' || x.from[0] === 'T'),
    );
    if (m) {
      const src =
        m.from === 'W' ? s.waste[s.waste.length - 1] : s.tableau[Number(m.from.slice(1))].cards.slice(-m.count)[0];
      const destCol = s.tableau[Number(m.to.slice(1))].cards;
      const target = destCol.length ? `#card-${destCol[destCol.length - 1]}` : `#pile-${m.to}`;
      const a = (await page.locator(`#card-${src}`).boundingBox())!;
      const b = (await page.locator(target).boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + 10);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + 30, { steps: 12 });
      await page.mouse.up();
      await expect(page.locator(`#card-${src}`)).toHaveAttribute('data-pile', m.to);
      return;
    }
    await clickStock(page);
  }
  throw new Error('no draggable move found in 30 draws');
});

test('undo and redo buttons', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
});

test('reload restores the game and the timer', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  for (let i = 0; i < 3; i++) await clickStock(page);
  await page.waitForTimeout(2200);
  const seconds = (t: string) => t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  const before = seconds((await page.getByTestId('timer').textContent())!);
  expect(before).toBeGreaterThanOrEqual(2);
  const waste = await pileCount(page, 'W');
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  expect(await pileCount(page, 'W')).toBe(waste);
  expect(seconds((await page.getByTestId('timer').textContent())!)).toBeGreaterThanOrEqual(before);
});

test('new games never repeat a recent seed', async ({ page }) => {
  await freshGame(page);
  const seeds = [(await getSession(page)).seed];
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Game menu').click();
    await page.getByRole('menuitem', { name: 'New game' }).click();
    await expect.poll(async () => (await getSession(page)).seed).not.toBe(seeds[seeds.length - 1]);
    seeds.push((await getSession(page)).seed);
  }
  expect(new Set(seeds).size).toBe(seeds.length);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('sol.v1.recent')!).draw1 as number[]);
  for (const s of seeds) expect(recent).toContain(s);
});

test('keyboard: D draws, Z undoes, arrows + Enter move a card', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.locator('.table').focus();
  await page.keyboard.press('d');
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.keyboard.press('z');
  await expect.poll(() => pileCount(page, 'W')).toBe(0);

  const ORDER = ['S', 'W', 'F0', 'F1', 'F2', 'F3', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
  for (let i = 0; i < 30; i++) {
    const s = await getState(page);
    const tap = firstTap(s);
    if (tap) {
      const from = s.waste[s.waste.length - 1] === tap.id ? 'W' : `T${s.tableau.findIndex((c) => c.cards[c.cards.length - 1] === tap.id)}`;
      await page.keyboard.press('ArrowRight'); // first arrow focuses T0
      const go = async (a: string, b: string) => {
        const n = (ORDER.indexOf(b) - ORDER.indexOf(a) + ORDER.length) % ORDER.length;
        for (let k = 0; k < n; k++) await page.keyboard.press('ArrowRight');
      };
      await go('T0', from);
      await page.keyboard.press('Enter');
      await go(from, tap.to);
      await page.keyboard.press('Enter');
      await expect(page.locator(`#card-${tap.id}`)).toHaveAttribute('data-pile', tap.to);
      return;
    }
    await page.keyboard.press('d');
  }
  throw new Error('no keyboard move found in 30 draws');
});

test('layout fits the viewport without scrolling', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    sw: document.documentElement.scrollWidth,
    ih: innerHeight,
    iw: innerWidth,
  }));
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  const boxes = await page
    .locator('[data-card]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, b: r.bottom })));
  for (const b of boxes) {
    expect(b.l).toBeGreaterThanOrEqual(0);
    expect(b.r).toBeLessThanOrEqual(m.iw);
    expect(b.b).toBeLessThanOrEqual(m.ih);
  }
});

test('registers a service worker for offline play', async ({ page }) => {
  await freshGame(page);
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 15_000 })
    .toBe(true);
});
```

- [ ] **Step 5: Run the e2e suite**

Run: `npm run e2e`
Expected: all tests pass in both `desktop` and `mobile` projects. On failure, open the trace (`npx playwright show-trace test-results/<dir>/trace.zip`), fix the app (not the assertions) unless an assertion contradicts the spec, and re-run.

- [ ] **Step 6: Full verification**

Run: `npm test && npx tsc --noEmit && npm run build && npm run e2e`
Expected: all green. Record test counts and the main-chunk gzip size in the task report.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: installable offline PWA and Playwright end-to-end tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Deploy to solitaire.lukeghanna.com

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Produces: production deployment on Vercel project `solitaire`; domains `solitaire.lukeghanna.com` (primary) and `solitare.lukeghanna.com` (308 → primary).

Context: the Vercel CLI is logged in as `lllukehanna-8723`; `lukeghanna.com` is already on that account with **Cloudflare** nameservers, so DNS records are added in Cloudflare by Luke, not by the CLI.

- [ ] **Step 1: Vercel config**

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "solitare.lukeghanna.com" }],
      "destination": "https://solitaire.lukeghanna.com/$1",
      "permanent": true
    }
  ],
  "headers": [
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
```

- [ ] **Step 2: Link and deploy a preview**

Run:
```bash
vercel link --yes --project solitaire
vercel deploy
```
Expected: a preview URL. Open it in the browser pane, play a few moves, and confirm there are no console errors (`read_console_messages`). If the preview is behind Vercel deployment protection, use the `vercel:access-protected-vercel-deployment` skill or check it with `vercel curl`.

- [ ] **Step 3: Production deploy and domains**

Run:
```bash
vercel deploy --prod
vercel domains add solitaire.lukeghanna.com solitaire
vercel domains add solitare.lukeghanna.com solitaire
vercel domains inspect solitaire.lukeghanna.com
```
Expected: both domains attached to the project; `inspect` reports the DNS records Vercel expects (a CNAME to `cname.vercel-dns.com`, or a specific target it prints).

- [ ] **Step 4: Hand DNS to Luke (blocking)**

Tell Luke to add in Cloudflare → lukeghanna.com → DNS (both **DNS only / grey cloud**, TTL Auto), using the exact target `vercel domains inspect` printed:

| Type | Name | Target |
|------|------|--------|
| CNAME | `solitaire` | `cname.vercel-dns.com` (or the printed target) |
| CNAME | `solitare` | `cname.vercel-dns.com` (or the printed target) |

Wait for confirmation, then verify:
```bash
dig +short solitaire.lukeghanna.com
curl -sI https://solitaire.lukeghanna.com | head -5
curl -sI https://solitare.lukeghanna.com/ | grep -i -E '^(HTTP|location)'
```
Expected: the primary returns `HTTP/2 200`; the misspelled host returns `308` with `location: https://solitaire.lukeghanna.com/`. Certificates can take a few minutes after DNS resolves.

- [ ] **Step 5: Production smoke test**

Open https://solitaire.lukeghanna.com in the browser pane: play a few moves, reload (game persists), check Settings/Stats, and confirm the service worker registers. Run Lighthouse-equivalent checks if available; at minimum confirm no console errors.

- [ ] **Step 6: Commit**

```bash
git add vercel.json .gitignore
git commit -m "chore: Vercel config with misspelled-domain redirect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
