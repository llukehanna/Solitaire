import { useEffect, useRef } from 'react';
import type { CardId } from '../engine/cards';
import { paintFace, type FacePalette } from './cards/paint';
import type { Layout } from './layout';

interface Props {
  layout: Layout;
  onDone(): void;
}

interface Particle {
  id: CardId;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The classic bouncing-card cascade: cards leave the foundations K→A and trail across a canvas that is never cleared. */
export function WinCascade({ layout, onDone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      done.current();
      return;
    }
    let cancelled = false;
    let raf = 0;
    // Card faces are painted in Geist, so wait for the font before pre-rendering them.
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.scale(dpr, dpr);

      const css = getComputedStyle(canvas);
      const v = (name: string) => css.getPropertyValue(name).trim() || '#000';
      const pal: FacePalette = { S: v('--suit-S'), H: v('--suit-H'), D: v('--suit-D'), C: v('--suit-C'), face: v('--card-face'), font: v('--font-ui') || 'sans-serif' };
      const images = new Map<CardId, HTMLCanvasElement>();
      for (let id = 0; id < 52; id++) {
        const c = document.createElement('canvas');
        c.width = Math.round(layout.cardW * dpr);
        c.height = Math.round(layout.cardH * dpr);
        const cc = c.getContext('2d');
        if (cc) {
          cc.scale(dpr, dpr);
          paintFace(cc, id, layout.cardW, layout.cardH, pal);
        }
        images.set(id, c);
      }

      const queue: { id: CardId; x: number; y: number }[] = [];
      for (let rank = 13; rank >= 1; rank--) {
        for (let f = 0; f < 4; f++) queue.push({ id: f * 13 + rank - 1, ...layout.foundations[f] });
      }
      const live: Particle[] = [];
      let frame = 0;

      const tick = () => {
        if (frame++ % 10 === 0 && queue.length) {
          const q = queue.shift()!;
          live.push({ ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 6), vy: -2 - Math.random() * 8 });
        }
        for (let i = live.length - 1; i >= 0; i--) {
          const p = live[i];
          for (let k = 0; k < 2; k++) {
            p.vy += 0.5;
            p.x += p.vx;
            p.y += p.vy;
            if (p.y + layout.cardH > h) {
              p.y = h - layout.cardH;
              p.vy *= -0.8;
            }
            const img = images.get(p.id)!;
            ctx.drawImage(img, p.x, p.y, layout.cardW, layout.cardH);
          }
          if (p.x > w || p.x + layout.cardW < 0) live.splice(i, 1);
        }
        if (!queue.length && !live.length) {
          done.current();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    // Escape, Enter or Space skips the cascade, same as a tap.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        done.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [layout]);

  return <canvas ref={ref} className="win-cascade" aria-hidden="true" onPointerDown={() => done.current()} />;
}
