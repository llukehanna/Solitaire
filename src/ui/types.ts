import type { PileId } from '../engine/types';
import type { PileKey } from './layout';

export type Hint = { kind: 'move'; from: PileId; count: number; to: PileId } | { kind: 'stock' };

export interface Focus {
  pile: PileKey;
  /** Card index within the pile; -1 when the pile is empty. */
  index: number;
}

export interface Selection {
  from: PileId;
  count: number;
}
