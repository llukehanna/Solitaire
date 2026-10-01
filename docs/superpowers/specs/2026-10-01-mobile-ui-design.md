# Solitaire v1.3: Phone Layout

Date: 2026-10-01
Status: approved in brainstorming, pending written-spec review
Builds on: `docs/superpowers/specs/2026-09-29-studio-deluxe-design.md` (v1.2) and the tabbed Settings now on `main`
Reference: Shedquarters (`~/Claude Projects/ELO`) — one responsive PWA, CSS-first switching, floating glass tab bar, bottom sheets on phones

## Goal

On a portrait phone the game is a shrunk desktop: 45px cards with a 12px rank, a two-row toolbar at the top out of thumb reach, and the bottom ~60% of the screen empty. v1.3 gives phones a real layout in the same app, the way Shedquarters does: same component tree, CSS picks the chrome, no native wrapper.

The headline problem is **"everything feels very small"**. Seven Klondike columns cap a card at ~52px on a 375px screen, so width alone can't fix it. The fix is to max out width *and* enlarge what the eye actually reads (the top strip of each fanned card), using the empty vertical space.

## Scope

- **In:** portrait phones (≤ 640px wide), installed PWA and mobile browser.
- **Out:** a designed landscape-phone layout (the installed app is locked to portrait; in a mobile browser, landscape falls back to the existing layout, which fits by height and stays playable). Native/store builds. Tablet and desktop behaviour — unchanged.

## 1. Deciding "phone"

One query, defined once in `src/ui/media.ts`:

```ts
export const PHONE_QUERY = '(max-width: 640px) and (orientation: portrait)';
```

- **CSS** uses the same condition (`@media (max-width: 640px) and (orientation: portrait)`) for all chrome and card-face switching. Both the desktop toolbar and the phone chrome always render; CSS hides one. JS never decides first paint.
- **JS:** `usePhone()` (in `media.ts`, `matchMedia` + change listener, SSR-safe default `false`) feeds `computeLayout`. It's the only JS consumer.

## 2. Table geometry (portrait profile)

`computeLayout(width, height, leftHanded, phone)` gains a fourth argument. With `phone = false` the output is byte-for-byte today's.

With `phone = true`:

| Value | Desktop (today) | Phone |
| --- | --- | --- |
| Margin | `clamp(6, width × 0.02, 24)` | `3px` |
| Column gap | `cardW × 0.14` | `3px` |
| Card width | `min(byWidth, byHeight, 150)`, floored | same formula with the phone margin/gap (height rarely binds) |
| Aspect ratio | 1.4 | 1.4 (taller cards cost height and buy nothing in the tableau) |
| Face-down step | `cardH × 0.12` | `cardH × 0.10` |
| Face-up step | `cardH × 0.26` | `cardH × 0.40` |
| Draw-3 waste fan | `cardW × 0.22` | `cardW × 0.45` (rank fully visible with the side-by-side index; still clears the next slot) |

Resulting card widths: 375px → 50px (from 45), 390/393px → 52px, 412px → 55px, 430px → 58px.

- `columnOffsets` keeps its overflow squeeze (min factor 0.2). It reads the steps from the layout instead of hard-coding them, so `Layout` gains `downStep` and `upStep` fractions.
- The table area (`.table-wrap`) on phones sits between the readout strip and the thumb bar (CSS grid rows), so `useSize` already measures the right box and `tableauBottom` lands above the bar with no extra maths.

## 3. Card face at phone size

CSS-only, inside the phone media query, on the existing `CardFront` markup (no new DOM):

- **Index becomes one row across the top strip:** `.face-index` spans `left: cardW × 0.06` to `right: cardW × 0.06`, `flex-direction: row`, `justify-content: space-between`, `align-items: flex-start`, top `cardW × 0.04`.
- **Rank:** `font-size: cardW × 0.42` (21px at 50px; today 12px), `letter-spacing: -0.06em`.
- **Suit:** `cardW × 0.32` square (16px; today 7px), top-right.
- **Centre pip:** moves to bottom-centre, `cardW × 0.50`, bottom `cardW × 0.10`. Only the top card of a pile shows it.
- The index block is `cardW × 0.47` tall, which fits inside the face-up step (`cardH × 0.40` = `cardW × 0.56`), so every fanned card shows its full rank and suit.
- Four-colour suits, keyline, grain and the 3D flip are unchanged.

## 4. Chrome

### Readout strip (top)

- `Readout` renders in its own glass strip on phones: `top: calc(6px + env(safe-area-inset-top))`, inset 8px each side, height 30px, `border-radius: 15px`, the toolbar's glass background/border/blur per table.
- Same content as today (score, Vegas tag, moves, time, draw pill), 12px mono, spaced evenly. Draw pill stays tappable-looking but inert (switching draw lives in the New sheet).
- The desktop `.toolbar` is `display: none` under the phone query.

### Thumb bar (bottom) — new `ThumbBar.tsx`

- Floating glass bar: `left/right: 12px`, `bottom: calc(10px + env(safe-area-inset-bottom))`, height 56px, `border-radius: 28px`, same glass treatment as the toolbar.
- Five equal slots, each ≥ 44 × 44px, icon (22px) over a 10.5px label:
  1. **New** → opens the Game sheet
  2. **Undo** (disabled when nothing to undo)
  3. **Hint** (label becomes "Thinking…" and disabled while the solver works, as today)
  4. **Redo** (disabled when nothing to redo)
  5. **More** → opens the More sheet
- Same callbacks as `Toolbar`; App passes one handler set to both. Buttons blur after a pointer click, as `TbButton` does, so Space still draws.
- `display: none` outside the phone query.
- The table switch is not in the bar; the Appearance tab in Settings already has the table picker.

### Sheets — new `GameSheet.tsx`, `MoreSheet.tsx`

Thin wrappers over `Modal`:

- **Game sheet:** "New game", "Restart this deal", and a Draw 1 / Draw 3 segmented control (`role="radiogroup"`). Each action closes the sheet.
- **More sheet:** "Stats", "Settings", "Winnable?" (disabled while the solver is busy). Picking Stats/Settings closes More, then opens that dialog.

## 5. Dialogs become bottom sheets

`Modal` keeps the native `<dialog>` (focus trap, Esc, backdrop click all still work). Under the phone query only:

- **Presentation (CSS):** `margin: auto 0 0`, `width: 100%`, `max-width: 100%`, `max-height: 88dvh`, `border-radius: 16px 16px 0 0`, `padding-bottom: env(safe-area-inset-bottom)`, body scrolls inside. Enters with a 240ms slide up on the site easing; `prefers-reduced-motion` gets no slide.
- **Handle:** a 36 × 4px rounded bar centred at the top of the card, rendered always and hidden outside the phone query.
- **Swipe to dismiss (JS, in `Modal`):** pointer down on the handle or title row starts a drag; the card follows the finger downward only (`translateY`, no upward overshoot). Release past 80px or with downward velocity > 0.5 px/ms calls `onClose`; otherwise it springs back (180ms). Scrolling content inside the body never starts a drag. If the dialog is closed programmatically mid-drag, the drag state resets.
- Applies to every dialog: Settings, Stats, Result, No Moves, Import, and the two new sheets.

## 6. PWA, install hint, haptics

- **Manifest:** add `orientation: 'portrait'` in `vite.config.ts`. `index.html` already has `viewport-fit=cover`, `apple-mobile-web-app-capable` and the translucent status bar (commit `1f4c5ac`).
- **Install hint — new `InstallHint.tsx`:**
  - Shows only when: phone query matches, not standalone (`display-mode: standalone` or `navigator.standalone`), not dismissed, and the player has finished at least one game (`stats.draw1.played + stats.draw3.played ≥ 1`) so it never interrupts a first game.
  - A small glass card floating just above the thumb bar with a close button.
  - **iOS** (UA check, as Shedquarters does): "Install: tap Share, then Add to Home Screen."
  - **Android/Chrome:** captures `beforeinstallprompt`; shows an "Install" button that calls `prompt()`. If the event never fires, the hint doesn't show on that browser.
  - Dismissal (close or install) persists under a new key `sol.v1.installHint` via `store/storage.ts`.
- **Haptics — new `src/ui/haptics.ts`:** `buzz('reject' | 'win')` → `navigator.vibrate(12)` / `navigator.vibrate([20, 40, 20])`. No-op when `vibrate` is missing (iOS Safari) or `settings.sound` is off. Called next to the existing `playSound('nope')` and `playSound('win')` in `App.tsx`.

## 7. Error handling

- Missing `matchMedia`, `vibrate`, or `beforeinstallprompt` degrade silently.
- Storage failures go through the existing `readJSON`/`writeJSON` guards; worst case the install hint can show again.
- A sheet mid-drag when the game locks or the dialog closes resets cleanly.
- Keyboard shortcuts are unchanged on every size.

## 8. Testing

**Unit (`tests/ui/layout.test.ts`):**
- Phone profile at 375×650 and 390×680 table sizes: `cardW ≥ 50` / `≥ 52`; seven columns plus gaps fit within `width`; `tableauBottom ≤ height`.
- Phone face-up step is `0.40 × cardH`; a column with 6 face-down and 13 face-up cards squeezes and still ends at or above `tableauBottom`.
- Draw-3 waste fan on phone: third waste card's right edge stays left of the next slot (right- and left-handed).
- `phone = false` matches today's output for a desktop size (regression snapshot of the numbers).

**E2E (`e2e/game.spec.ts`), mobile project (Pixel 7, already configured):**
- Thumb bar visible, desktop toolbar hidden, readout strip visible.
- New → Game sheet → Restart resets moves to 0; Draw 3 switches the draw pill.
- More → Settings opens as a bottom sheet (card bottom edge at viewport bottom); a downward swipe on the handle closes it.
- Undo/Hint/Redo work from the thumb bar.
- Layout fits without scrolling (existing test, now with the bar).
- Card width ≥ 50px and a fanned face-up card shows ≥ `0.40 × cardH` of itself.

**E2E, desktop project:** thumb bar and readout strip hidden; existing suite passes untouched.

**Visual (`e2e/visual.spec.ts`):** all three tables in portrait at 375×812 (iPhone SE/mini class) and 412×915 (Pixel 7), plus Settings open as a sheet. Reviewed before merge, along with a manual check in the browser pane at phone size.

## Files

- New: `src/ui/media.ts`, `src/ui/ThumbBar.tsx`, `src/ui/dialogs/GameSheet.tsx`, `src/ui/dialogs/MoreSheet.tsx`, `src/ui/InstallHint.tsx`, `src/ui/haptics.ts`
- Changed: `src/ui/layout.ts`, `src/ui/Table.tsx`, `src/ui/dialogs/Modal.tsx`, `src/App.tsx`, `src/store/storage.ts` (new key), `src/styles/chrome.css`, `src/styles/table.css`, `vite.config.ts`, tests as above
