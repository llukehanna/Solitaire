import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { pickSeed } from '../deals/bank';
import { applyMoves } from '../engine/apply';
import { canDraw, canRecycle } from '../engine/rules';
import type { DrawCount, Move } from '../engine/types';
import { loadSavedGame, saveGame } from '../game/persist';
import { newSession, sessionReducer, type Session } from '../game/session';
import { elapsed } from '../game/timer';
import { loadRecent, pushRecent } from '../store/recent';
import { loadSettings, saveSettings, type Settings } from '../store/settings';
import { importStats as mergeImport, loadStats, recordResult, saveStats, type ImportInput, type Stats } from '../store/stats';
import { FINISH_STEP_MS, effectiveAnimation } from './appClass';

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
  /** Hold the timer paused (e.g. while a dialog is open); visibility changes will not resume it while held. */
  holdTimer(held: boolean): void;
  /** Merge an outside Draw 1 record into the stats (once per device). */
  importStats(input: ImportInput): void;
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

  // Record a win once. A 'finishing' game is a forced win, so record on the way into 'finishing' or 'won',
  // folding the queued finish moves into the state so moves and score are final.
  const prevStatus = useRef(session.status);
  useEffect(() => {
    if (prevStatus.current === 'playing' && (session.status === 'finishing' || session.status === 'won')) record({ ...session, state: applyMoves(session.state, session.finishQueue) }, true);
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

  // Pause the timer while the tab is hidden (and keep it paused while a dialog holds it).
  const heldRef = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: 'pause', now: Date.now() });
      else if (!heldRef.current) dispatch({ type: 'resume', now: Date.now() });
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const abandonCurrent = useCallback(() => {
    const s = sessionRef.current;
    if (s.turns.length > 0 && s.status !== 'won' && s.status !== 'finishing') record(s, false);
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
    importStats: useCallback((input: ImportInput) => {
      setStats((prev) => {
        const next = mergeImport(prev, input, Date.now());
        saveStats(next);
        return next;
      });
    }, []),
    holdTimer: useCallback((held: boolean) => {
      heldRef.current = held;
      if (held) dispatch({ type: 'pause', now: Date.now() });
      else if (!document.hidden) dispatch({ type: 'resume', now: Date.now() });
    }, []),
  };
}
