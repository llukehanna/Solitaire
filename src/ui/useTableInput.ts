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

export function useTableInput(args: Args) {
  const a = useRef(args);
  a.current = args;
  const press = useRef<Press | null>(null);
  const lastTap = useRef<{ id: CardId; t: number } | null>(null);

  const dragPoint = (p: Press, e: PointerEvent) => ({
    x: e.clientX - p.tableLeft - p.offsetX,
    y: e.clientY - p.tableTop - p.offsetY,
  });

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const { state, positions, locked } = a.current;
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

  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = null;
    const { state, layout, positions, onTurn, onStockTap, onReject } = a.current;

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
    const now = performance.now();
    if (lastTap.current && lastTap.current.id === p.cardId && now - lastTap.current.t < DOUBLE_TAP_MS) return;
    lastTap.current = { id: p.cardId, t: now };
    const [to] = destinationsFor(state, p.pickup.from, p.pickup.count);
    if (to) onTurn([{ type: 'move', from: p.pickup.from, to, count: p.pickup.count }]);
    else onReject?.();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => finish(e, true),
  };
}
