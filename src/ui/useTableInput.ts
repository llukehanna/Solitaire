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
const DOUBLE_TAP_SLOP = 8;

export function useTableInput(args: Args) {
  const a = useRef(args);
  a.current = args;
  const press = useRef<Press | null>(null);
  /** Time and position of the last tap that reached the move logic, to swallow the second half of a double-tap. */
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);

  const dragPoint = (p: Press, e: PointerEvent) => ({
    x: e.clientX - p.tableLeft - p.offsetX,
    y: e.clientY - p.tableTop - p.offsetY,
  });

  /** Drop a press without committing anything: put any dragged cards back where they were. */
  function abandon(p: Press) {
    p.saved.forEach(({ el, transform, z }) => {
      el.classList.remove('dragging');
      el.style.zIndex = z;
      el.style.transform = transform;
    });
    if (press.current === p) press.current = null;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const { state, positions, locked } = a.current;
    // A press that never got its up/cancel (e.g. a second finger, or lost capture) must not wedge input.
    if (press.current && press.current.pointerId !== e.pointerId) abandon(press.current);
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

  function finish(e: PointerEvent<HTMLDivElement>, wasCancelled: boolean) {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = null;
    const { state, layout, positions, onTurn, onStockTap, onReject, locked } = a.current;
    // A modal may have opened mid-gesture: spring back instead of committing.
    const cancelled = wasCancelled || locked;

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
    // Event timestamps, not performance.now(): a busy main thread delays when we *process* the second tap of a
    // double-click, but not when it happened. Both taps are measured on the same (event) clock.
    const now = e.timeStamp;
    // The first tap of a double-click may have moved the card away, so the second one lands on whatever is
    // underneath. Ignore any tap that follows quickly at (nearly) the same spot, whatever card it hits.
    const prev = lastTap.current;
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_SLOP) return;
    lastTap.current = { x: e.clientX, y: e.clientY, t: now };
    const [to] = destinationsFor(state, p.pickup.from, p.pickup.count);
    if (to) onTurn([{ type: 'move', from: p.pickup.from, to, count: p.pickup.count }]);
    else onReject?.();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => finish(e, true),
    onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => finish(e, true),
  };
}
