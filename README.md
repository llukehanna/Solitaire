# Solitaire

[![CI](https://github.com/llukehanna/Solitaire/actions/workflows/ci.yml/badge.svg)](https://github.com/llukehanna/Solitaire/actions/workflows/ci.yml)

Ad-free Klondike where every deal is guaranteed winnable. Live at [solitaire.lukeghanna.com](https://solitaire.lukeghanna.com).

Installable PWA, fully playable offline, built for both desktop and one-handed phone play.

## What makes it interesting

**Every deal is winnable, provably.** A build-time script solves thousands of seeds across all CPU cores and banks only the ones with a proven solution. The tests replay each banked solution through the engine to a win.

**One solver, two runtimes.** The same TypeScript search runs in Node to build the deal bank and in a Web Worker at runtime. Iterative DFS with a transposition table keyed on a canonical state hash, safe foundation moves applied without branching, and stock draws compressed into compound moves.

**Solver-backed play.** Hints come from an actual solution, not a heuristic. "Am I still winnable?" answers honestly (winnable, not winnable, or couldn't tell in time). "Rewind to last winnable" walks back through history and undoes to the most recent position the solver proves is still winnable.

**Pure engine.** `applyMove(state, move) → newState`, no DOM. A game persists as seed plus turns and replays on load, so undo, redo, and restore are exact.

## Stack

- **Vite** + **React 19** + **TypeScript**, no backend
- **vite-plugin-pwa** (Workbox) for offline and install
- **Vitest** unit tests, **Playwright** e2e and visual tests
- Served as **Cloudflare Workers static assets** (`npm run deploy`); headers live in `public/_headers`

## Layout

```
src/engine/   rules, deal, move generation, apply/undo, scoring
src/solver/   search, auto-finish, rewind; runs in a Web Worker
src/deals/    banked winnable seeds (draw 1 and draw 3)
src/game/     session, history, persistence
src/store/    settings, stats, recently played seeds
src/ui/       table, cards, pointer/keyboard input, dialogs, themes
scripts/      deal-bank generator, solver benchmark, icon generation
```

## Running locally

Requires Node 24+.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (sampled deal-bank replay) |
| `npm run test:deals` | Replay every banked deal to a win |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run deals` | Regenerate the winnable deal bank |
| `npm run build` | Typecheck and production build |
