import { useEffect, useRef } from 'react';
import type { CardId } from '../engine/cards';
import type { Theme } from '../store/settings';
import { classicCardUrl } from './CardFront';
import { minimalCardSvg, type Palette } from './cards/minimal';
import type { Layout } from './layout';

interface Props {
  layout: Layout;
  theme: Theme;
  fourColor: boolean;
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
export function WinCascade({ layout, theme, fourColor, onDone }: Props) {
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
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(canvas);
    const v = (name: string) => css.getPropertyValue(name).trim() || '#000';
    const pal: Palette = { S: v('--suit-S'), H: v('--suit-H'), D: v('--suit-D'), C: v('--suit-C'), face: v('--card-face'), edge: v('--card-edge') };
    const images = new Map<CardId, HTMLImageElement>();
    for (let id = 0; id < 52; id++) {
      const img = new Image();
      img.src =
        theme === 'classic'
          ? classicCardUrl(id, fourColor)
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(minimalCardSvg(id, pal))}`;
      images.set(id, img);
    }

    const queue: { id: CardId; x: number; y: number }[] = [];
    for (let rank = 13; rank >= 1; rank--) {
      for (let f = 0; f < 4; f++) queue.push({ id: f * 13 + rank - 1, ...layout.foundations[f] });
    }
    const live: Particle[] = [];
    let frame = 0;
    let raf = 0;

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
          if (img.complete && img.naturalWidth) ctx.drawImage(img, p.x, p.y, layout.cardW, layout.cardH);
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
    return () => cancelAnimationFrame(raf);
  }, [layout, theme, fourColor]);

  return <canvas ref={ref} className="win-cascade" aria-hidden="true" onPointerDown={() => done.current()} />;
}
