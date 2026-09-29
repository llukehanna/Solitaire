# Solitaire v1.1 Premium UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the live Klondike app a premium look. That means three switchable tables, cleaner cards, subtler motion and a visible auto-finish. Also add Space-to-draw, fix the foundation→tableau bounce, and add a solitaired.com stats import.

**Architecture:** This builds on the existing Vite + React 19 + TypeScript app on branch `feat/premium-ui`.
- The engine, session and store stay pure and unit-tested with Vitest in the node environment.
- Visual tokens live in `src/styles/themes.css` as per-table CSS custom properties on the `.app` root.
- Motion timings come from one TypeScript source (`src/ui/appClass.ts`) and are pushed into CSS as custom properties.
- Cards become an HTML/CSS face with the suits drawn as SVG paths, plus a matching canvas painter for the win cascade.

**Tech Stack:** Vite 8, React 19, TypeScript 7 (strict), Vitest 5 (node env, `tests/**/*.test.ts` only), Playwright (desktop + Pixel 7 projects), vite-plugin-pwa, and `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`.

**Spec:** `docs/superpowers/specs/2026-09-29-premium-ui-design.md`

## Global Constraints

- Tables: `studio` (default), `felt`, `paper`, with the exact colour values from spec §1 and the token values in Task 3.
- Card face: "corner + pip". Rank ≈ 0.28 × card width in Geist 600. One large pip bottom-right ≈ 0.47 × card width. Corner radius `calc(var(--card-w) * 0.055)` (4px at 72px). J/Q/K shown as letters. Faces are `#f7f3ec` on Studio/Felt and `#ffffff` on Paper.
- Four-colour suits: diamonds `#1565c0`, clubs `#2e7d32`.
- Card backs: `amber` (default), `ink`, `oxblood`, `navy`.
- Easing: `cubic-bezier(.32,.72,0,1)`.
- Moves: 240ms normal / 130ms fast / 0 off.
- Flip: 140ms / 90ms / 0, a crossfade plus 0.96→1 scale with no 3D rotation.
- Auto-finish step: 110ms normal / 70ms fast / 0 off. The celebration starts after the last card lands.
- Reduced motion maps `normal` → `fast` (never `off`) and disables `WinCascade`. Only the Animation: Off setting makes the finish instant.
- Keys: Space draws (not when focus is on a button/summary/link or a form control). Enter alone picks up and drops.
- Stats prefill: played 5561, won 4089, fastest 0:34, fewest moves 102, Draw 1 only. It can be imported once per device.
- Fonts are self-hosted (offline PWA). No other new runtime dependencies.
- Match the surrounding code style: terse comments only where the why is non-obvious, named exports, and immutable state.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning

- **Token names.** Spec §1 lists a token set. Existing names are kept where the spec reuses them (`--ink`, `--accent`, `--chrome-bg`, `--focus`, `--card-face`). The rest are renamed: `--ink-muted` → `--mute`, `--slot` → `--slot-line`, `--table-bg` → `--glow` over `--bg`. `--panel-bg`, `--panel-line` and `--accent-ink` are added because dialogs and buttons need them.
- **Foundation bounce fix scope.** Excluding the card only "for the same turn" (the spec's wording) would still bounce it on the player's *next* turn, for example a draw. So a card pulled off a foundation stays exempt from auto-play until it reaches a foundation again. This is derived from the turn history, so undo, redo and saved games need no new state. The spec's requirement ("a foundation → tableau move sticks, with auto-play on") is the binding one.
- **No foundation-bounce e2e.** The e2e hook plays turns with auto-play off and can't set up an arbitrary position. The session-level unit tests cover the behaviour instead.
- **No reset-stats button.** The spec says "Reset stats clears the marker", but no reset exists in v1. Nothing to change.
- **Toolbar buttons blur after a pointer click**, so a following Space press draws instead of re-pressing Undo, Hint and so on. Keyboard-activated buttons keep focus.

---

### Task 1: Foundation → tableau move sticks with auto-play on

**Files:**
- Modify: `src/engine/movegen.ts` (`nextSafeMove`, `applySafeMoves`)
- Create: `src/game/heldBack.ts`
- Modify: `src/game/session.ts` (`turn` case)
- Test: `tests/game/session.test.ts`, `tests/game/heldBack.test.ts`

**Interfaces:**
- Produces: `heldBackCards(start: GameState, turns: readonly Move[][]): Set<CardId>`, and `applySafeMoves(s, includeWaste?, hold?: ReadonlySet<CardId>)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game/session.test.ts`, inside the `describe('session', …)` block:

```ts
  it('keeps a card pulled off a foundation in the tableau when autoPlay is on', () => {
    // 5♥ is safe (both black foundations are at 4), so auto-play would send it straight back.
    const s = withState(
      makeState({ foundations: [upTo('S', 4), upTo('H', 5), upTo('D', 4), upTo('C', 4)], cols: [['KD 6S', 1], ['5D', 0]], stock: cards('9C') }),
    );
    const pull: Move = { type: 'move', from: 'F1', to: 'T0', count: 1 };
    const r = turn(s, [pull], true);
    // Other safe cards still auto-play in the same turn.
    expect(r.turns[0]).toEqual([pull, { type: 'move', from: 'T1', to: 'F2', count: 1 }]);
    expect(r.state.tableau[0].cards).toHaveLength(3);
    expect(r.state.foundations[1]).toHaveLength(4);
    // …and on later turns too.
    const r2 = turn(r, [draw], true);
    expect(r2.turns[1]).toEqual([draw]);
    expect(r2.state.tableau[0].cards).toHaveLength(3);
  });
```

Create `tests/game/heldBack.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { heldBackCards } from '../../src/game/heldBack';
import type { Move } from '../../src/engine/types';
import { c, makeState, upTo } from '../helpers';

const start = makeState({ foundations: [upTo('S', 4), upTo('H', 5), upTo('D', 4), upTo('C', 4)], cols: [['KD 6S', 1]] });
const down: Move = { type: 'move', from: 'F1', to: 'T0', count: 1 };
const up: Move = { type: 'move', from: 'T0', to: 'F1', count: 1 };

describe('heldBackCards', () => {
  it('holds a card taken off a foundation', () => {
    expect(heldBackCards(start, [[down]])).toEqual(new Set([c('5H')]));
  });
  it('releases it once it is back on a foundation', () => {
    expect(heldBackCards(start, [[down], [up]])).toEqual(new Set());
  });
  it('is empty with no turns', () => {
    expect(heldBackCards(start, [])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/game`
Expected: `session.test.ts` fails. `turns[0]` has the extra `F1` auto-move back, and the foundation length is 5. `heldBack.test.ts` fails because the module is missing.

- [ ] **Step 3: Implement**

In `src/engine/movegen.ts`, add a `hold` parameter:

```ts
export function nextSafeMove(s: GameState, includeWaste = true, hold?: ReadonlySet<CardId>): Move | null {
  const sources: [PileId, CardId | undefined][] = [];
  if (includeWaste) sources.push(['W', s.waste[s.waste.length - 1]]);
  s.tableau.forEach((col, i) => sources.push([`T${i}`, col.cards[col.cards.length - 1]]));
  for (const [from, card] of sources) {
    if (card === undefined || hold?.has(card)) continue;
    if (canPlayToFoundation(s, card) && isSafeToFoundation(s, card)) {
      return { type: 'move', from, to: `F${suitIndex(card)}`, count: 1 };
    }
  }
  return null;
}
```

Then, in `applySafeMoves`, add the parameter and pass it through:

```ts
export function applySafeMoves(s: GameState, includeWaste = true, hold?: ReadonlySet<CardId>): { state: GameState; moves: Move[] } {
  const moves: Move[] = [];
  let cur = s;
  for (let m = nextSafeMove(cur, includeWaste, hold); m; m = nextSafeMove(cur, includeWaste, hold)) {
```

Create `src/game/heldBack.ts`:

```ts
import { applyMove } from '../engine/apply';
import type { CardId } from '../engine/cards';
import type { GameState, Move } from '../engine/types';

/**
 * Cards the player took off a foundation that haven't gone back up since. Auto-play leaves them alone so a card
 * pulled down to build on actually stays down. Derived from the turn history, so undo/redo/restore need no extra state.
 */
export function heldBackCards(start: GameState, turns: readonly Move[][]): Set<CardId> {
  const held = new Set<CardId>();
  let s = start;
  for (const turn of turns) {
    for (const m of turn) {
      const next = applyMove(s, m);
      if (m.type === 'move' && m.from[0] === 'F') {
        const f = s.foundations[Number(m.from.slice(1))];
        held.add(f[f.length - 1]);
      }
      if (m.type === 'move' && m.to[0] === 'F') {
        const f = next.foundations[Number(m.to.slice(1))];
        held.delete(f[f.length - 1]);
      }
      s = next;
    }
  }
  return held;
}
```

In `src/game/session.ts`, add `import { heldBackCards } from './heldBack';` and change the `turn` case:

```ts
    case 'turn': {
      if (s.status !== 'playing' || a.moves.length === 0) return s;
      const played = tryApply(s.state, a.moves);
      if (!played) return s;
      const hold = a.autoPlay ? heldBackCards(s.history[0] ?? s.state, [...s.turns, a.moves]) : undefined;
      const auto = a.autoPlay ? applySafeMoves(played, true, hold).moves : [];
      const r = commit(s, [...a.moves, ...auto], a.now);
      return r === s ? s : { ...r, redo: [] };
    }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/movegen.ts src/game/heldBack.ts src/game/session.ts tests/game/session.test.ts tests/game/heldBack.test.ts
git commit -m "fix(game): a card pulled off a foundation stays down with auto-play on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: New card face (HTML/CSS) and canvas painter; remove the SVG decks

**Files:**
- Create: `src/ui/cards/suits.ts` (moves `SUIT_PATHS` here), `src/ui/cards/paint.ts`
- Rewrite: `src/ui/CardFront.tsx`
- Modify: `src/ui/Card.tsx`, `src/ui/Table.tsx`, `src/ui/WinCascade.tsx`, `src/styles/table.css`, `package.json`
- Delete: `src/ui/cards/minimal.ts`, `public/cards/` (whole directory), `scripts/vendor-cards.ts`, `tests/ui/cards.test.ts`
- Test: `tests/ui/cardFront.test.ts`

**Interfaces:**
- Produces:
  - `SUIT_PATHS: Record<Suit, string>` from `src/ui/cards/suits.ts`.
  - `CardFront({ id }: { id: CardId })`.
  - `paintFace(ctx: CanvasRenderingContext2D, id: CardId, w: number, h: number, pal: FacePalette): void`.
  - `interface FacePalette { face: string; S: string; H: string; D: string; C: string; font: string }`.
  - `Card` no longer takes a `theme` prop. `WinCascade` props become `{ layout; onDone }`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/cardFront.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rankLabel, suitOf } from '../../src/engine/cards';
import { CardFront } from '../../src/ui/CardFront';
import { SUIT_PATHS } from '../../src/ui/cards/suits';

describe('CardFront', () => {
  it('renders the rank, a suit class and two suit glyphs for every card', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 52; id++) {
      const html = renderToStaticMarkup(createElement(CardFront, { id }));
      expect(html).toContain(`class="face suit-${suitOf(id)}"`);
      expect(html).toContain(`>${rankLabel(id)}</span>`);
      expect(html.split(SUIT_PATHS[suitOf(id)]).length - 1).toBe(2); // index suit + big pip
      seen.add(html);
    }
    expect(seen.size).toBe(52);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/ui/cardFront.test.ts`
Expected: FAIL (`src/ui/cards/suits` not found).

- [ ] **Step 3: Implement**

Create `src/ui/cards/suits.ts`. Copy the `circle` helper and the `SUIT_PATHS` object verbatim from `src/ui/cards/minimal.ts`, with its doc comment:

```ts
import type { Suit } from '../../engine/cards';

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Suit shapes drawn in a 100×100 box. */
export const SUIT_PATHS: Record<Suit, string> = {
  S: 'M50 2C62 24 98 42 98 66C98 80 87 89 75 89C66 89 58 85 54 78C55 88 59 95 67 100H33C41 95 45 88 46 78C42 85 34 89 25 89C13 89 2 80 2 66C2 42 38 24 50 2Z',
  H: 'M50 94C22 72 2 54 2 30C2 14 14 3 28 3C38 3 46 9 50 18C54 9 62 3 72 3C86 3 98 14 98 30C98 54 78 72 50 94Z',
  D: 'M50 2L90 50L50 98L10 50Z',
  C: `${circle(50, 27, 21)}${circle(27, 58, 21)}${circle(73, 58, 21)}M44 54H56C56 76 60 88 70 100H30C40 88 44 76 44 54Z`,
};
```

Rewrite `src/ui/CardFront.tsx`:

```tsx
import { memo } from 'react';
import { rankLabel, suitOf, type CardId } from '../engine/cards';
import { SUIT_PATHS } from './cards/suits';

const Glyph = ({ d, className }: { d: string; className: string }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** Corner index (rank over suit) where a fanned column leaves it visible, plus one big pip bottom-right. */
export const CardFront = memo(function CardFront({ id }: { id: CardId }) {
  const suit = suitOf(id);
  return (
    <div className={`face suit-${suit}`}>
      <span className="face-index">
        <span className="face-rank">{rankLabel(id)}</span>
        <Glyph d={SUIT_PATHS[suit]} className="face-suit" />
      </span>
      <Glyph d={SUIT_PATHS[suit]} className="face-pip" />
    </div>
  );
});
```

Create `src/ui/cards/paint.ts`:

```ts
import { rankLabel, suitOf, type CardId } from '../../engine/cards';
import { SUIT_PATHS } from './suits';

export interface FacePalette {
  face: string;
  S: string;
  H: string;
  D: string;
  C: string;
  font: string;
}

const paths = new Map<string, Path2D>();
const suitPath = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

function glyph(ctx: CanvasRenderingContext2D, d: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.fill(suitPath(d));
  ctx.restore();
}

/** Canvas twin of CardFront (same proportions as the .face CSS), used by the win cascade. */
export function paintFace(ctx: CanvasRenderingContext2D, id: CardId, w: number, h: number, pal: FacePalette): void {
  const suit = suitOf(id);
  ctx.fillStyle = pal.face;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.055);
  ctx.fill();
  ctx.fillStyle = pal[suit];
  const cx = w * 0.08 + w * 0.14; // centre of the index column
  ctx.font = `600 ${w * 0.28}px ${pal.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(rankLabel(id), cx, h * 0.06);
  glyph(ctx, SUIT_PATHS[suit], cx - w * 0.095, h * 0.06 + w * 0.3, w * 0.19);
  glyph(ctx, SUIT_PATHS[suit], w * 0.92 - w * 0.47, h * 0.94 - w * 0.47, w * 0.47);
}
```

In `src/ui/Card.tsx`:
- Remove the `Theme` import and the `theme: Theme;` prop.
- Render `<CardFront id={p.id} />` (no `theme` or `fourColor` props, since colours come from CSS variables).
- Remove `fourColor` from `CardProps` and the JSX too.

In `src/ui/Table.tsx`:
- Change `import { SUIT_PATHS } from './cards/minimal';` to `import { SUIT_PATHS } from './cards/suits';`.
- Remove the `theme=` and `fourColor=` props on `<Card>`.
- Render `<WinCascade layout={layout} onDone={() => p.onCelebrated?.()} />`.

In `src/ui/WinCascade.tsx`:
- Replace the imports of `Theme`, `classicCardUrl`, `minimalCardSvg` and `Palette` with `import { paintFace, type FacePalette } from './cards/paint';`.
- Change the props to `{ layout: Layout; onDone(): void }`.
- Replace the image-loading block (from `const css = getComputedStyle(canvas);` through the `for` loop that fills `images`) with pre-rendered canvases:

```ts
    const css = getComputedStyle(canvas);
    const v = (name: string) => css.getPropertyValue(name).trim() || '#000';
    const pal: FacePalette = { S: v('--suit-S'), H: v('--suit-H'), D: v('--suit-D'), C: v('--suit-C'), face: v('--card-face'), font: v('--font-ui') || 'sans-serif' };
    const images = new Map<CardId, HTMLCanvasElement>();
    for (let id = 0; id < 52; id++) {
      const c = document.createElement('canvas');
      c.width = Math.round(layout.cardW * dpr);
      c.height = Math.round(layout.cardH * dpr);
      const cc = c.getContext('2d');
      if (cc) {
        cc.scale(dpr, dpr);
        paintFace(cc, id, layout.cardW, layout.cardH, pal);
      }
      images.set(id, c);
    }
```

Then, in the draw loop, replace `if (img.complete && img.naturalWidth) ctx.drawImage(…)` with `ctx.drawImage(img, p.x, p.y, layout.cardW, layout.cardH);`.

In `src/styles/table.css`:
- Delete the `.theme-classic .card-back` rule, the `.card-img` rules and the `.card-svg` selectors.
- Change `.theme-minimal .card-back` to the plain selector `.card-back`, so every card keeps a back until Task 3.
- Add:

```css
.face { position: absolute; inset: 0; color: var(--suit-color); font-family: var(--font-ui, system-ui, sans-serif); font-weight: 600; line-height: 1; }
.face.suit-S { --suit-color: var(--suit-S); }
.face.suit-H { --suit-color: var(--suit-H); }
.face.suit-D { --suit-color: var(--suit-D); }
.face.suit-C { --suit-color: var(--suit-C); }
.face-index { position: absolute; top: 6%; left: 8%; width: calc(var(--card-w) * 0.28); display: flex; flex-direction: column; align-items: center; gap: calc(var(--card-w) * 0.02); }
.face-rank { font-size: calc(var(--card-w) * 0.28); letter-spacing: -0.04em; white-space: nowrap; }
.face-suit { width: calc(var(--card-w) * 0.19); height: calc(var(--card-w) * 0.19); fill: currentColor; }
.face-pip { position: absolute; right: 8%; bottom: 6%; width: calc(var(--card-w) * 0.47); height: calc(var(--card-w) * 0.47); fill: currentColor; }
```

Remove the old decks and anything that references them:

```bash
git rm -r -q public/cards scripts/vendor-cards.ts src/ui/cards/minimal.ts tests/ui/cards.test.ts
```

In `package.json`, delete the `"cards": "tsx scripts/vendor-cards.ts"` script line. Then run `grep -rn "Kennard\|CC0\|/cards/\|minimal'" src index.html public vite.config.ts` and remove each hit. (Deck attribution copy and stale imports: the grep must come back empty.)

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass and there are no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A src/ui src/styles/table.css package.json tests/ui
git commit -m "feat(ui): corner-and-pip HTML card face; drop the SVG decks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Three tables and card backs (settings v2, tokens, Settings UI)

**Files:**
- Modify: `src/store/settings.ts`, `src/ui/appClass.ts`, `src/styles/themes.css` (rewrite), `src/styles/table.css`, `src/styles/chrome.css`, `src/ui/dialogs/SettingsDialog.tsx`, `src/App.tsx`, `index.html`, `vite.config.ts`
- Test: `tests/store/store.test.ts`, `tests/ui/appClass.test.ts`

**Interfaces:**
- Consumes: `CardFront` from Task 2 (its colours come from CSS variables).
- Produces:
  - `type TableTheme = 'studio' | 'felt' | 'paper'`, `type CardBack = 'amber' | 'ink' | 'oxblood' | 'navy'`, `TABLES`, `CARD_BACKS`.
  - `Settings.table`, `Settings.cardBack`. `Settings.theme` and `Settings.colorMode` are removed.
  - `parseSettings(raw: unknown, prefersLight?: boolean): Settings`.
  - `TABLE_BASE: Record<TableTheme, string>` in `appClass.ts`.
  - `appClassName` emits `table-<t>` and `back-<b>` classes.

- [ ] **Step 1: Write the failing tests**

In `tests/store/store.test.ts`, replace the `'defaults garbage and keeps valid fields'` test and add the migration cases:

```ts
  it('defaults garbage and keeps valid fields', () => {
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ drawCount: 3, scoring: 'bogus', sound: false, table: 'felt', cardBack: 'navy' })).toEqual({
      ...DEFAULT_SETTINGS,
      drawCount: 3,
      sound: false,
      table: 'felt',
      cardBack: 'navy',
    });
    expect(DEFAULT_SETTINGS.table).toBe('studio');
    expect(DEFAULT_SETTINGS.cardBack).toBe('amber');
  });
  it.each([
    [{ theme: 'classic' }, false, 'felt'],
    [{ theme: 'minimal', colorMode: 'light' }, false, 'paper'],
    [{ theme: 'minimal', colorMode: 'dark' }, true, 'studio'],
    [{ theme: 'minimal', colorMode: 'auto' }, true, 'paper'],
    [{ theme: 'minimal', colorMode: 'auto' }, false, 'studio'],
    [{}, true, 'studio'],
  ])('migrates v1 %o (prefers light: %s) to the %s table', (raw, light, table) => {
    expect(parseSettings(raw, light).table).toBe(table);
    expect(parseSettings(raw, light)).not.toHaveProperty('theme');
  });
  it('saves the migrated settings once on load', () => {
    writeJSON(KEYS.settings, { theme: 'classic', sound: false });
    expect(loadSettings().table).toBe('felt');
    expect(readJSON(KEYS.settings)).toMatchObject({ table: 'felt', sound: false });
  });
```

Create `tests/ui/appClass.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appClassName } from '../../src/ui/appClass';
import { DEFAULT_SETTINGS } from '../../src/store/settings';

describe('appClassName', () => {
  it('carries the table and card back', () => {
    const cls = appClassName({ ...DEFAULT_SETTINGS, table: 'paper', cardBack: 'ink', fourColor: true }).split(' ');
    expect(cls).toEqual(expect.arrayContaining(['app', 'table-paper', 'back-ink', 'four-color']));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/store tests/ui/appClass.test.ts`
Expected: FAIL (`table` is undefined).

- [ ] **Step 3: Implement settings**

In `src/store/settings.ts`:
- Replace the `Theme` and `ColorMode` types, and the `theme`/`colorMode` fields, in the interface, the defaults and `parseSettings`.
- Add `table` and `cardBack` to the `Settings` interface and to `DEFAULT_SETTINGS` (`table: 'studio'`, `cardBack: 'amber'`).
- Add:

```ts
export type TableTheme = 'studio' | 'felt' | 'paper';
export type CardBack = 'amber' | 'ink' | 'oxblood' | 'navy';
export const TABLES: readonly TableTheme[] = ['studio', 'felt', 'paper'];
export const CARD_BACKS: readonly CardBack[] = ['amber', 'ink', 'oxblood', 'navy'];
```

```ts
/** v1 stored theme + colorMode; map them onto a table (only used when no `table` is stored yet). */
function migrateTable(r: Record<string, unknown>, prefersLight: boolean): TableTheme {
  if (r.theme === 'classic') return 'felt';
  if (r.theme === 'minimal') {
    if (r.colorMode === 'light') return 'paper';
    if (r.colorMode === 'dark') return 'studio';
    return prefersLight ? 'paper' : 'studio';
  }
  return DEFAULT_SETTINGS.table;
}
```

`parseSettings` gains a second parameter, `prefersLight = false`. It drops the `theme` and `colorMode` lines and adds:

```ts
    table: oneOf(r.table, TABLES, migrateTable(r, prefersLight)),
    cardBack: oneOf(r.cardBack, CARD_BACKS, d.cardBack),
```

Replace `loadSettings`:

```ts
const prefersLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;

export function loadSettings(): Settings {
  const raw = readJSON(KEYS.settings);
  const s = parseSettings(raw, prefersLight());
  if (raw !== null && asRecord(raw).table === undefined) saveSettings(s); // persist the one-time v1 migration
  return s;
}
```

(`saveSettings` is declared below `loadSettings` as a `const`. Hoist it above `loadSettings`, or make it a `function` declaration.)

- [ ] **Step 4: Implement classes, tokens and styles**

In `src/ui/appClass.ts`, replace `appClassName`:

```ts
import type { Settings, TableTheme } from '../store/settings';

/** Base colour of each table, for <meta name="theme-color">. */
export const TABLE_BASE: Record<TableTheme, string> = { studio: '#131110', felt: '#0c241b', paper: '#e9e6e0' };

export function appClassName(s: Settings): string {
  return [
    'app',
    `table-${s.table}`,
    `back-${s.cardBack}`,
    `anim-${effectiveAnimation(s)}`,
    s.fourColor ? 'four-color' : '',
    s.leftHanded ? 'left-handed' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
```

Rewrite `src/styles/themes.css` completely:

```css
.app {
  --ease: cubic-bezier(0.32, 0.72, 0, 1);
  --move-ms: 240ms;
  --flip-ms: 140ms;
  --font-ui: 'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
  --suit-S: #1c1a17;
  --suit-C: #1c1a17;
  --suit-H: #c2412d;
  --suit-D: #c2412d;
  --card-face: #f7f3ec;
  --card-shadow: 0 1px 0 #ffffffb3 inset, 0 1px 2px #0000004d, 0 4px 12px #00000040;
  --card-shadow-lift: 0 1px 0 #ffffffb3 inset, 0 18px 40px #00000066, 0 4px 10px #00000040;
  background: var(--glow), var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
}

/* Studio: warm charcoal, lukeghanna.com dark. */
.table-studio {
  --bg: #131110;
  --glow: radial-gradient(120% 70% at 50% -10%, #2a2118 0%, #151210 55%, transparent 100%);
  --chrome-bg: linear-gradient(170deg, #ffffff12, #ffffff05);
  --chrome-line: #ffffff14;
  --panel-bg: #1c1916f2;
  --panel-line: #ffffff14;
  --ink: #f0ebe3;
  --mute: #a39d93;
  --accent: #f2c14e;
  --accent-soft: #f2c14e1f;
  --accent-ink: #1c1a17;
  --slot-line: #ffffff14;
  --slot-fill: #ffffff06;
  --slot-glyph: #ffffff22;
  --focus: #f2c14e;
}

/* Felt: the classic green, modern cards. */
.table-felt {
  --bg: #0c241b;
  --glow: radial-gradient(110% 80% at 50% 0%, #1d4a36 0%, #123326 55%, transparent 100%);
  --chrome-bg: #0000002e;
  --chrome-line: #ffffff12;
  --panel-bg: #10281ef2;
  --panel-line: #ffffff14;
  --ink: #eef3ef;
  --mute: #9fb5aa;
  --accent: #e9dcb8;
  --accent-soft: #e9dcb81f;
  --accent-ink: #16211c;
  --slot-line: #ffffff1c;
  --slot-fill: #0000001a;
  --slot-glyph: #ffffff26;
  --focus: #e9dcb8;
  --card-face: #fbfaf7;
}

/* Paper: lukeghanna.com light. */
.table-paper {
  --bg: #e9e6e0;
  --glow: radial-gradient(120% 80% at 50% 0%, #f5f2ec 0%, transparent 100%);
  --chrome-bg: #ffffff80;
  --chrome-line: #0000000f;
  --panel-bg: #f7f5f0f2;
  --panel-line: #00000014;
  --ink: #151412;
  --mute: #6b675f;
  --accent: #7a5a00;
  --accent-soft: #7a5a0018;
  --accent-ink: #ffffff;
  --slot-line: #00000022;
  --slot-fill: transparent;
  --slot-glyph: #00000020;
  --focus: #7a5a00;
  --card-face: #ffffff;
  --card-shadow: 0 1px 0 #0000000a, 0 8px 18px #00000014, 0 1px 3px #00000014;
  --card-shadow-lift: 0 18px 36px #00000026, 0 3px 8px #0000001a;
}

.four-color { --suit-D: #1565c0; --suit-C: #2e7d32; }

.back-amber { --back: linear-gradient(160deg, #3a2d1f, #241b13); --back-frame: #f2c14e33; --back-pattern: repeating-linear-gradient(45deg, #f2c14e10 0 2px, transparent 2px 7px); }
.back-ink { --back: #1f1d1a; --back-frame: #ffffff18; --back-pattern: radial-gradient(circle, #f2c14e55 0 4px, transparent 5px); }
.back-oxblood { --back: linear-gradient(160deg, #7b2a26, #531a18); --back-frame: #ffffff30; --back-pattern: repeating-linear-gradient(0deg, #ffffff0a 0 1px, transparent 1px 4px); }
.back-navy { --back: linear-gradient(160deg, #22324a, #141e2e); --back-frame: #9fb6d633; --back-pattern: repeating-linear-gradient(-45deg, #9fb6d614 0 1px, transparent 1px 6px), repeating-linear-gradient(45deg, #9fb6d614 0 1px, transparent 1px 6px); }

.anim-fast { --move-ms: 130ms; --flip-ms: 90ms; }
.anim-off { --move-ms: 0ms; --flip-ms: 0ms; }
```

In `src/styles/table.css`:
- Change every `border-radius: calc(var(--card-w) * 0.07)` to `calc(var(--card-w) * 0.055)`. That's `.slot`, `.card` and `.hint-target`.
- `.slot`: `border: 1px solid var(--slot-line); background: var(--slot-fill); color: var(--slot-glyph);`
- `.slot-icon`: `color: var(--mute);`
- `.slot-suit`: `fill: var(--slot-glyph);`
- In the `.card-front, .card-back` rule: `box-shadow: var(--card-shadow);`
- `.card.dragging .card-front`: `box-shadow: var(--card-shadow-lift);`
- `.card.selected .card-front` and the hint/focus rules: use `var(--focus)` instead of `var(--accent)`.
- Replace the `.card-back` background rule with:

```css
.card-back { transform: rotateY(180deg); background: var(--back); }
.card-back::after {
  content: '';
  position: absolute;
  inset: calc(var(--card-w) * 0.083);
  border-radius: calc(var(--card-w) * 0.03);
  border: 1px solid var(--back-frame);
  background: var(--back-pattern);
}
```

(Task 5 replaces the 3D flip, so the `rotateY` stays for now.)

In `src/styles/chrome.css`, make these mechanical token swaps across the file:

| Find | Replace with |
|---|---|
| `var(--ink-muted)` | `var(--mute)` |
| `var(--panel-ink)` | `var(--ink)` |
| `var(--panel-muted)` | `var(--mute)` |
| `#1f6f45` in background and border colours | `var(--accent)`, with `color: var(--accent-ink)` in the same rules |
| `accent-color: #1f6f45` | `accent-color: var(--accent)` |

Also delete the `.theme-minimal .tb-btn:hover` rule, and change `.tb-btn:hover:not(:disabled)` to `background: color-mix(in srgb, var(--ink) 10%, transparent);`. (Task 4 rewrites this file fully; this step only keeps it working.)

- [ ] **Step 5: Settings UI, the meta theme colour, and the manifest**

In `src/ui/dialogs/SettingsDialog.tsx`, replace the Theme and Appearance `Segmented` controls with:

```tsx
      <Segmented label="Table" value={s.table} options={[['studio', 'Studio'], ['felt', 'Felt'], ['paper', 'Paper']]} onChange={(table) => onChange({ table })} />
      <Segmented
        label="Card back"
        value={s.cardBack}
        options={[['amber', 'Amber'], ['ink', 'Ink'], ['oxblood', 'Oxblood'], ['navy', 'Navy']]}
        onChange={(cardBack) => onChange({ cardBack })}
      />
```

In `src/App.tsx`, import `TABLE_BASE` from `./ui/appClass` and add this after the other effects:

```ts
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TABLE_BASE[settings.table]);
  }, [settings.table]);
```

In `index.html`, change `<meta name="theme-color" content="#0f5132" />` to `#131110`. In `vite.config.ts`, change `theme_color` and `background_color` to `'#131110'`.

- [ ] **Step 6: Run the tests, typecheck and e2e**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass. The e2e specs don't reference themes.

- [ ] **Step 7: Commit**

```bash
git add -A src index.html vite.config.ts tests
git commit -m "feat(ui): Studio, Felt and Paper tables with selectable card backs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Premium chrome: Geist, glass top bar, readout, table switch, dialogs

**Files:**
- Modify: `package.json` (dependencies), `src/main.tsx`, `vite.config.ts` (workbox globs), `src/styles/global.css`, `src/styles/chrome.css` (rewrite), `src/ui/Toolbar.tsx`, `src/App.tsx`
- Create: `src/ui/Readout.tsx`, `src/ui/TableSwitch.tsx`
- Delete: `src/ui/StatusBar.tsx`
- Test: `e2e/game.spec.ts` (new table-switch test)

**Interfaces:**
- Consumes: `TableTheme`, `TABLES` (Task 3).
- Produces:
  - `Readout({ session, settings, vegasBank })`, which keeps `data-testid="timer"`.
  - `TableSwitch({ value, onChange })`.
  - `ToolbarProps` gains `readout: ReactNode; table: TableTheme; onTable(t: TableTheme): void`.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/game.spec.ts`:

```ts
test('the table switch changes the look and persists across reload', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await expect(page.locator('.app')).toHaveClass(/table-studio/);
  await page.getByRole('radio', { name: 'Paper table' }).click();
  await expect(page.locator('.app')).toHaveClass(/table-paper/);
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  await expect(page.locator('.app')).toHaveClass(/table-paper/);
  await expect(page.getByRole('radio', { name: 'Paper table' })).toHaveAttribute('aria-checked', 'true');
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test -g "table switch"`
Expected: FAIL (no radio named "Paper table").

- [ ] **Step 3: Fonts**

Run: `npm i @fontsource-variable/geist @fontsource-variable/geist-mono`

At the top of the CSS imports in `src/main.tsx`, add:

```ts
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
```

In `vite.config.ts`, change `globPatterns` to `['**/*.{js,css,html,svg,png,ico,json,webmanifest,woff2}']`.

In `src/styles/global.css`, change the `body` `font-family` to `'Geist Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;`.

- [ ] **Step 4: Components**

Create `src/ui/Readout.tsx`. It carries over `StatusBar`'s logic: same score, Vegas tag and timer testid, in the new mono style.

```tsx
import type { Session } from '../game/session';
import { elapsed } from '../game/timer';
import type { Settings } from '../store/settings';
import { formatScore, formatTime } from './format';
import { useNow } from './useNow';

export function Readout({ session, settings, vegasBank }: { session: Session; settings: Settings; vegasBank: number }) {
  const now = useNow(session.timer.runningSince !== null ? 1000 : null);
  const score = formatScore(session, settings, vegasBank);
  return (
    <div className="readout">
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
        <b data-testid="timer" aria-label="Time">{formatTime(elapsed(session.timer, now))}</b>
      </span>
      <span className="pill">Draw {session.drawCount}</span>
    </div>
  );
}
```

Create `src/ui/TableSwitch.tsx`:

```tsx
import { TABLES, type TableTheme } from '../store/settings';

const NAMES: Record<TableTheme, string> = { studio: 'Studio', felt: 'Felt', paper: 'Paper' };

export function TableSwitch({ value, onChange }: { value: TableTheme; onChange(t: TableTheme): void }) {
  return (
    <div className="table-switch" role="radiogroup" aria-label="Table">
      {TABLES.map((t) => (
        <button
          type="button"
          key={t}
          role="radio"
          aria-checked={value === t}
          aria-label={`${NAMES[t]} table`}
          title={NAMES[t]}
          className={`swatch swatch-${t}`}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}
```

In `src/ui/Toolbar.tsx`:
- Add `readout: ReactNode; table: TableTheme; onTable(t: TableTheme): void;` to `ToolbarProps`, importing `ReactNode` from react and `TableTheme` from `../store/settings`.
- Insert `<span className="wordmark">Solitaire</span>` as the first child of the header.
- Replace `<span className="tb-spacer" />` with:

```tsx
      <span className="tb-spacer" />
      {p.readout}
      <TableSwitch value={p.table} onChange={p.onTable} />
```

In `src/App.tsx`:
- Delete the `StatusBar` import and its `<StatusBar … />` element.
- Import `Readout`.
- Pass these to `<Toolbar>`:

```tsx
        readout={<Readout session={session} settings={settings} vegasBank={stats.vegasBank} />}
        table={settings.table}
        onTable={(table) => game.updateSettings({ table })}
```

Then run `git rm src/ui/StatusBar.tsx`.

- [ ] **Step 5: Rewrite `src/styles/chrome.css`**

```css
.toolbar {
  position: relative;
  z-index: 5000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-height: 52px;
  padding: 6px 10px;
  background: var(--chrome-bg);
  border-bottom: 1px solid var(--chrome-line);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
.wordmark { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; margin: 0 10px 0 4px; }
.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  opacity: 0.82;
  cursor: pointer;
  list-style: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background-color 160ms var(--ease), opacity 160ms var(--ease);
}
.tb-btn svg { width: 17px; height: 17px; }
.tb-btn::-webkit-details-marker { display: none; }
.tb-btn:hover:not(:disabled) { opacity: 1; background: color-mix(in srgb, var(--ink) 8%, transparent); }
.tb-btn:disabled { opacity: 0.35; cursor: default; }
.tb-btn:focus-visible, .swatch:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.tb-spacer { flex: 1; }

.readout {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--mute);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.readout b { color: var(--ink); font-weight: 500; margin-left: 4px; }
.readout .pill { padding: 3px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.readout .tag { margin-left: 6px; padding: 1px 6px; border-radius: 6px; border: 1px solid currentColor; font-size: 10px; }

.table-switch { display: inline-flex; gap: 6px; padding: 4px 6px; margin-right: 4px; border-radius: 999px; border: 1px solid var(--chrome-line); }
.swatch { width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid #ffffff33; cursor: pointer; }
.swatch-studio { background: radial-gradient(circle at 35% 30%, #3a2d1f, #131110); }
.swatch-felt { background: radial-gradient(circle at 35% 30%, #2a6a4c, #0c241b); }
.swatch-paper { background: radial-gradient(circle at 35% 30%, #ffffff, #e2ded6); border-color: #00000026; }
.swatch[aria-checked='true'] { box-shadow: 0 0 0 2px var(--bg), 0 0 0 3.5px var(--accent); }

.menu { position: relative; }
.menu-pop,
.modal-card {
  background: var(--panel-bg);
  color: var(--ink);
  border: 1px solid var(--panel-line);
  box-shadow: 0 30px 80px #00000047, 0 1px 0 #ffffff14 inset;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
}
.menu-pop { position: absolute; top: calc(100% + 8px); left: 0; min-width: 200px; padding: 6px; border-radius: 12px; display: flex; flex-direction: column; }
.menu-pop button { text-align: left; padding: 9px 12px; border: 0; border-radius: 8px; background: none; color: inherit; cursor: pointer; font-size: 14px; }
.menu-pop button:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.menu-pop button[aria-checked='true']::after { content: ' ✓'; color: var(--accent); }
.menu-pop hr { border: 0; border-top: 1px solid var(--panel-line); margin: 4px 0; width: 100%; }

.modal { border: 0; padding: 0; background: transparent; color: var(--ink); max-width: min(440px, calc(100vw - 32px)); width: 100%; }
.modal::backdrop { background: #0000006b; }
.modal-card { border-radius: 16px; padding: 22px; max-height: calc(100dvh - 48px); overflow: auto; }
.modal[open] .modal-card { animation: sheet-in 220ms var(--ease); }
@keyframes sheet-in { from { opacity: 0; transform: translateY(8px); } }
.modal h2 { margin: 0 0 14px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.modal-body { display: flex; flex-direction: column; gap: 16px; }
.modal-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.modal-actions button, .seg-row button {
  min-height: 38px;
  padding: 8px 14px;
  border-radius: 9px;
  border: 1px solid var(--panel-line);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}
.modal-actions .primary, .seg-row button[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.seg { border: 0; margin: 0; padding: 0; }
.seg legend, .label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  margin-bottom: 8px;
  padding: 0;
}
.seg-row { display: flex; flex-wrap: wrap; gap: 6px; }
.toggle { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: 14px; }
.toggle input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); }
.toggle small { display: block; color: var(--mute); font-size: 12px; margin-top: 2px; }
.note { margin: 0; font-size: 13px; color: var(--mute); }
.stats { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 13px; font-variant-numeric: tabular-nums; }
.stats th, .stats td { padding: 9px 6px; border-bottom: 1px solid var(--panel-line); text-align: right; }
.stats thead th { font-family: var(--font-ui); font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mute); }
.stats th[scope='row'] { text-align: left; font-family: var(--font-ui); font-weight: 400; color: var(--mute); }
.result div { background: color-mix(in srgb, var(--ink) 6%, transparent); border: 1px solid var(--panel-line); }
.result dt { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mute); }
.result dd { font-family: var(--font-mono); font-weight: 500; }

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  transform: translate(-50%, 12px);
  opacity: 0;
  pointer-events: none;
  background: var(--panel-bg);
  color: var(--ink);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13.5px;
  box-shadow: 0 12px 32px #00000033;
  transition: opacity 200ms var(--ease), transform 200ms var(--ease);
  z-index: 6000;
}
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) {
  .wordmark, .tb-label { display: none; }
  .tb-btn { padding: 8px; }
  .readout { order: 10; width: 100%; justify-content: center; margin: 2px 0 0; padding-top: 6px; border-top: 1px solid var(--chrome-line); }
}
```

Then remove the old `.result div` background/radius and `.result dt/dd` colour declarations from `src/styles/table.css`, keeping its layout (grid, gap, padding, radius, font size and weight). The rules above now own colour and type.

- [ ] **Step 6: Run the tests, typecheck and e2e**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass, including the new table-switch test on both projects. If `layout fits the viewport` fails on Pixel 7 because the two-row top bar is taller, make sure it's the table (not the page) that shrinks. `.table-wrap` is `flex: 1; min-height: 0`, so it should.

- [ ] **Step 7: Commit**

```bash
git add -A package.json package-lock.json src vite.config.ts e2e
git commit -m "feat(ui): glass top bar with Geist, mono readout, table switch, restyled dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Motion: subtle flip, site easing, visible auto-finish

**Files:**
- Modify: `src/ui/appClass.ts`, `src/ui/useGame.ts`, `src/App.tsx`, `src/styles/table.css`, `src/styles/themes.css`
- Test: `tests/ui/appClass.test.ts`

**Interfaces:**
- Produces:
  - `effectiveAnimation(s): AnimationSpeed`, where reduced motion maps `normal` → `fast`.
  - `FINISH_STEP_MS`, `MOVE_MS` and `FLIP_MS` (all `Record<AnimationSpeed, number>`), exported from `appClass.ts`.
  - `celebrationAllowed(s): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/appClass.test.ts`:

```ts
import { afterEach, vi } from 'vitest';
import { celebrationAllowed, effectiveAnimation, FINISH_STEP_MS, FLIP_MS, MOVE_MS } from '../../src/ui/appClass';

const reduceMotion = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduced-motion') }));
afterEach(() => vi.unstubAllGlobals());

describe('animation', () => {
  it('uses the spec timings', () => {
    expect(FINISH_STEP_MS).toEqual({ normal: 110, fast: 70, off: 0 });
    expect(MOVE_MS).toEqual({ normal: 240, fast: 130, off: 0 });
    expect(FLIP_MS).toEqual({ normal: 140, fast: 90, off: 0 });
  });
  it('reduced motion speeds animation up but never turns the finish off', () => {
    reduceMotion(true);
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe('fast');
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'off' })).toBe('off');
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe(false);
  });
  it('without reduced motion the setting is used as-is', () => {
    reduceMotion(false);
    expect(effectiveAnimation({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe('normal');
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'normal' })).toBe(true);
    expect(celebrationAllowed({ ...DEFAULT_SETTINGS, animation: 'off' })).toBe(false);
  });
});
```

(Merge the new imports into the file's existing import lines rather than duplicating them.)

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/ui/appClass.test.ts`
Expected: FAIL (the exports are missing).

- [ ] **Step 3: Implement the timings**

In `src/ui/appClass.ts`:

```ts
import type { AnimationSpeed, Settings, TableTheme } from '../store/settings';

export const FINISH_STEP_MS: Record<AnimationSpeed, number> = { normal: 110, fast: 70, off: 0 };
export const MOVE_MS: Record<AnimationSpeed, number> = { normal: 240, fast: 130, off: 0 };
export const FLIP_MS: Record<AnimationSpeed, number> = { normal: 140, fast: 90, off: 0 };

/** Reduced motion shortens animation rather than removing it, so the auto-finish stays watchable; only the setting turns it off. */
export const effectiveAnimation = (s: Settings): AnimationSpeed =>
  prefersReducedMotion() && s.animation === 'normal' ? 'fast' : s.animation;

/** The bouncing-card cascade is pure decoration: skip it for Animation: Off and for reduced motion. */
export const celebrationAllowed = (s: Settings): boolean => s.animation !== 'off' && !prefersReducedMotion();
```

In `src/ui/useGame.ts`, delete the local `FINISH_STEP_MS` constant and import it from `./appClass`.

In `src/styles/themes.css`, delete the `--move-ms`/`--flip-ms` declarations and the `.anim-fast`/`.anim-off` rules. Timings now come from TypeScript. In `src/App.tsx`:
- Import `MOVE_MS`, `FLIP_MS` and `celebrationAllowed`.
- Compute `const anim = effectiveAnimation(settings);`.
- Give the root element `style={{ '--move-ms': `${MOVE_MS[anim]}ms`, '--flip-ms': `${FLIP_MS[anim]}ms` } as CSSProperties}`, importing `CSSProperties` from react.

- [ ] **Step 4: Celebrate after the last card lands**

In `src/App.tsx`:
- Add `const celebrateTimer = useRef<number | undefined>(undefined);`.
- Replace the won branch's `if (effectiveAnimation(settings) === 'off') setShowResult(true); else setCelebrate(true);` with:

```ts
      // Let the last auto-finish card land before the cascade or result dialog covers the table.
      const land = MOVE_MS[effectiveAnimation(settings)];
      window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = window.setTimeout(() => (celebrationAllowed(settings) ? setCelebrate(true) : setShowResult(true)), land + 60);
```

- In the `if (session.status !== 'won')` reset block, add `window.clearTimeout(celebrateTimer.current);`.

- [ ] **Step 5: Crossfade flip, easing and lift in `src/styles/table.css`**

Replace the `.card` transition, `.card-inner`, `.card:not(.faceup) .card-inner`, the `.card-front, .card-back` rule and the `.card-back` transform with:

```css
.card {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: calc(var(--card-w) * 0.055);
  transition: transform var(--move-ms) var(--ease);
  will-change: transform;
  cursor: pointer;
}
.card-inner { position: absolute; inset: 0; border-radius: inherit; }
.card-front,
.card-back {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  box-shadow: var(--card-shadow);
  transition: opacity var(--flip-ms) ease-out, transform var(--flip-ms) var(--ease), box-shadow 160ms var(--ease);
}
/* Flip: the face fades in over the back with a slight scale-up, no 3D turn. */
.card-front { background: var(--card-face); opacity: 0; transform: scale(0.96); }
.card.faceup .card-front { opacity: 1; transform: none; }
.card.faceup .card-back { opacity: 0; }
.card-back { background: var(--back); }
.card.dragging .card-front { box-shadow: var(--card-shadow-lift); transform: scale(1.03); }
```

Delete the `.card-back { transform: rotateY(180deg); … }` variant from Task 3, keeping only the `background` and `::after` rules. Also change the `@media (prefers-reduced-motion: reduce)` block to keep only the hint rule: `.card.hinted .card-front, .hint-target { animation: none; }`. Motion is now handled by `effectiveAnimation`.

- [ ] **Step 6: Run the tests, typecheck and e2e**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass. The `Escape skips the win cascade` e2e runs with `animation: 'normal'` and still sees the canvas, because Playwright doesn't emulate reduced motion by default.

- [ ] **Step 7: Commit**

```bash
git add -A src tests
git commit -m "feat(ui): crossfade flip, site easing, card-by-card auto-finish that lands before the win

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Space draws; Enter picks up and drops; keyboard help

**Files:**
- Modify: `src/ui/useKeyboard.ts`, `src/ui/Toolbar.tsx`, `src/ui/dialogs/SettingsDialog.tsx`
- Test: `e2e/game.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/game.spec.ts`:

```ts
test('Space draws from the stock, even right after clicking a toolbar button', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.locator('.table').focus();
  await page.keyboard.press(' ');
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(0);
  await page.keyboard.press(' ');
  await expect.poll(() => pileCount(page, 'W')).toBe(1); // drew again, did not re-press Undo
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test -g "Space draws"`
Expected: FAIL. Space currently focuses or picks a card, and after the click it re-presses Undo.

- [ ] **Step 3: Implement**

In `src/ui/useKeyboard.ts`, add this directly after the `if (onControl) return;` line:

```ts
      if (key === ' ') {
        e.preventDefault(); // no page scroll
        return e.repeat ? undefined : onStockTap();
      }
```

Then change `if (key === 'Enter' || key === ' ') {` to `if (key === 'Enter') {`.

In `src/ui/Toolbar.tsx`, make pointer clicks drop focus so the next Space goes to the table. `TbButton` gets:

```tsx
function TbButton({ icon, label, onClick, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="tb-btn"
      aria-label={label}
      title={label}
      onClick={(e) => {
        onClick?.(e);
        if (e.detail > 0) e.currentTarget.blur(); // pointer click (detail 0 = keyboard): let Space reach the table
      }}
      {...rest}
    >
      <Icon name={icon} />
      <span className="tb-label">{label}</span>
    </button>
  );
}
```

In `pick()`, blur the `summary` as well: after `menu.current.open = false;`, add `(menu.current.querySelector('summary') as HTMLElement | null)?.blur();`.

In `src/ui/dialogs/SettingsDialog.tsx`, add this before the `Modal`'s closing tag:

```tsx
      <div>
        <div className="label">Keyboard</div>
        <dl className="keys">
          <dt>Space / D</dt><dd>Draw</dd>
          <dt>Arrows</dt><dd>Move focus</dd>
          <dt>Enter</dt><dd>Pick up / drop</dd>
          <dt>Esc</dt><dd>Cancel</dd>
          <dt>Z / Shift+Z</dt><dd>Undo / redo</dd>
          <dt>H</dt><dd>Hint</dd>
          <dt>N</dt><dd>New game</dd>
        </dl>
      </div>
```

And in `src/styles/chrome.css`, add:

```css
.keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; font-size: 13px; }
.keys dt { font-family: var(--font-mono); color: var(--ink); }
.keys dd { margin: 0; color: var(--mute); }
```

- [ ] **Step 4: Run the tests and e2e**

Run: `npx tsc --noEmit && npm run e2e`
Expected: all pass, including the existing `keyboard: D draws, Z undoes, arrows + Enter move a card`.

- [ ] **Step 5: Commit**

```bash
git add -A src e2e
git commit -m "feat(ui): Space draws from the stock; Enter picks up and drops

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Import stats from solitaired.com

**Files:**
- Modify: `src/store/stats.ts`, `src/ui/useGame.ts`, `src/ui/dialogs/StatsDialog.tsx`, `src/App.tsx`, `src/styles/chrome.css`
- Create: `src/ui/dialogs/ImportForm.tsx`
- Test: `tests/store/store.test.ts`, `e2e/game.spec.ts`

**Interfaces:**
- Produces:
  - `Stats.v: 2` and `ModeStats.imported?: { source: 'solitaired'; at: number }`.
  - `interface ImportInput { played: number; won: number; timeMs: number | null; moves: number | null }`.
  - `SOLITAIRED_PREFILL: ImportInput`.
  - `importStats(stats: Stats, input: ImportInput, at: number): Stats`.
  - `parseImportForm(f: ImportFields): { ok: true; value: ImportInput } | { ok: false; error: string }`, with `ImportFields = { played: string; won: string; time: string; moves: string }`.
  - `Game.importStats(input: ImportInput): void`.

- [ ] **Step 1: Write the failing unit tests**

Add to `tests/store/store.test.ts` (extend the stats import line with `importStats, parseImportForm, SOLITAIRED_PREFILL`):

```ts
describe('stats import', () => {
  it('adds counts, keeps the better bests, marks draw1 and leaves streaks alone', () => {
    let s = emptyStats();
    s = recordResult(s, { drawCount: 1, scoring: 'standard', won: true, timeMs: 20_000, moves: 150, score: 500 });
    const r = importStats(s, SOLITAIRED_PREFILL, 123);
    expect(r.draw1).toMatchObject({
      played: 5562,
      won: 4090,
      bestTimeMs: 20_000, // ours was better
      fewestMoves: 102, // theirs was better
      currentStreak: 1,
      bestStreak: 1,
      bestScore: 500,
      imported: { source: 'solitaired', at: 123 },
    });
    expect(r.draw3).toEqual(s.draw3);
    expect(importStats(r, SOLITAIRED_PREFILL, 456)).toBe(r); // once only
  });
  it('keeps the marker through later results and round-trips v2', () => {
    const r = recordResult(importStats(emptyStats(), SOLITAIRED_PREFILL, 1), { drawCount: 1, scoring: 'standard', won: true, timeMs: 1, moves: 1, score: 1 });
    expect(r.draw1.imported).toEqual({ source: 'solitaired', at: 1 });
    expect(parseStats(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it('upgrades v1 stats to v2 without a marker', () => {
    const v1 = { ...emptyStats(), v: 1 };
    const p = parseStats(v1);
    expect(p.v).toBe(2);
    expect(p.draw1.imported).toBeUndefined();
  });
  it('validates the form', () => {
    expect(parseImportForm({ played: '5561', won: '4089', time: '0:34', moves: '102' })).toEqual({ ok: true, value: SOLITAIRED_PREFILL });
    expect(parseImportForm({ played: '10', won: '4', time: '', moves: '' })).toEqual({ ok: true, value: { played: 10, won: 4, timeMs: null, moves: null } });
    expect(parseImportForm({ played: '3', won: '4', time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '-1', won: '0', time: '', moves: '' }).ok).toBe(false);
    expect(parseImportForm({ played: '5', won: '1', time: '1:75', moves: '' }).ok).toBe(false);
  });
});
```

Also update any existing assertion in that file that expects `v: 1` from `emptyStats()` or `parseStats` to expect `v: 2`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/store`
Expected: FAIL (`importStats` is not exported).

- [ ] **Step 3: Implement the store**

In `src/store/stats.ts`:
- Add `imported?: { source: 'solitaired'; at: number };` to `ModeStats`.
- Change `Stats.v` to `2`, and make `emptyStats` return `v: 2`.
- In `recordResult`'s won branch, start the object with `...m,` so the marker survives. The loss branch already spreads it.
- Make `parseMode` keep a valid marker:

```ts
function parseMode(raw: unknown): ModeStats | null {
  const r = asRecord(raw);
  const ok =
    count(r.played) && count(r.won) && count(r.currentStreak) && count(r.bestStreak) &&
    countOrNull(r.bestTimeMs) && countOrNull(r.fewestMoves) && countOrNull(r.bestScore);
  if (!ok) return null;
  const imp = asRecord(r.imported);
  const { imported: _drop, ...rest } = r as unknown as ModeStats;
  return imp.source === 'solitaired' && typeof imp.at === 'number' ? { ...rest, imported: { source: 'solitaired', at: imp.at } } : rest;
}
```

- In `parseStats`, accept `r.v === 1 || r.v === 2` and return `{ v: 2, draw1, draw3, vegasBank: r.vegasBank }`.
- Add:

```ts
export interface ImportInput {
  played: number;
  won: number;
  timeMs: number | null;
  moves: number | null;
}

/** Luke's Klondike (turn 1) record on solitaired.com, read 2026-09-29. Prefills the import form. */
export const SOLITAIRED_PREFILL: ImportInput = { played: 5561, won: 4089, timeMs: 34_000, moves: 102 };

const better = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

/** Adds an outside Draw 1 record once per device; streaks and scores don't carry over. */
export function importStats(stats: Stats, input: ImportInput, at: number): Stats {
  const m = stats.draw1;
  if (m.imported) return stats;
  return {
    ...stats,
    draw1: {
      ...m,
      played: m.played + input.played,
      won: m.won + input.won,
      bestTimeMs: better(m.bestTimeMs, input.timeMs),
      fewestMoves: better(m.fewestMoves, input.moves),
      imported: { source: 'solitaired', at },
    },
  };
}

export interface ImportFields {
  played: string;
  won: string;
  time: string;
  moves: string;
}

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

export function parseImportForm(f: ImportFields): { ok: true; value: ImportInput } | { ok: false; error: string } {
  const played = int(f.played);
  const won = int(f.won);
  if (played === null || won === null) return { ok: false, error: 'Games played and won must be whole numbers.' };
  if (won > played) return { ok: false, error: "Games won can't exceed games played." };
  let timeMs: number | null = null;
  if (f.time.trim()) {
    const t = /^(\d+):([0-5]\d)$/.exec(f.time.trim());
    if (!t) return { ok: false, error: 'Fastest win must look like 0:34.' };
    timeMs = (Number(t[1]) * 60 + Number(t[2])) * 1000;
  }
  const moves = f.moves.trim() ? int(f.moves) : null;
  if (f.moves.trim() && moves === null) return { ok: false, error: 'Fewest moves must be a whole number.' };
  return { ok: true, value: { played, won, timeMs, moves } };
}
```

- [ ] **Step 4: Hook and UI**

In `src/ui/useGame.ts`:
- Add `importStats(input: ImportInput): void;` to the `Game` interface. Import `importStats as mergeImport` and `type ImportInput` from `../store/stats`.
- Return:

```ts
    importStats: useCallback((input: ImportInput) => {
      setStats((prev) => {
        const next = mergeImport(prev, input, Date.now());
        saveStats(next);
        return next;
      });
    }, []),
```

Create `src/ui/dialogs/ImportForm.tsx`:

```tsx
import { useState } from 'react';
import { parseImportForm, SOLITAIRED_PREFILL, type ImportFields, type ImportInput } from '../../store/stats';
import { formatTime } from '../format';

const initial: ImportFields = {
  played: String(SOLITAIRED_PREFILL.played),
  won: String(SOLITAIRED_PREFILL.won),
  time: SOLITAIRED_PREFILL.timeMs === null ? '' : formatTime(SOLITAIRED_PREFILL.timeMs),
  moves: SOLITAIRED_PREFILL.moves === null ? '' : String(SOLITAIRED_PREFILL.moves),
};

export function ImportForm({ onImport, onCancel }: { onImport(v: ImportInput): void; onCancel(): void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof ImportFields, label: string, inputMode: 'numeric' | 'text' = 'numeric') => (
    <label className="field">
      <span className="label">{label}</span>
      <input inputMode={inputMode} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );
  return (
    <form
      className="import"
      onSubmit={(e) => {
        e.preventDefault();
        const r = parseImportForm(f);
        if (r.ok) onImport(r.value);
        else setError(r.error);
      }}
    >
      <p className="note">Adds your solitaired.com Klondike (turn 1) record to Draw 1 on this device. Streaks and score don't carry over.</p>
      <div className="import-grid">
        {field('played', 'Games played')}
        {field('won', 'Games won')}
        {field('time', 'Fastest win (m:ss)', 'text')}
        {field('moves', 'Fewest moves')}
      </div>
      {error && <p className="note error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary">Import</button>
      </div>
    </form>
  );
}
```

(Check `formatTime(34_000)` returns `'0:34'`. `tests/ui/format.test.ts` pins its behaviour. If it pads differently, build the string inline instead: `` `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` ``.)

In `src/ui/dialogs/StatsDialog.tsx`:
- Add `onImport(v: ImportInput): void` to the props and `const [importing, setImporting] = useState(false);`.
- Reset `importing` when the dialog closes (`useEffect(() => { if (!open) setImporting(false); }, [open]);`).
- When `importing`, render `<ImportForm onImport={(v) => { onImport(v); setImporting(false); }} onCancel={() => setImporting(false)} />` in place of the table, and pass `actions={undefined}`.
- Otherwise, after the table and the Vegas note, render:

```tsx
      {stats.draw1.imported ? (
        <p className="note">Imported from solitaired.com on {new Date(stats.draw1.imported.at).toLocaleDateString()}</p>
      ) : (
        <button type="button" className="link-btn" onClick={() => setImporting(true)}>Import from solitaired.com</button>
      )}
```

In `src/App.tsx`, pass `onImport={game.importStats}` to `<StatsDialog>`.

In `src/styles/chrome.css`, add:

```css
.link-btn { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--accent); cursor: pointer; font-size: 13.5px; font-weight: 500; }
.link-btn:hover { text-decoration: underline; }
.import { display: flex; flex-direction: column; gap: 14px; }
.import-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; }
.field .label { margin-bottom: 6px; }
.field input { min-height: 38px; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--panel-line); background: color-mix(in srgb, var(--ink) 5%, transparent); color: var(--ink); font-family: var(--font-mono); font-size: 14px; }
.field input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.note.error { color: #d9573f; }
```

- [ ] **Step 5: Write the e2e test**

Append to `e2e/game.spec.ts`:

```ts
test('imports solitaired stats once', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.getByRole('button', { name: 'Stats' }).click();
  const dialog = page.getByRole('dialog', { name: 'Statistics' });
  await dialog.getByRole('button', { name: 'Import from solitaired.com' }).click();
  await expect(dialog.getByLabel('Games played')).toHaveValue('5561');
  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog.getByRole('row', { name: /Played/ })).toContainText('5561');
  await expect(dialog.getByText(/Imported from solitaired\.com on/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import from solitaired.com' })).toHaveCount(0);
});
```

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A src tests e2e
git commit -m "feat(stats): one-time import of solitaired.com Klondike stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Visual verification and build check

**Files:**
- Create: `e2e/visual.spec.ts`

- [ ] **Step 1: Add the screenshot spec**

Create `e2e/visual.spec.ts`. It takes review screenshots, not pixel assertions, because the controller reviews them by eye before merge.

```ts
import { test } from '@playwright/test';
import { freshGame, SEED } from './helpers';

for (const table of ['studio', 'felt', 'paper'] as const) {
  test(`screenshot: ${table} table`, async ({ page }, info) => {
    await freshGame(page, { seed: SEED, settings: { table } });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}.png` });
    await page.getByRole('button', { name: 'Stats' }).click();
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}-stats.png` });
  });
}
```

- [ ] **Step 2: Run the full suites and the build**

Run: `npx vitest run && npm run build && npm run e2e && grep -c woff2 dist/sw.js`
Expected:
- All unit and e2e tests pass.
- The build succeeds.
- The grep prints a count ≥ 1, meaning the fonts are precached for offline play.

- [ ] **Step 3: Review the screenshots**

Open every PNG under `test-results/visual/`. That's 3 tables × 2 projects, plus the stats view of each. Check:
- Cards are legible, with the index clear when fanned.
- The glass top bar reads as one line on desktop and two rows on Pixel 7.
- There's no horizontal scroll.
- Dialog contrast is fine on all three tables.

Fix any defect found and re-run.

- [ ] **Step 4: Commit**

```bash
git add e2e/visual.spec.ts
git commit -m "test(e2e): review screenshots for all three tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
