import { describe, it, expect } from 'vitest';
import { turnEffect } from '../../src/ui/turnEffect';
import { applyMove } from '../../src/engine/apply';
import { deal } from '../../src/engine/deal';
import { cards, makeState } from '../helpers';

describe('turnEffect', () => {
  it('classifies turns', () => {
    const s = makeState({ stock: cards('2C'), waste: cards('3C'), moves: 1, cols: [['5S AH', 1], ['9C 8H', 1], ['9S', 0]] });
    expect(turnEffect(s, s)).toBeNull();
    expect(turnEffect(s, applyMove(s, { type: 'draw' }))).toBe('draw');
    expect(turnEffect(s, applyMove(s, { type: 'move', from: 'T0', to: 'F1', count: 1 }))).toBe('flip');
    const noStock = makeState({ waste: cards('3C'), moves: 1 });
    expect(turnEffect(noStock, applyMove(noStock, { type: 'recycle' }))).toBe('recycle');
    const up = makeState({ moves: 1, cols: [['AH', 0]] });
    expect(turnEffect(up, applyMove(up, { type: 'move', from: 'T0', to: 'F1', count: 1 }))).toBe('foundation');
    const t = makeState({ moves: 1, cols: [['8H', 0], ['9S', 0]] });
    expect(turnEffect(t, applyMove(t, { type: 'move', from: 'T0', to: 'T1', count: 1 }))).toBe('move');
  });
  it('is silent for a fresh deal', () => {
    expect(turnEffect(deal(1, 1, 'standard'), deal(2, 1, 'standard'))).toBeNull();
  });
});
