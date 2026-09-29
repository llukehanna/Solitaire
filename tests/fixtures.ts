import { cards, makeState, upTo } from './helpers';

/** Black suits complete, red suits at ace; every column is red-only with 2♥/2♦ buried. No legal productive move exists. */
export const DEAD_STATE = makeState({
  foundations: [upTo('S', 13), upTo('H', 1), upTo('D', 1), upTo('C', 13)],
  cols: [
    ['2H 3H 4H 5H', 3],
    ['2D 3D 4D 5D', 3],
    ['6H 7H 8H', 2],
    ['6D 7D 8D', 2],
    ['9H TH JH', 2],
    ['9D TD JD', 2],
    ['QH KH QD KD', 3],
  ],
});

/** Same cards, stacked so every column plays straight up. Winnable. */
export const EASY_STATE = makeState({
  foundations: [upTo('S', 13), upTo('H', 1), upTo('D', 1), upTo('C', 13)],
  cols: [
    ['5H 4H 3H 2H', 3],
    ['5D 4D 3D 2D', 3],
    ['8H 7H 6H', 2],
    ['8D 7D 6D', 2],
    ['JH TH 9H', 2],
    ['JD TD 9D', 2],
    ['KD KH QD QH', 3],
  ],
});

/** All face up, draw-3: 6♥ always lands on top of 5♥ in the stock and nothing can move. Unwinnable. */
export const STUCK_DRAW3 = makeState({
  drawCount: 3,
  foundations: [upTo('S', 13), upTo('H', 4), upTo('D', 13), upTo('C', 13)],
  cols: [['8H', 0], ['9H', 0], ['TH', 0], ['JH', 0], ['QH', 0], ['KH', 0], ['7H', 0]],
  stock: cards('6H 5H'), // 5♥ is the stock top; one draw-3 turns both and leaves 6♥ showing
});

/** The same layout in draw-1 finishes: draw 5♥, play, draw 6♥, play, then the tableau runs up. */
export const FINISH_DRAW1 = { ...STUCK_DRAW3, drawCount: 1 as const };
