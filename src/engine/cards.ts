export type Suit = 'S' | 'H' | 'D' | 'C';
/** 0..51. suitIndex = floor(id / 13) in SUITS order; rank = id % 13 + 1 (1 = ace, 13 = king). */
export type CardId = number;

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_NAMES: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_CODES = 'A23456789TJQK';

export const suitIndex = (id: CardId): number => Math.floor(id / 13);
export const suitOf = (id: CardId): Suit => SUITS[suitIndex(id)];
export const rankOf = (id: CardId): number => (id % 13) + 1;
export const isRed = (id: CardId): boolean => {
  const s = suitIndex(id);
  return s === 1 || s === 2;
};
export const cardId = (suit: Suit, rank: number): CardId => SUITS.indexOf(suit) * 13 + rank - 1;
export const cardName = (id: CardId): string => `${RANK_NAMES[rankOf(id) - 1]} of ${SUIT_NAMES[suitOf(id)]}`;
export const rankLabel = (id: CardId): string => RANK_LABELS[rankOf(id) - 1];
/** Two-char code used for card art file names: 'AS', 'TH', 'KC'. */
export const cardCode = (id: CardId): string => RANK_CODES[rankOf(id) - 1] + suitOf(id);
