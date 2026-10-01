import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { PHONE_QUERY } from '../media';

export const DISMISS_PX = 80;
/** px per ms, measured over the last pointer move. */
export const DISMISS_VELOCITY = 0.5;

export function shouldDismiss(dy: number, velocity: number): boolean {
  if (dy <= 0) return false;
  return dy >= DISMISS_PX || velocity > DISMISS_VELOCITY;
}

interface Drag {
  id: number;
  y0: number;
  y: number;
  t: number;
  v: number;
}

/** Drag a bottom sheet down by its handle/title to close it. Phones only; the body's own scrolling never starts a drag. */
export function useSheetDrag(card: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const drag = useRef<Drag | null>(null);
  const settle = (animate: boolean) => {
    const el = card.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 180ms var(--ease)' : '';
    el.style.transform = '';
  };
  useEffect(() => {
    if (!open) {
      drag.current = null;
      settle(false);
    }
  }, [open]);

  const end = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!cancelled && shouldDismiss(d.y - d.y0, d.v)) onClose(); // closing resets the transform via the effect above
    else settle(true);
  };

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || !window.matchMedia?.(PHONE_QUERY).matches) return;
      drag.current = { id: e.pointerId, y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
      if (card.current) card.current.style.transition = 'none';
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dt = e.timeStamp - d.t;
      if (dt > 0) d.v = (e.clientY - d.y) / dt;
      d.y = e.clientY;
      d.t = e.timeStamp;
      if (card.current) card.current.style.transform = `translateY(${Math.max(0, d.y - d.y0)}px)`;
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
  };
}
