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
  stacked: boolean;
  nopeKey: number;
  pickable: boolean;
}

export const Card = memo(
  forwardRef<HTMLDivElement, CardProps>(function Card(p, ref) {
    const cls = ['card', p.pos.faceUp && 'faceup', p.hinted && 'hinted', p.focused && 'focused', p.selected && 'selected', p.stacked && 'stacked', p.nopeKey > 0 && 'nope', p.pickable && 'pickable']
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
        {/* A new key on each rejected tap remounts the inner element so the shake replays. */}
        <div className="card-inner" key={p.nopeKey} aria-hidden="true">
          {/* The face stays rendered while face down so a flip never shows a blank card. */}
          <div className="card-front"><CardFront id={p.id} /></div>
          <div className="card-back" />
        </div>
      </div>
    );
  }),
);
