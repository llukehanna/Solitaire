import type { CSSProperties } from 'react';
import { cardId } from '../../engine/cards';
import type { Settings } from '../../store/settings';
import { CardFront } from '../CardFront';

const FACES = [cardId('S', 13), cardId('H', 7), cardId('D', 12)];
const CARD_W = { '--card-w': '56px' } as CSSProperties;

/**
 * A strip showing the live table, card back, and suit colours. It renders inside `.app`, so its tokens
 * (--bg, --glow, --texture*, --back*, --suit-*) already follow the current settings.
 */
export function AppearancePreview({ table }: Pick<Settings, 'table'>) {
  return (
    <div className="preview textured" data-testid="appearance-preview" aria-hidden="true">
      {table === 'felt' && <span className="preview-vignette" />}
      <div className="pv-card" style={CARD_W}>
        <div className="card-back" />
      </div>
      {FACES.map((id) => (
        <div className="pv-card" style={CARD_W} key={id}>
          <div className="card-front">
            <CardFront id={id} />
          </div>
        </div>
      ))}
    </div>
  );
}
