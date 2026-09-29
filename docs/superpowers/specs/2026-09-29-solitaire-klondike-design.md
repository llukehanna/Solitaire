# Solitaire (Klondike) — Design Spec

**Date:** 2026-09-29
**Status:** Approved
**URL:** https://solitaire.lukeghanna.com (`solitare.lukeghanna.com` 308-redirects to it)

## Goal

A polished, ad-free Klondike web app that pairs Solitr-level cleanliness and speed with Solitaired-level depth: every deal guaranteed winnable, solver-backed hints, automatic finish, and local stats. Installable and fully playable offline.

## Non-goals (v1)

Other variants (FreeCell/Spider come next — engine is structured for them), daily deal/streak calendar, random (possibly unwinnable) deals, accounts, cloud sync, leaderboards, ads, monetization, achievements/XP/collectibles.

## Architecture

Static single-page app. Vite + React + TypeScript. No backend. Deployed to Vercel as static output; PWA (manifest + service worker precaching the app shell and deal bank).

```
src/
  engine/     pure rules: types, deal, moves, apply/undo, scoring. No DOM.
  solver/     search over engine types. Runs in Node (build) and a Web Worker (runtime).
  deals/      generated winnable seed bank (JSON) + random selection.
  store/      localStorage persistence: current game, settings, stats.
  ui/         React: table, cards, input (pointer/keyboard), dialogs, themes, win cascade.
scripts/
  build-deals.ts   offline seed-bank generator (worker_threads, multi-core).
tests/             Vitest unit tests; Playwright e2e.
```

Dependency direction: `ui → store → engine`, `ui → solver (via worker) → engine`, `scripts → solver → engine`. The engine imports nothing from other layers.

## Engine

- **Cards:** `{ suit: 'S'|'H'|'D'|'C', rank: 1..13 }`, id 0–51. Face-up state lives on the pile, not the card.
- **State:** `stock[]`, `waste[]`, `foundations[4]` (one per suit, fixed order ♠♥♦♣), `tableau[7]` each `{ cards[], faceUpFrom: number }`, plus `drawCount: 1|3`, `scoring: 'standard'|'vegas'|'none'`, `passes` (stock recycles), `score`, `moves`.
- **Deal:** 32-bit seed → mulberry32 PRNG → Fisher–Yates shuffle of 0–51 → standard Klondike layout (tableau column *i* gets *i+1* cards, top card face up; remaining 24 → stock). Seed fully determines the deal.
- **Moves:** `draw`, `recycle`, `waste→tableau`, `waste→foundation`, `tableau→tableau` (any face-up run), `tableau→foundation`, `foundation→tableau`. Auto-flip of a newly exposed tableau card is part of the move that exposed it (so undo restores it).
- **Rules:** tableau builds down, alternating colours; only Kings (or King-led runs) to empty columns; foundations build up by suit from Ace. Standard/none scoring: unlimited recycles. Vegas: draw-1 → 1 pass total, draw-3 → 3 passes total.
- **Undo/redo:** the engine is pure (`applyMove(state, move) → newState`). The game session keeps a stack of state snapshots, one per player turn (a turn = the player's move plus any automatic safe moves it triggered), and persists the game as seed + list of turns (replayed on load). Unlimited, no penalty; undo reverts score. Count of undos is tracked for stats.
- **Scoring (standard, Windows-style):** waste→tableau +5, waste→foundation +10, tableau→foundation +10, tableau card turned face-up +5, foundation→tableau −15, recycle −100 (draw-1) / −20 (draw-3), floor at 0. **Vegas:** −$52 per deal, +$5 per card to foundation; optional cumulative Vegas bank across games (setting).
- **Move generation:** `legalMoves(state)` returns all legal moves; `destinationsFor(state, source)` returns legal destinations for a picked-up card/run in priority order (below).
- **Safe auto-foundation:** a card is "safe" to auto-play when its rank ≤ 2, or both opposite-colour foundations are at ≥ rank − 1. Used by the auto-play setting and by the solver.
- **Win:** all four foundations complete.
- **Auto-finish trigger:** every tableau card is face up (stock/waste may still hold cards). `autoFinish(state)` (in `src/solver/`, since it may call the solver) returns the move sequence that completes the game. It tries a greedy pass first (play the lowest available card to its foundation, else draw/recycle) and falls back to the solver, which is near-instant here because nothing is hidden. Not every all-face-up position is winnable (draw-3 can bury a needed card in the stock; Vegas can run out of passes), so if neither finds a finish, auto-finish doesn't fire and play continues manually; it re-checks after each subsequent move.

## Solver

One TypeScript implementation, used at build time (Node) and at runtime (Web Worker).

- **Search:** iterative DFS with a transposition table keyed by a canonical state hash (tableau columns sorted by content so symmetric positions collapse; stock/waste encoded as position in the stock cycle).
- **Move compression and pruning:**
  - Safe foundation moves are applied automatically and not branched on (from the waste only in draw-1, where removing a waste card can't change which stock cards are reachable).
  - Stock handled as compound moves ("draw k times, then play the resulting waste card"), avoiding branching on bare draws.
  - Tableau→tableau run moves only when they expose a face-down card, empty a column that a King can use, or enable a foundation move; never move a King-led run from an empty-bottomed column to another empty column.
  - Move ordering: foundation > reveals face-down card > waste plays > other.
- **Budget:** node-count limit. Result is `{ status: 'winnable', solution: Move[] } | { status: 'unwinnable' } | { status: 'unknown' }`. Only an exhausted search yields `unwinnable`; a budget hit yields `unknown`.
- **Assumption:** solving assumes unlimited recycles (standard rules). Vegas pass limits are not guaranteed by the winnable bank; the UI labels Vegas deals accordingly.

## Deal bank

- `scripts/build-deals.ts` iterates seeds across all CPU cores, solves each with a generous budget (~seconds), and keeps only `winnable` seeds. Output: `src/deals/bank-draw1.json`, `bank-draw3.json` — `{ version, drawCount, maxNodes, entries: [seed, solutionLength][] }`.
- Target: **2,000 seeds per draw mode** at launch (far more than any player will exhaust; repeats are avoided by tracking recently played seeds). Difficulty is recorded (solution length) for future use; not exposed in v1.
- **Test:** the solver is deterministic, so banked seeds are re-solved with the bank's node budget and each solution replays through the engine to a win (a sampled subset in the fast test run; the full set in `npm run test:deals`). Solutions are not stored.
- The bank is committed to the repo; the build script is rerun only when the engine or solver changes.

## Game modes & deals

- **Winnable only:** every new game picks a random seed from the bank for the current draw mode, skipping the last 200 seeds played (`sol.v1.recent`). There is no random-deal option.
- **Restart** replays the current seed from the start.
- Settings: draw 1/3, scoring standard/Vegas/none, cumulative Vegas, auto-play safe foundation moves (default on), sound (default on), left-handed layout, four-colour deck, theme, animation speed (normal/fast/off; reduced-motion forces off).

## Solver-backed features

- **Smart hint:** worker solves from the current state (runtime budget ≈ 1.5 s). `winnable` → highlight the first move of the solution (source card pulses, destination glows). `unknown` → fall back to a heuristic hint (first move in priority order that isn't a pointless stock cycle). `unwinnable` → "No winning line from here" dialog offering **Rewind to last winnable**.
- **"Am I still winnable?"** button: runs the solver on the current state and reports winnable / not winnable / "couldn't tell in time". Also runs automatically when the player has no productive moves.
- **Rewind to last winnable:** walks back through history, running the solver on each earlier state (newest first, then binary search over the gap), and undoes to the most recent state proven `winnable`.
- **No moves left:** detected when there is no legal move except stock cycling that doesn't change the reachable card set. Shows "No moves left" → Undo / Rewind to last winnable / New game / Restart.
- The worker is started lazily, can be cancelled when the player moves, and never blocks input.

## UI & interaction

- **Layout:** stock + waste top-left, foundations top-right (mirrored in left-handed mode), 7 tableau columns below. Card size derives from the viewport width and height so the full table fits without scrolling. Long columns compress face-down and face-up offsets to fit vertically.
- **Rendering:** 52 absolutely positioned card elements keyed by card id. Position = pure function of (state, layout). Movement is CSS `transform` with transitions, so state changes animate automatically; the drag layer writes transforms directly for 60 fps. Z-order updates on move.
- **Input (Pointer Events), all active at once:**
  - **Tap/click** a card: move it (or its run) to the best destination. Priority: foundation → tableau pile where the move reveals a face-down card → non-empty tableau → empty column.
  - **Double-tap/click:** send to foundation if legal.
  - **Drag:** 5 px threshold separates tap from drag; `setPointerCapture`; `touch-action: none` on the table. The dragged card/run lifts (slight scale + shadow) and keeps the grab offset. Drop snaps to the legal pile with the largest overlap within a generous radius; an invalid drop springs back.
  - **Stock:** tap to draw; tap the empty stock to recycle.
  - **Keyboard:** arrow keys move focus across piles/cards, Enter/Space picks up then places, Esc cancels. Shortcuts: `Z`/`Ctrl+Z` undo, `Shift+Z`/`Ctrl+Y` redo, `H` hint, `D`/Space on stock draw, `N` new game.
- **Chrome:** slim top bar (New ▾, Undo, Redo, Hint, Settings, Stats) and a status line (score, moves, timer). On phones, the bar condenses to icons.
- **Timer:** always shown. Starts on the first move, pauses when the tab is hidden or a dialog is open, stops on win; elapsed time persists with the saved game.
- **Auto-finish:** as soon as the last face-down tableau card is turned up and `autoFinish` finds a finish, input locks and the remaining cards fly to the foundations automatically (≈ 80 ms stagger; instant with animations off), then the win sequence plays. Undo after the win is not offered.
- **Win:** classic bouncing-card cascade drawn on a canvas that is never cleared; tap to skip. Then a result card: time, moves, score, win streak, New game / Replay.
- **Themes (CSS custom properties + card renderer):**
  - **Classic Felt:** green felt, traditional faces using Adrian Kennard's SVG playing cards (CC0), vendored by `scripts/vendor-cards.ts` from his generator into `public/cards/classic/` (and `classic-4c/` for the four-colour deck), 52 faces + back.
  - **Modern Minimal (light & dark):** flat table, cards drawn by our own SVG renderer with large corner indices and a large centre suit; court cards show large rank letter + suit. Dark follows `prefers-color-scheme` by default.
  - Four-colour deck (♠ black, ♥ red, ♦ blue, ♣ green) applies to either theme.
- **Sound:** short flip/place/shuffle/win sounds synthesized with Web Audio (no audio files); mute toggle.
- **Accessibility:** each card has an accessible name ("7 of hearts, face up" / "face-down card"); piles are labelled regions; an `aria-live="polite"` region announces moves, hints, and results. Visible focus ring. Respects `prefers-reduced-motion`. The whole visible part of every playable card is a tap target (on phones, seven columns make fanned slivers smaller than 44 px; drag and keyboard remain available).

## Persistence (localStorage, versioned, validated on read)

- `sol.v1.game`: seed, settings snapshot, move history, redo stack, elapsed time — saved after every move; restored on load. Invalid/corrupt data is discarded (fresh game).
- `sol.v1.settings`, `sol.v1.stats` (per draw mode: played, won, win %, current/best win streak, best time, fewest moves, best score, Vegas bank), `sol.v1.recent` (last 200 seeds played per draw mode).
- All access is wrapped in try/catch; the app works with storage unavailable.

## Deployment

- Vercel project `solitaire`, framework Vite, static output.
- Domains: `solitaire.lukeghanna.com` (primary), `solitare.lukeghanna.com` → 308 redirect to primary.
- DNS lives on Cloudflare: Luke adds CNAME records `solitaire` and `solitare` → `cname.vercel-dns.com` (DNS only / grey cloud).

## Testing

- **Engine (Vitest, TDD):** deal determinism and layout, every move type's legality and edge cases (King to empty, run moves, Vegas pass limits, recycle), flip-on-expose, undo/redo round-trips restore identical state, scoring deltas, win and auto-finish trigger detection, `autoFinish` completes winnable all-face-up positions (including with cards left in stock, draw-1 and draw-3) and returns null for an unwinnable draw-3 stock arrangement, safe-auto-play rule.
- **Solver:** solves known-easy positions; proves known-dead positions unwinnable; every returned solution replays to a win; canonical hash collapses symmetric states.
- **Deal bank:** sampled replay test in the default run; full replay in `npm run test:deals`.
- **Store:** corrupt/missing/foreign-version data is handled.
- **E2E (Playwright):** load → play a banked deal to completion by driving its solution through taps; undo/redo; reload restores game (including elapsed timer); uncovering the last face-down card triggers auto-finish and the win screen; new games never repeat a recent seed; keyboard-only play of a few moves; mobile viewport layout fits without scrolling.

## Performance budgets

- Initial JS ≤ 150 KB gzipped (excluding card art, which loads per theme). LCP < 1.5 s on mid-range mobile.
- Moves animate at 60 fps on a mid-range phone; input never waits on the solver.
