import type { CardId } from '../engine/cards';
import type { Column, GameState, PileId } from '../engine/types';

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Layout {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  gap: number;
  stock: Point;
  waste: Point;
  foundations: Point[];
  tableau: Point[];
  tableauBottom: number;
  wasteFan: number;
}
export type PileKey = PileId | 'S';
export interface CardPos {
  x: number;
  y: number;
  z: number;
  faceUp: boolean;
  pile: PileKey;
  index: number;
}

const RATIO = 1.4;
const GAP_RATIO = 0.14;

export function computeLayout(width: number, height: number, leftHanded: boolean): Layout {
  const margin = Math.max(6, Math.min(24, width * 0.02));
  const byWidth = (width - 2 * margin) / (7 + 6 * GAP_RATIO);
  const byHeight = (height - 2 * margin) / (RATIO * 3.3);
  const cardW = Math.floor(Math.max(30, Math.min(byWidth, byHeight, 150)));
  const cardH = Math.round(cardW * RATIO);
  const gap = Math.round(cardW * GAP_RATIO);
  const left = Math.round((width - (7 * cardW + 6 * gap)) / 2);
  const colX = (i: number) => left + i * (cardW + gap);
  const top = Math.round(margin);
  const stockCol = leftHanded ? 6 : 0;
  const wasteCol = leftHanded ? 4 : 1;
  const firstFoundation = leftHanded ? 0 : 3;
  const tableauY = top + cardH + Math.round(gap * 1.5);
  return {
    width,
    height,
    cardW,
    cardH,
    gap,
    stock: { x: colX(stockCol), y: top },
    waste: { x: colX(wasteCol), y: top },
    foundations: [0, 1, 2, 3].map((i) => ({ x: colX(firstFoundation + i), y: top })),
    tableau: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: colX(i), y: tableauY })),
    tableauBottom: height - margin,
    wasteFan: Math.round(cardW * 0.22),
  };
}

/** Vertical step after a face-down / face-up card in this column, shrunk if the column would overflow. */
export function columnOffsets(L: Layout, col: Column): { down: number; up: number } {
  const down = L.cardH * 0.12;
  const up = L.cardH * 0.26;
  const faceDown = col.faceUpFrom;
  const faceUpSteps = Math.max(0, col.cards.length - col.faceUpFrom - 1);
  const need = faceDown * down + faceUpSteps * up;
  const avail = L.tableauBottom - L.tableau[0].y - L.cardH;
  if (need <= avail || need === 0) return { down, up };
  const k = Math.max(0.2, avail / need);
  return { down: down * k, up: up * k };
}

export function cardPositions(s: GameState, L: Layout): Map<CardId, CardPos> {
  const out = new Map<CardId, CardPos>();
  s.stock.forEach((id, i) => out.set(id, { x: L.stock.x, y: L.stock.y, z: i, faceUp: false, pile: 'S', index: i }));

  const visible = s.drawCount === 3 ? Math.min(3, s.waste.length) : 1;
  const firstFanned = s.waste.length - visible;
  s.waste.forEach((id, i) =>
    out.set(id, {
      x: L.waste.x + Math.max(0, i - firstFanned) * L.wasteFan,
      y: L.waste.y,
      z: 100 + i,
      faceUp: true,
      pile: 'W',
      index: i,
    }),
  );

  s.foundations.forEach((f, fi) =>
    f.forEach((id, i) =>
      out.set(id, { x: L.foundations[fi].x, y: L.foundations[fi].y, z: 200 + i, faceUp: true, pile: `F${fi}`, index: i }),
    ),
  );

  s.tableau.forEach((col, ci) => {
    const { down, up } = columnOffsets(L, col);
    let y = L.tableau[ci].y;
    col.cards.forEach((id, i) => {
      const faceUp = i >= col.faceUpFrom;
      out.set(id, { x: L.tableau[ci].x, y, z: 300 + i, faceUp, pile: `T${ci}`, index: i });
      y += faceUp ? up : down;
    });
  });
  return out;
}

/** Cards to z-boost after a layout change: every card in any pile that received a card, so a pile's order holds. */
export function boostedIds(prev: Map<CardId, CardPos>, next: Map<CardId, CardPos>): CardId[] {
  const received = new Set<PileKey>();
  for (const [id, pos] of next) if (prev.get(id)?.pile !== pos.pile) received.add(pos.pile);
  if (received.size === 0) return [];
  const out: CardId[] = [];
  for (const [id, pos] of next) if (received.has(pos.pile)) out.push(id);
  return out;
}

export function slotRect(L: Layout, pile: PileKey): Rect {
  const at = (p: Point): Rect => ({ x: p.x, y: p.y, w: L.cardW, h: L.cardH });
  if (pile === 'S') return at(L.stock);
  if (pile === 'W') return at(L.waste);
  const i = Number(pile.slice(1));
  return at(pile[0] === 'F' ? L.foundations[i] : L.tableau[i]);
}

export function pileRect(s: GameState, L: Layout, pile: PileId): Rect {
  if (pile[0] !== 'T') return slotRect(L, pile);
  const i = Number(pile.slice(1));
  const col = s.tableau[i];
  const { down, up } = columnOffsets(L, col);
  let h = L.cardH;
  for (let idx = 0; idx < col.cards.length - 1; idx++) h += idx >= col.faceUpFrom ? up : down;
  return { x: L.tableau[i].x, y: L.tableau[i].y, w: L.cardW, h };
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Largest overlap wins; otherwise the nearest candidate within one card width. */
export function pickDropTarget(s: GameState, L: Layout, drag: Rect, candidates: PileId[]): PileId | null {
  let best: PileId | null = null;
  let bestArea = 0;
  for (const p of candidates) {
    const a = overlapArea(drag, pileRect(s, L, p));
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  if (best) return best;
  const cx = drag.x + drag.w / 2;
  const cy = drag.y + drag.h / 2;
  let bestDist = L.cardW;
  for (const p of candidates) {
    const r = pileRect(s, L, p);
    const px = r.x + r.w / 2;
    const py = Math.min(Math.max(cy, r.y), r.y + r.h);
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function pickupAt(s: GameState, pos: CardPos): { from: PileId; count: number } | null {
  if (!pos.faceUp || pos.pile === 'S') return null;
  if (pos.pile === 'W') return pos.index === s.waste.length - 1 ? { from: 'W', count: 1 } : null;
  if (pos.pile[0] === 'F') {
    const f = s.foundations[Number(pos.pile.slice(1))];
    return pos.index === f.length - 1 ? { from: pos.pile, count: 1 } : null;
  }
  const col = s.tableau[Number(pos.pile.slice(1))];
  return { from: pos.pile, count: col.cards.length - pos.index };
}

export function pickupIds(s: GameState, p: { from: PileId; count: number }): CardId[] {
  if (p.from === 'W') return s.waste.slice(-1);
  if (p.from[0] === 'F') return s.foundations[Number(p.from.slice(1))].slice(-1);
  const col = s.tableau[Number(p.from.slice(1))];
  return col.cards.slice(col.cards.length - p.count);
}
