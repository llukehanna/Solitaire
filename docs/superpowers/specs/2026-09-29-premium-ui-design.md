# Solitaire v1.1: Premium UI, Controls, and Stats Import

Date: 2026-09-29
Status: approved in brainstorming, pending written-spec review
Builds on: `docs/superpowers/specs/2026-09-29-solitaire-klondike-design.md` (v1, live at https://solitaire.lukeghanna.com)

## Goal

Make the game look and feel premium, as a sibling of lukeghanna.com, and fix the rough edges Luke hit in play:

1. A visual redesign with three switchable tables.
2. Cleaner, faster-to-read cards.
3. Spacebar draws from the stock.
4. A more subtle card flip.
5. A fix for the bug where a card taken off a foundation goes back to it.
6. An auto-complete you can watch, card by card.
7. A one-time import of Luke's solitaired.com Klondike stats.

Gameplay rules, the solver, the deal bank, scoring and persistence formats stay as they are, apart from the stats and settings changes listed below.

## 1. Tables

There are three tables. Each is a set of CSS custom properties on the app root: `table-studio`, `table-felt` and `table-paper`.

| Table | Background | Chrome | Accent | Text |
|---|---|---|---|---|
| **Studio** (default) | Radial glow `#2a2118` → `#151210` → `#131110`. Warm charcoal, from lukeghanna.com dark. | Glass: `linear-gradient(170deg, #ffffff12, #ffffff05)` with a `#ffffff10` hairline | Amber `#f2c14e` | `#f0ebe3` primary, `#a39d93` muted |
| **Felt** | Radial `#1d4a36` → `#123326` → `#0c241b` | Dark glass `#0000002e` with a `#ffffff12` hairline | Cream `#e9dcb8` | `#eef3ef` / `#9fb5aa` |
| **Paper** | Radial `#f5f2ec` → `#e9e6e0`, from lukeghanna.com light | Light glass `#ffffff80` with a `#0000000f` hairline | Ochre `#7a5a00` | `#151412` / `#6b675f` |

Every table defines the same token set:

- `--bg`, `--glow`, `--chrome-bg`, `--chrome-line`
- `--ink`, `--mute`, `--accent`, `--accent-soft`
- `--slot-line`, `--slot-fill`, `--slot-glyph` (empty-pile outlines and suit watermarks)
- `--card-face`, `--card-shadow`, `--card-shadow-lift`
- `--suit-red`, `--suit-black`, plus the 4-colour overrides
- `--focus`

**Switching.** A three-segment control in the top bar switches tables instantly and persists the choice in settings. Each segment is a small swatch dot with the table name as its tooltip and `aria-label`.

**Type.** Geist (UI) and Geist Mono (numbers, readouts) come from `@fontsource/geist` and `@fontsource/geist-mono`. They are self-hosted so the PWA works offline. Only weights 400/500/600 and the Latin subset ship.

**Easing.** Motion uses `--ease: cubic-bezier(.32,.72,0,1)`, the site's own curve.

## 2. Cards

**Face.** One design, "corner + pip", drawn in HTML/CSS rather than SVG:

- Rank and suit sit top-left in Geist 600: rank about 0.28 × card width, suit just below. This is the only index, placed where it stays visible when cards are fanned in a column.
- One large suit pip sits bottom-right, about 0.47 × card width.
- J, Q and K use the letter as their rank. There is no court art.
- Corner radius is 4px at the reference card width of 72px, scaled proportionally (`calc(var(--card-w) * 0.055)`).
- Face colour: `#f7f3ec` on Studio and Felt, `#ffffff` on Paper.
- The four-colour-suits setting stays: diamonds `#1565c0`, clubs `#2e7d32` (the existing `.four-color` values; faces are always light, so no dark variants are needed).

**Backs.** A new setting, `cardBack`:

| Value | Look |
|---|---|
| `amber` (default) | Amber hatch on dark brown |
| `ink` | Near-black with a centred amber dot |
| `oxblood` | Deep red with a thin inner border |
| `navy` | Blue lattice |

Each back has a 6px inset frame. These are the four backs Luke saw in the brainstorm (`.superpowers/brainstorm/.../cards.html`).

**Shadows.** A resting card uses `--card-shadow`. A picked-up or dragged card uses `--card-shadow-lift`, which is deeper and more diffuse, plus a 1.03 scale.

**Removed.**
- `public/cards/classic*`, `scripts/vendor-cards.ts`, `CardFront`'s `<img>` path, and `src/ui/cards/minimal.ts`: the new face replaces the SVG decks.
- The CC0 attribution in the About/Settings copy, which is no longer needed.

## 3. Chrome

**Top bar.** Frosted glass, `backdrop-filter: blur(16px) saturate(140%)`, over `--chrome-bg`, 52px tall with a hairline bottom border. From left to right:

- Wordmark "Solitaire", Geist 600, -0.01em tracking.
- New (the existing menu: New game, Restart, Draw 1/3), Undo, Redo, Hint, Winnable?
- Spacer.
- Readout in Geist Mono: `Score 0 · Moves 12 · 1:04`, plus a small `Draw 1` pill in `--accent-soft`/`--accent`.
- Table switch, Stats, Settings.

Below 640px wide, the buttons collapse to icon-only and the readout moves to a slim bar under the top bar, replacing today's bottom `StatusBar`.

**Dialogs.** Modals become glass sheets: 16px radius, `--chrome-bg` over a 40% scrim, entering with 8px rise plus fade over 220ms `--ease`. Stats and Result lay their numbers out in Geist Mono tables with the site's uppercase-label style (`ABOUT 01` pattern: 11px, +0.12em tracking, muted).

**Toasts.** Glass pills, bottom-centre.

**Empty slots.** A 1px `--slot-line` outline with a faint suit watermark on foundations. The stock, when recyclable, shows a thin circular-arrow glyph.

**Settings changes.**
- `theme: 'classic'|'minimal'` and `colorMode: 'auto'|'light'|'dark'` are replaced by `table: 'studio'|'felt'|'paper'`.
- `cardBack` (above) is added.
- `parseSettings` migrates old values, as the table shows.

| Stored v1 value | Becomes `table` |
|---|---|
| `theme: 'classic'` | `felt` |
| `theme: 'minimal'`, `colorMode: 'light'` | `paper` |
| `theme: 'minimal'`, `colorMode: 'dark'` | `studio` |
| `theme: 'minimal'`, `colorMode: 'auto'` | `paper` if `prefers-color-scheme: light` at migration time, else `studio` |
| Nothing stored | `studio` |

Migration happens once on load, and the migrated settings are saved immediately. The manifest `theme_color` becomes Studio's `#131110` (it is static); the `<meta name="theme-color">` tag is updated at runtime to the active table's base background.

## 4. Motion

- **Moves.** Card moves take `--move-ms` = 240ms (fast: 130ms) with `--ease`.
- **Flip.** The current 3D Y-rotation (260ms) is replaced by a subtle reveal: the face fades in over the back while the card scales 0.96 → 1, over 140ms (fast: 90ms), with no perspective or rotation.
- **Auto-complete.** Once the session enters `finishing`:
  - One card leaves every `FINISH_STEP_MS` (normal 110ms, fast 70ms).
  - Each card travels with the normal move transition, so a new card starts before the previous one lands and the sequence reads as a quick, continuous stream.
  - A 40-card finish takes about 4.4s at normal speed.
  - The win celebration (`WinCascade` and the result dialog) waits until the last card has landed: last step plus `--move-ms`.
  - **Ruling:** today, `prefers-reduced-motion` forces animation `off`, so the finish is instant. That is likely what Luke saw. From now on, reduced motion drops to `fast` pacing for moves and the finish instead of `off`, and only the explicit Animation: Off setting makes the finish instant. Reduced motion still disables `WinCascade`.

## 5. Controls

- **Space** draws from the stock (the same as clicking the stock, including the recycle when it's empty) whenever focus is not on a button, input or other form control. Settings gains a short "Keyboard" section listing: Space draw, Enter pick up/drop, arrows move focus, Esc cancel, Ctrl/Cmd+Z undo (whatever `useKeyboard` actually binds, verified at implementation).
- **Enter** alone now picks up and drops the focused card in the keyboard model. Space no longer does.
- Tap, click and drag behaviour does not change.

## 6. Bug: foundation → tableau bounces back

**Symptom.** Moving a card from a foundation down to a tableau column doesn't stick.

**Hypothesis.** The `turn` action with `autoPlay: true` runs `applySafeMoves` after the player's move. The card just taken off the foundation is often "safe" (low rank, or opposing foundations high enough), so auto-play immediately sends it back up.

**Fix.**
1. Reproduce it first, with a failing session-level test and in the browser.
2. When a player's turn includes a move whose source is a foundation, `applySafeMoves` for that turn excludes the moved card(s) from auto-play. Other safe cards still auto-play. The card becomes eligible again from the next player turn onward.
3. The fix needs a regression test in `tests/game/session.test.ts`.

If reproduction shows a different cause, fix that cause instead. The requirement is that a foundation → tableau move sticks, with auto-play on.

## 7. Stats import from solitaired.com

These values were read on 2026-09-29 from `localStorage['personal-stats-solitaire-klondike-turn-1']` and the profile at solitaired.com for user `lukehanna`:

| Field | Value |
|---|---|
| Games started | 5,561 |
| Games won | 4,089 (73.5%) |
| Fastest win | 34s |
| Fewest moves | 102 |

No Turn 3 data exists, and the best streak isn't exposed. Solitaired's score is lower-is-better and isn't comparable to our scoring, so it isn't imported.

**UI.** The Stats dialog gets an "Import from solitaired.com" button, which opens a small form:

| Field | Prefill |
|---|---|
| Games played | 5561 |
| Games won | 4089 |
| Fastest win (m:ss) | 0:34 |
| Fewest moves | 102 |
| Mode | Draw 1 (read-only) |

All fields are editable. Validation: non-negative integers, won ≤ played, and time as `m:ss`. Confirm and Cancel buttons.

**Merge rules.** `importStats(stats, input)` is pure and unit-tested:

- `played += input.played`
- `won += input.won`
- `bestTimeMs = min(existing, input.timeMs)`
- `fewestMoves = min(existing, input.moves)`
- `currentStreak`, `bestStreak`, `bestScore` and `vegasBank` are unchanged.

**Double counting.** The stats record gains `imported?: { source: 'solitaired', at: number }` on `draw1`, and the stats version bumps to `v: 2`. `parseStats` accepts `v: 1` and upgrades it to `v: 2` with no `imported` marker. Once the marker is set, the button reads "Imported from solitaired.com on <date>" and is disabled. Reset stats clears the marker.

**Privacy.** The prefill values ship in the bundle as constants. That's acceptable: it's Luke's own site and these are public profile-level numbers, and other visitors see the same prefilled form but only affect their own device by confirming it.

## 8. Testing and verification

**Unit (Vitest):**
- Settings migration table (every row above).
- `importStats` merge, the marker, and v1 → v2 parse.
- The foundation-bounce regression.
- The finish pacing constant is honoured by the effective-animation mapping (reduced motion → `fast`, Off → 0).

**E2E (Playwright, desktop + Pixel 7):**
- Space draws from the stock.
- Enter picks up and drops.
- The table switch changes the root class and persists across reload.
- A foundation → tableau move sticks.
- The import dialog adds the numbers and then disables itself.
- Existing specs are updated for the new selectors.

**Visual check:** all three tables on desktop and phone widths via Playwright screenshots, reviewed before merge.

**Build:** a Lighthouse PWA/offline sanity check: fonts load offline after the first visit.

## Out of scope

- Court-card art.
- Custom backgrounds or images.
- Syncing stats across devices.
- Importing other solitaired games or Turn 3.
- New game variants.
