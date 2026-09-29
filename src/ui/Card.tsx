import { forwardRef, memo } from 'react';
import { cardName, type CardId } from '../engine/cards';
import { CardFront } from './CardFront';
import type { CardPos } from './layout';

interface CardProps {
  id: CardId;
  pos: CardPos;
  width: number;
  height: number;
  moving: boolean;
  hinted: boolean;
  focused: boolean;
  selected: boolean;
}

export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(function Card(p, ref) {
    const cls = ['card', p.pos.faceUp && 'faceup', p.hinted && 'hinted', p.focused && 'focused', p.selected && 'selected']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        ref={ref}
        id={`card-${p.id}`}
        className={cls}
        data-card={p.id}
        data-pile={p.pos.pile}
        data-index={p.pos.index}
        data-faceup={p.pos.faceUp}
        role="img"
        aria-label={p.pos.faceUp ? `${cardName(p.id)}, face up` : 'face-down card'}
        style={{
          width: p.width,
          height: p.height,
          transform: `translate3d(${p.pos.x}px, ${p.pos.y}px, 0)`,
          zIndex: p.moving ? 1000 + p.pos.z : p.pos.z,
        }}
      >
        <div className="card-inner">
          <div className="card-front">{p.pos.faceUp && <CardFront id={p.id} />}</div>
          <div className="card-back" />
        </div>
      </div>
    );
  }),
);
