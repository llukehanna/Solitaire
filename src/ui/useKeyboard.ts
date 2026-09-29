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
