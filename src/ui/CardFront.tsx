import { memo } from 'react';
import { rankLabel, suitOf, type CardId } from '../engine/cards';
import { SUIT_PATHS } from './cards/suits';

const Glyph = ({ d, className }: { d: string; className: string }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** Corner index (rank over suit) where a fanned column leaves it visible, plus one big pip bottom-right. */
export const CardFront = memo(function CardFront({ id }: { id: CardId }) {
  const suit = suitOf(id);
  return (
    <div className={`face suit-${suit}`}>
      <span className="face-index">
        <span className="face-rank">{rankLabel(id)}</span>
        <Glyph d={SUIT_PATHS[suit]} className="face-suit" />
      </span>
      <Glyph d={SUIT_PATHS[suit]} className="face-pip" />
    </div>
  );
});
