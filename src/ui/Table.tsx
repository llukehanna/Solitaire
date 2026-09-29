import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SUITS, type CardId } from '../engine/cards';
import { canRecycle } from '../engine/rules';
import type { GameState, Move } from '../engine/types';
import type { Settings } from '../store/settings';
import { Card } from './Card';
import { pileCards } from './focus';
import { SUIT_PATHS } from './cards/suits';
import { cardPositions, computeLayout, pickupIds, pileRect, slotRect, type CardPos, type Layout, type PileKey } from './layout';
import type { Focus, Hint, Selection } from './types';
import { useSize } from './useSize';
import { useTableInput } from './useTableInput';
import { WinCascade } from './WinCascade';

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
  celebrate?: boolean;
  onCelebrated?(): void;
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
  // One stable ref callback per card, so memo(Card) isn't defeated by a fresh inline function on every render.
  const cardRefs = useRef<((el: HTMLDivElement | null) => void)[]>([]);
  if (cardRefs.current.length === 0) {
    cardRefs.current = Array.from({ length: 52 }, (_, id) => (el) => {
      if (el) cardEls.current.set(id, el);
      else cardEls.current.delete(id);
    });
  }
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
  // Cards buried in the stock, waste or a foundation sit at one position; only the top two draw a shadow so the pile doesn't halo.
  const stackedIds = useMemo(() => {
    const out = new Set<CardId>();
    for (const k of PILES) {
      if (k[0] === 'T') continue;
      const cards = pileCards(p.state, k);
      for (let i = 0; i < cards.length - 2; i++) out.add(cards[i]);
    }
    return out;
  }, [p.state]);

  // When keyboard focus starts, move DOM focus to the table so aria-activedescendant is announced.
  useEffect(() => {
    if (p.focus && ref.current && document.activeElement === document.body) ref.current.focus({ preventScroll: true });
  }, [p.focus]);

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
          const empty = pileCards(p.state, k).length === 0;
          return (
            <div
              key={k}
              id={`pile-${k}`}
              data-slot={k}
              className={`slot${p.focus?.pile === k && activeId === `pile-${k}` ? ' focused' : ''}`}
              role="img"
              {...(empty ? { 'aria-label': `${pileLabel(k)}, empty` } : { 'aria-hidden': true })}
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
            ref={cardRefs.current[id]}
            id={id}
            pos={positions.get(id)!}
            width={layout.cardW}
            height={layout.cardH}
            moving={moving.has(id)}
            hinted={hinted.has(id)}
            focused={activeId === `card-${id}`}
            selected={selected.has(id)}
            stacked={stackedIds.has(id)}
          />
        ))}
      {hintTarget && (
        <div
          className="hint-target"
          aria-hidden="true"
          style={{ transform: `translate(${hintTarget.x}px, ${hintTarget.y}px)`, width: hintTarget.w, height: hintTarget.h }}
        />
      )}
      {layout && p.celebrate && (
        <WinCascade layout={layout} onDone={() => p.onCelebrated?.()} />
      )}
    </div>
  );
}
