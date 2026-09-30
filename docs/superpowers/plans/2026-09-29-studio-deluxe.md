# Solitaire v1.2 Studio Deluxe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the table, cards and chrome look crafted and deep, show the card flip as a real turn, shake a card that has nowhere to go, and stop the game making moves on its own mid-game.

**Architecture:** This builds on the v1.1 code on branch `feat/studio-deluxe`.
- Visual work is CSS custom properties and pseudo-elements in `src/styles/*`. Textures are inline SVG-noise data URIs, and there are no image files.
- Behaviour changes are small React/TS edits: settings, Card/Table props, and the tap reject path.
- Timings stay in `src/ui/appClass.ts`.

**Tech Stack:** Vite 8, React 19, TypeScript 7 strict (`noUnusedLocals`, `noUnusedParameters`), Vitest 5 (node env, `tests/**/*.test.ts` only), and Playwright (desktop + Pixel 7 projects; `e2e/helpers.ts` `freshGame` seeds settings `{ animation: 'off', sound: false, … }` unless overridden).

**Spec:** `docs/superpowers/specs/2026-09-29-studio-deluxe-design.md`

## Global Constraints

- Card face (all 52 cards): index top-left plus one big pip bottom-right. Kings, queens and jacks have no big letter.
  - Face colour `#fbf8f2` (Studio and Felt), `#ffffff` (Paper).
  - Rank: Geist 600 at `calc(var(--card-w) * 0.26)`, `letter-spacing: -0.05em`.
  - Suit under the rank: `0.163 × w`, with a `0.03 × w` gap.
  - Index at `top` and `left` `0.076 × w`, column width `0.26 × w`.
  - Big pip `0.48 × w`, at `right` and `bottom` `0.087 × w`.
  - Keyline: `1px solid #0000000d`, inset `0.033 × w`, radius `0.043 × w`.
  - Paper grain: `mix-blend-mode: multiply`, `opacity .18`.
- Card shadows:
  - Rest: `0 0 0 1px #00000014, 0 10px 22px #0000008c, 0 2px 5px #00000059`.
  - Paper: `0 0 0 1px #1b1a171f, 0 10px 22px #3a2a1426, 0 2px 4px #3a2a141f`.
- Deco back is the default `cardBack`, and `CardBack = 'deco' | 'amber' | 'ink' | 'oxblood' | 'navy'`.
- Flip: a real 3D `rotateY` turn, `FLIP_MS` normal 240 / fast 150 / off 0, `perspective: calc(var(--card-w) * 10)`.
- Shake:
  - Motion: `translateX` 0, −3px, 2.5px, −1.5px, 1px, 0 over 220ms with `cubic-bezier(.36,.07,.19,.97)` on `.card-inner`.
  - When: only for a tap or click with no legal destination, never when Animation is Off, and it replays on each tap.
- Hover lift: `@media (hover: hover)`, pickable face-up cards only, `translateY(-2px)` on `.card-inner` over 160ms. Not while dragging or locked.
- `autoMove` replaces `autoPlay`. It defaults to `false`, and a stored `autoPlay` is ignored. The auto-finish is unchanged.
- Floating toolbar: `margin: 10px 12px 0`, `border-radius: 12px`, and a `1px` border in `--chrome-line`.
- Studio table:
  - Spotlight `radial-gradient(70% 60% at 50% 18%, #3a2c1d 0%, #1c1612 55%, #0f0d0b 100%)`.
  - Leather noise with `baseFrequency .55`, soft-light at `.35`.
  - Stitched rail: `1px dashed #f2c14e2e`, inset 10px, radius 12px.
- Felt table: woven noise with `baseFrequency .9`, overlay at `.55`, plus a vignette `inset 0 0 120px 30px #00000080`.
- Paper table: linen weave plus warm noise at `.6`.
- Textures and decorations never intercept pointer events or change layout.
- Commits end with a `Co-Authored-By:` trailer naming the model that wrote them.

## Rulings made while planning

- **Shake class timing.** The shake class stays on for 400ms (the animation is 220ms) so e2e can observe it reliably. It's harmless because the animation has ended.
- **Wordmark dot.** The amber period on the wordmark shows on Studio only, via CSS. The span is always rendered.
- **Hover-lift timing.** Hover lift uses its own 160ms transition on `.card.faceup.pickable .card-inner`, so a flip (with pickable removed) still uses `--flip-ms`.
- **Face-down DOM.** `CardFront` now renders for face-down cards too. The DOM of a face-down card therefore contains its rank. This is accepted: the card's `role="img"` `aria-label` is what assistive tech reads.

---

### Task 1: Auto-move is opt-in; Deco back becomes the default

**Files:**
- Modify: `src/store/settings.ts`, `src/ui/useGame.ts:109`, `src/ui/dialogs/SettingsDialog.tsx`, `src/styles/table.css` (card-back pseudo-elements), `src/styles/themes.css` (back classes), `e2e/helpers.ts:24`
- Test: `tests/store/store.test.ts`, `e2e/game.spec.ts`

**Interfaces:**
- Produces:
  - `Settings.autoMove: boolean`. `Settings.autoPlay` is removed.
  - `CardBack = 'deco' | 'amber' | 'ink' | 'oxblood' | 'navy'` and `CARD_BACKS` in that order.
  - `DEFAULT_SETTINGS.cardBack === 'deco'` and `DEFAULT_SETTINGS.autoMove === false`.

- [ ] **Step 1: Write the failing unit tests**

In `tests/store/store.test.ts`, inside `describe('settings', …)`:
- Change `expect(DEFAULT_SETTINGS.cardBack).toBe('amber');` to `toBe('deco')`.
- Add:

```ts
  it('auto-move is opt-in and ignores the old autoPlay flag', () => {
    expect(DEFAULT_SETTINGS.autoMove).toBe(false);
    expect(parseSettings({ autoPlay: true }).autoMove).toBe(false);
    expect(parseSettings({ autoMove: true }).autoMove).toBe(true);
    expect(parseSettings({ autoPlay: true })).not.toHaveProperty('autoPlay');
  });
  it.each(['deco', 'amber', 'ink', 'oxblood', 'navy'])('accepts the %s card back', (cardBack) => {
    expect(parseSettings({ cardBack }).cardBack).toBe(cardBack);
  });
```

- [ ] **Step 2: Write the failing e2e test**

Append to `e2e/game.spec.ts`:

```ts
test('auto-move starts off even for players who had auto-play on', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-init')) return;
    sessionStorage.setItem('e2e-init', '1');
    localStorage.clear();
    localStorage.setItem('sol.v1.settings', JSON.stringify({ animation: 'off', sound: false, autoPlay: true }));
  });
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => !!window.__sol);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Auto-move safe cards to foundations/ })).not.toBeChecked();
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run tests/store && npx playwright test -g "auto-move starts off"`
Expected: FAIL (`autoMove` is undefined, the back is `amber`, and there is no checkbox with that name).

- [ ] **Step 4: Implement settings**

In `src/store/settings.ts`:
- Change `CardBack` and `CARD_BACKS` to the new order: `['deco', 'amber', 'ink', 'oxblood', 'navy']`.
- In the `Settings` interface, replace `autoPlay: boolean;` with `autoMove: boolean;`.
- In `DEFAULT_SETTINGS`, replace `autoPlay: true,` with `autoMove: false,`, and set `cardBack: 'deco'`.
- In `parseSettings`, replace the `autoPlay:` line with:

```ts
    // v1.1's `autoPlay` (default on) is deliberately ignored: from v1.2 nothing moves mid-game unless opted in.
    autoMove: bool(r.autoMove, d.autoMove),
```

In `src/ui/useGame.ts`, change `autoPlay: settingsRef.current.autoPlay` to `autoPlay: settingsRef.current.autoMove`. The session action keeps its `autoPlay` field name.

In `src/ui/dialogs/SettingsDialog.tsx`:
- Replace the auto-play `Toggle` with:

```tsx
      <Toggle
        label="Auto-move safe cards to foundations"
        hint="Off: nothing moves unless you move it. The finish still completes itself."
        checked={s.autoMove}
        onChange={(autoMove) => onChange({ autoMove })}
      />
```

- Make the card-back options `[['deco', 'Deco'], ['amber', 'Amber'], ['ink', 'Ink'], ['oxblood', 'Oxblood'], ['navy', 'Navy']]`.

In `e2e/helpers.ts`, change `autoPlay: false` to `autoMove: false` in the seeded settings.

- [ ] **Step 5: Implement the Deco back**

In `src/styles/themes.css`, add before `.back-amber`:

```css
.back-deco { --back: linear-gradient(160deg, #3a2d1f, #1d160f); --back-frame: #f2c14e55; --back-pattern: conic-gradient(from 45deg at 50% 50%, #f2c14e14 0 25%, transparent 0 50%, #f2c14e14 0 75%, transparent 0) 0 0 / 12px 12px; }
```

In `src/styles/table.css`, after the `.card-back::after` rule, add the medallion:

```css
/* Deco back: a diamond medallion over the lattice. */
.back-deco .card-back::before {
  content: '';
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 50%;
  width: calc(var(--card-w) * 0.33);
  height: calc(var(--card-w) * 0.33);
  transform: translate(-50%, -50%) rotate(45deg);
  border: 1px solid #f2c14eaa;
  background: #1d160f;
  box-shadow: 0 0 0 4px #1d160f, 0 0 0 5px #f2c14e55;
}
```

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass. `tests/game/*` still pass `autoPlay` to the session reducer directly, and that's intended.

- [ ] **Step 7: Commit**

```bash
git add -A src tests e2e
git commit -m "feat: auto-move is opt-in (off for everyone); Deco card back is the new default"
```

---

### Task 2: Crafted tables and a floating glass toolbar

**Files:**
- Modify: `src/styles/themes.css`, `src/styles/table.css`, `src/styles/chrome.css`, `src/ui/Toolbar.tsx` (wordmark)
- Test: existing e2e (the toolbar height ≤ 56px tests and "layout fits the viewport") plus a visual check

**Interfaces:**
- Consumes: the table classes `table-studio`, `table-felt` and `table-paper` on `.app`.
- Produces: tokens `--texture`, `--texture-blend`, `--texture-opacity` and `--chrome-shadow`.

- [ ] **Step 1: Textures and tokens in `src/styles/themes.css`**

In `.table-studio`:
- Replace `--bg` with `--bg: #0f0d0b;`, and `--glow` with `--glow: radial-gradient(70% 60% at 50% 18%, #3a2c1d 0%, #1c1612 55%, #0f0d0b 100%);`.
- Set `--chrome-bg: linear-gradient(170deg, #ffffff17, #ffffff06);` and `--chrome-line: #ffffff18;`.
- Add:

```css
  --chrome-shadow: 0 10px 30px #0006, 0 1px 0 #ffffff1f inset;
  --texture: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --texture-blend: soft-light;
  --texture-opacity: 0.35;
```

In `.table-felt`, set `--chrome-bg: linear-gradient(170deg, #ffffff17, #ffffff06);` and add:

```css
  --chrome-shadow: 0 10px 30px #0006, 0 1px 0 #ffffff1f inset;
  --texture: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --texture-blend: overlay;
  --texture-opacity: 0.55;
```

In `.table-paper`, add:

```css
  --chrome-shadow: 0 8px 24px #0000001a;
  --texture: repeating-linear-gradient(0deg, #00000008 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, #00000006 0 1px, transparent 1px 3px), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .25 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --texture-blend: normal;
  --texture-opacity: 0.6;
```

Leave `TABLE_BASE` in `src/ui/appClass.ts` unchanged (`#131110` still reads as the top of the Studio table).

- [ ] **Step 2: Texture layer, rail, vignette and slots in `src/styles/table.css`**

Append to the existing `.app { … }` rule: `position: relative; isolation: isolate;`. Then add:

```css
/* Table texture sits above the base gradient and below everything else. */
.app::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--texture, none);
  mix-blend-mode: var(--texture-blend, normal);
  opacity: var(--texture-opacity, 0);
}
.table-wrap::before { content: ''; position: absolute; pointer-events: none; }
/* Studio: a stitched rail around the play area. Felt: a vignette. */
.table-studio .table-wrap::before { inset: 10px; border: 1px dashed #f2c14e2e; border-radius: 12px; }
.table-felt .table-wrap::before { inset: 0; box-shadow: inset 0 0 120px 30px #00000080; }
.table-studio .slot { background: linear-gradient(180deg, #ffffff08, #ffffff02); box-shadow: inset 0 1px 0 #ffffff0d; }
.table-felt .slot { box-shadow: inset 0 2px 8px #00000055; }
```

- [ ] **Step 3: Floating toolbar in `src/styles/chrome.css`**

In the `.toolbar` rule:
- Remove `border-bottom: 1px solid var(--chrome-line);`.
- Change the blur to `blur(12px) saturate(140%)` (in both the standard and `-webkit-` declarations).
- Add:

```css
  margin: 10px 12px 0;
  border: 1px solid var(--chrome-line);
  border-radius: 12px;
  box-shadow: var(--chrome-shadow, none);
```

Add `.wordmark-dot { display: none; } .table-studio .wordmark-dot { display: inline; color: var(--accent); }`.

In `src/ui/Toolbar.tsx`, change the wordmark to `<span className="wordmark">Solitaire<span className="wordmark-dot">.</span></span>`.

- [ ] **Step 4: Run e2e and check visually**

Run: `npx tsc --noEmit && npm run e2e`
Expected: all pass. The toolbar tests still measure ≤ 56px (52px plus a 1px border on each side).

Then take screenshots of all three tables on desktop (1280×800) and Pixel 7. From the repo root, run `npx playwright test e2e/visual.spec.ts`; the PNGs land in `test-results/visual/`. Check that:
- The texture is visible but subtle.
- The rail and vignette show.
- The toolbar floats.
- Nothing overlaps the cards and there's no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(ui): leather, felt and linen textures; stitched rail; floating glass toolbar"
```

---

### Task 3: Crisper card face and matching canvas painter

**Files:**
- Modify: `src/styles/table.css` (`.face*`, `.card-front`), `src/styles/themes.css` (`--card-face`, `--card-shadow`), `src/ui/cards/paint.ts`
- Test: `tests/ui/paint.test.ts` (create)

**Interfaces:**
- Consumes: `paintFace(ctx, id, w, h, pal: FacePalette)`, whose signature is unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/paint.test.ts`:

```ts
import { beforeAll, describe, it, expect } from 'vitest';
import { cardId } from '../../src/engine/cards';

type Call = [string, unknown[]];

function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, k) => (k in target ? target[k as string] : (...args: unknown[]) => void calls.push([String(k), args])),
    set: (target, k, v) => ((target[k as string] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(public d: string) {}
  };
});

describe('paintFace', () => {
  it('draws the index and big pip at the CSS proportions', async () => {
    const { paintFace } = await import('../../src/ui/cards/paint');
    const { ctx, calls } = fakeCtx();
    const w = 100;
    const h = 140;
    paintFace(ctx, cardId('H', 13), w, h, { face: '#fbf8f2', S: '#000', H: '#c00', D: '#c00', C: '#000', font: 'Geist' });
    const text = calls.find(([k]) => k === 'fillText')!;
    expect(text[1][0]).toBe('K');
    expect(text[1][1]).toBeCloseTo(0.076 * w + 0.13 * w); // centre of the 0.26w index column
    expect(text[1][2]).toBeCloseTo(0.076 * w);
    const translates = calls.filter(([k]) => k === 'translate').map(([, a]) => a as number[]);
    const pip = translates[translates.length - 1];
    expect(pip[0]).toBeCloseTo(w - 0.087 * w - 0.48 * w);
    expect(pip[1]).toBeCloseTo(h - 0.087 * w - 0.48 * w);
    expect(ctx.font).toBe(`600 ${0.26 * w}px Geist`);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/ui/paint.test.ts`
Expected: FAIL. The current painter uses 0.28w for the rank, 0.47w for the pip and different offsets.

- [ ] **Step 3: Implement the painter**

In `src/ui/cards/paint.ts`, replace the body of `paintFace` after `const suit = suitOf(id);` with:

```ts
  ctx.fillStyle = pal.face;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.055);
  ctx.fill();
  // Hairline keyline inside the edge, as on the CSS face.
  const inset = w * 0.033;
  ctx.strokeStyle = '#0000000d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(inset + 0.5, inset + 0.5, w - 2 * inset - 1, h - 2 * inset - 1, w * 0.043);
  ctx.stroke();
  ctx.fillStyle = pal[suit];
  const top = w * 0.076;
  const cx = w * 0.076 + w * 0.13; // centre of the 0.26w index column
  ctx.font = `600 ${w * 0.26}px ${pal.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '-0.05em';
  ctx.fillText(rankLabel(id), cx, top);
  glyph(ctx, SUIT_PATHS[suit], cx - w * 0.0815, top + w * 0.26 + w * 0.03, w * 0.163);
  glyph(ctx, SUIT_PATHS[suit], w - w * 0.087 - w * 0.48, h - w * 0.087 - w * 0.48, w * 0.48);
```

- [ ] **Step 4: Implement the CSS face and shadows**

In `src/styles/themes.css`:
- In `.app`, set `--card-face: #fbf8f2;` and `--card-shadow: 0 0 0 1px #00000014, 0 10px 22px #0000008c, 0 2px 5px #00000059;`.
- In `.table-felt`, delete the `--card-face: #fbfaf7;` line.
- In `.table-paper`, set `--card-shadow: 0 0 0 1px #1b1a171f, 0 10px 22px #3a2a1426, 0 2px 4px #3a2a141f;`.

In `src/styles/table.css`, replace the `.face-index`, `.face-rank`, `.face-suit` and `.face-pip` rules with:

```css
.face-index { position: absolute; top: calc(var(--card-w) * 0.076); left: calc(var(--card-w) * 0.076); width: calc(var(--card-w) * 0.26); display: flex; flex-direction: column; align-items: center; gap: calc(var(--card-w) * 0.03); }
.face-rank { font-size: calc(var(--card-w) * 0.26); letter-spacing: -0.05em; white-space: nowrap; }
.face-suit { width: calc(var(--card-w) * 0.163); height: calc(var(--card-w) * 0.163); fill: currentColor; }
.face-pip { position: absolute; right: calc(var(--card-w) * 0.087); bottom: calc(var(--card-w) * 0.087); width: calc(var(--card-w) * 0.48); height: calc(var(--card-w) * 0.48); fill: currentColor; }
/* Keyline and paper grain on the face. */
.face::before { content: ''; position: absolute; inset: calc(var(--card-w) * 0.033); border-radius: calc(var(--card-w) * 0.043); border: 1px solid #0000000d; pointer-events: none; }
.face::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.18;
  mix-blend-mode: multiply;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .55 0 0 0 0 .5 0 0 0 0 .42 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass, including `tests/ui/cardFront.test.ts` (the markup is unchanged).

- [ ] **Step 6: Commit**

```bash
git add -A src tests
git commit -m "feat(ui): crisper card face — larger index, keyline, paper grain, deeper shadows"
```

---

### Task 4: Real 3D flip, "no move" shake, and hover lift

**Files:**
- Modify: `src/ui/appClass.ts` (`FLIP_MS`), `src/ui/Card.tsx`, `src/ui/Table.tsx`, `src/ui/useTableInput.ts` (reject signature and the tap path), `src/styles/table.css`
- Test: `tests/ui/appClass.test.ts`, `e2e/game.spec.ts`

**Interfaces:**
- Consumes: `effectiveAnimation(settings)` and `FLIP_MS` from `src/ui/appClass.ts`; `pickupAt(s, pos)` and `pickupIds(s, pickup)` from `src/ui/layout.ts`.
- Produces:
  - `useTableInput`'s `onReject?(pickup?: { from: PileId; count: number }): void`. The tap path passes the pickup; the drag path passes nothing.
  - `Card` props `nopeKey: number` (0 means not shaking) and `pickable: boolean`.

- [ ] **Step 1: Write the failing tests**

In `tests/ui/appClass.test.ts`, change the FLIP expectation to `expect(FLIP_MS).toEqual({ normal: 240, fast: 150, off: 0 });`.

Append to `e2e/game.spec.ts`:

```ts
function firstStuck(s: GameState): number | null {
  for (let i = 0; i < 7; i++) {
    const cards = s.tableau[i].cards;
    const id = cards[cards.length - 1];
    if (id !== undefined && destinationsFor(s, `T${i}` as PileId, 1).length === 0) return id;
  }
  return null;
}

test('tapping a card with no move shakes it and moves nothing', async ({ page }) => {
  await freshGame(page, { seed: SEED, settings: { animation: 'normal' } });
  const s = await getState(page);
  const id = firstStuck(s);
  expect(id).not.toBeNull();
  const card = page.locator(`#card-${id}`);
  const pile = (await card.getAttribute('data-pile'))!;
  await clickCenter(page, `#card-${id}`);
  await expect(card).toHaveClass(/\bnope\b/);
  await expect(card).toHaveAttribute('data-pile', pile);
  expect((await getSession(page)).turns.length).toBe(0);
});

test('a legal tap does not shake; face-up cards are pickable and face-down ones are not', async ({ page }) => {
  await freshGame(page, { seed: SEED, settings: { animation: 'normal' } });
  const s = await getState(page);
  const col = s.tableau[6].cards;
  await expect(page.locator(`#card-${col[col.length - 1]}`)).toHaveClass(/\bpickable\b/);
  await expect(page.locator(`#card-${col[0]}`)).not.toHaveClass(/\bpickable\b/);
  const tap = firstTap(s);
  if (!tap) return;
  await clickCenter(page, `#card-${tap.id}`);
  await expect(page.locator(`#card-${tap.id}`)).toHaveAttribute('data-pile', tap.to);
  await expect(page.locator(`#card-${tap.id}`)).not.toHaveClass(/\bnope\b/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/ui/appClass.test.ts && npx playwright test -g "shakes it|legal tap does not shake"`
Expected: FAIL. FLIP is 140/90, and there are no `nope` or `pickable` classes.

- [ ] **Step 3: Timings and the reject path**

In `src/ui/appClass.ts`, set `export const FLIP_MS: Record<AnimationSpeed, number> = { normal: 240, fast: 150, off: 0 };`.

In `src/ui/useTableInput.ts`:
- Change the arg type to `onReject?(pickup?: { from: PileId; count: number }): void;`, importing `PileId` from `../engine/types` if it isn't already.
- On the tap path (the final `else onReject?.();` after `destinationsFor`), change the call to `else onReject?.(p.pickup);`.
- The drag path's `else if (!cancelled) onReject?.();` stays argument-less.

- [ ] **Step 4: Card**

In `src/ui/Card.tsx`:
- Add `nopeKey: number;` and `pickable: boolean;` to `CardProps`.
- Add `p.nopeKey > 0 && 'nope'` and `p.pickable && 'pickable'` to the class list.
- Render the inner part as:

```tsx
        {/* A new key on each rejected tap remounts the inner element so the shake replays. */}
        <div className="card-inner" key={p.nopeKey}>
          {/* The face stays rendered while face down so a flip never shows a blank card. */}
          <div className="card-front"><CardFront id={p.id} /></div>
          <div className="card-back" />
        </div>
```

- [ ] **Step 5: Table**

In `src/ui/Table.tsx`:
- Import `effectiveAnimation` from `./appClass` and `pickupAt` from `./layout` (extend the existing import).
- Import `useCallback` from react if you use it.
- Add, after `stackedIds`:

```ts
  // Cards that can be picked up (face-up and movable), for the hover lift.
  const pickableIds = useMemo(() => {
    const out = new Set<CardId>();
    if (p.locked || !positions) return out;
    for (const [id, pos] of positions) if (pos.faceUp && pickupAt(p.state, pos)) out.add(id);
    return out;
  }, [positions, p.state, p.locked]);

  // "No move" shake: n bumps on every rejected tap so the same card can shake again.
  const [nope, setNope] = useState<{ ids: Set<CardId>; n: number } | null>(null);
  const nopeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(nopeTimer.current), []);
  const reject = (pickup?: { from: PileId; count: number }) => {
    p.onReject?.();
    if (!pickup || effectiveAnimation(p.settings) === 'off') return;
    setNope((prev) => ({ ids: new Set(pickupIds(p.state, pickup)), n: (prev?.n ?? 0) + 1 }));
    window.clearTimeout(nopeTimer.current);
    nopeTimer.current = window.setTimeout(() => setNope(null), 400);
  };
```

(Import `PileId` from `../engine/types`.)

Then:
- Pass `onReject: reject` to `useTableInput` in place of `p.onReject`.
- Add these props to `<Card>`:

```tsx
            nopeKey={nope?.ids.has(id) ? nope.n : 0}
            pickable={pickableIds.has(id)}
```

- [ ] **Step 6: CSS in `src/styles/table.css`**

Replace the current flip block:
- the `.card-inner` rule;
- the `.card-front, .card-back` rule;
- the comment starting "Flip: the face fades in";
- `.card-front { … opacity: 0; transform: scale(0.96); }`;
- `.card.faceup .card-front`;
- `.card.faceup .card-back`;
- the `.card-back { background: …; box-shadow: … }` rule.

Put this in their place:

```css
.card { perspective: calc(var(--card-w) * 10); }
/* Flip: a real 3D turn. Face-down cards are turned over; both faces hide their backside. */
.card-inner {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transform-style: preserve-3d;
  transition: transform var(--flip-ms) var(--ease);
}
.card:not(.faceup) .card-inner { transform: rotateY(180deg); }
.card-front,
.card-back {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  box-shadow: var(--card-shadow);
  transition: box-shadow 160ms var(--ease), transform 160ms var(--ease);
}
.card-front { background: var(--card-face); }
.card-back { background: var(--back); box-shadow: var(--back-shadow); transform: rotateY(180deg); }
/* "No move": a small side-to-side shake. */
@keyframes nope {
  0% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(2.5px); }
  60% { transform: translateX(-1.5px); }
  80% { transform: translateX(1px); }
  100% { transform: translateX(0); }
}
.card.nope .card-inner { animation: nope 220ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
/* Hover lift for cards you can pick up (pointer devices only). */
.card.faceup.pickable .card-inner { transition: transform 160ms var(--ease); }
@media (hover: hover) {
  .card.pickable:not(.dragging):hover .card-inner { transform: translateY(-2px); }
  .card.pickable:not(.dragging):hover .card-front { box-shadow: var(--card-shadow-lift); }
}
```

Keep:
- `.card { position… transition: transform var(--move-ms) var(--ease); … }`, adding the `perspective` line into it rather than a separate rule if you prefer;
- the `.card.stacked` rule;
- `.card-back::after`;
- the Deco `::before` from Task 1;
- the `.card.dragging` rules.

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run e2e`
Expected: all pass. The win-cascade and auto-finish tests are unaffected.

- [ ] **Step 8: Commit**

```bash
git add -A src tests e2e
git commit -m "feat(ui): real 3D flip, subtle shake when a card has no move, hover lift on pickable cards"
```

---

### Task 5: Visual verification and build

**Files:** none (verification only).

- [ ] **Step 1: Run the full suites and the build**

Run: `npx vitest run && npm run build && npm run e2e && grep -c woff2 dist/sw.js`
Expected: all pass, and the grep count is ≥ 1.

- [ ] **Step 2: Review the screenshots**

Open every PNG under `test-results/visual/` (3 tables × desktop/Pixel 7, plus the stats views). Check:
- The index is legible in fanned columns.
- The textures are visible but quiet.
- The rail and vignette show.
- The toolbar floats as one row on desktop and two rows on Pixel 7.
- The Deco back is the default.
- There's no horizontal scroll.

- [ ] **Step 3: Check the flip and shake by hand in the browser**

Start the dev server (`.claude/launch.json`, `dev` on :5173) and check:
- Draw from the stock: the card visibly turns over.
- Tap a card with no move: a subtle shake.
- Hover a face-up card on desktop: a 2px lift.

Report what you saw.
