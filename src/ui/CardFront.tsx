import { memo } from 'react';
import { cardCode, type CardId } from '../engine/cards';
import type { Theme } from '../store/settings';
import { minimalCardSvg } from './cards/minimal';

export const classicCardUrl = (id: CardId, fourColor: boolean) =>
  `/cards/${fourColor ? 'classic-4c' : 'classic'}/${cardCode(id)}.svg`;

export const CardFront = memo(function CardFront(p: { id: CardId; theme: Theme; fourColor: boolean }) {
  if (p.theme === 'classic') {
    return <img className="card-img" src={classicCardUrl(p.id, p.fourColor)} alt="" draggable={false} />;
  }
  return <div className="card-svg" dangerouslySetInnerHTML={{ __html: minimalCardSvg(p.id) }} />;
});
