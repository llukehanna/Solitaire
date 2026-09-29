import { describe, it, expect } from 'vitest';
import { activate, clampFocus, stepFocus, topIndex } from '../../src/ui/focus';
import { cards, makeState } from '../helpers';

const s = makeState({ stock: cards('2C'), waste: cards('3C'), cols: [['9C 8H 7S', 1], ['9S', 0]] });

describe('stepFocus', () => {
  it('starts on the first column', () => {
    expect(stepFocus(s, null, 'right')).toEqual({ pile: 'T0', index: 2 });
  });
  it('cycles left and right through piles, landing on the top card', () => {
    expect(stepFocus(s, { pile: 'T0', index: 2 }, 'right')).toEqual({ pile: 'T1', index: 0 });
    expect(stepFocus(s, { pile: 'S', index: 0 }, 'left')).toEqual({ pile: 'T6', index: -1 });
    expect(stepFocus(s, { pile: 'S', index: 0 }, 'right')).toEqual({ pile: 'W', index: 0 });
  });
  it('moves up and down through face-up cards, then up to the top row', () => {
    expect(stepFocus(s, { pile: 'T0', index: 2 }, 'up')).toEqual({ pile: 'T0', index: 1 });
    expect(stepFocus(s, { pile: 'T0', index: 1 }, 'up')).toEqual({ pile: 'S', index: 0 });
    expect(stepFocus(s, { pile: 'T0', index: 1 }, 'down')).toEqual({ pile: 'T0', index: 2 });
    expect(stepFocus(s, { pile: 'W', index: 0 }, 'down')).toEqual({ pile: 'T1', index: 0 });
  });
});

describe('activate', () => {
  it('draws on the stock', () => {
    expect(activate(s, { pile: 'S', index: 0 }, null)).toEqual({ action: 'stock' });
  });
  it('selects a face-up run and places it', () => {
    const sel = activate(s, { pile: 'T0', index: 1 }, null);
    expect(sel).toEqual({ action: 'select', selection: { from: 'T0', count: 2 } });
    expect(activate(s, { pile: 'T1', index: 0 }, { from: 'T0', count: 2 })).toEqual({
      action: 'move',
      move: { type: 'move', from: 'T0', to: 'T1', count: 2 },
    });
  });
  it('rejects illegal targets and cancels on the source pile', () => {
    expect(activate(s, { pile: 'W', index: 0 }, { from: 'T0', count: 2 })).toEqual({ action: 'reject' });
    expect(activate(s, { pile: 'T0', index: 2 }, { from: 'T0', count: 1 })).toEqual({ action: 'cancel' });
    expect(activate(s, { pile: 'T0', index: 0 }, null)).toEqual({ action: 'reject' });
  });
});

describe('clampFocus and topIndex', () => {
  it('keeps focus on real cards', () => {
    expect(topIndex(s, 'T2')).toBe(-1);
    expect(clampFocus(s, { pile: 'T0', index: 9 })).toEqual({ pile: 'T0', index: 2 });
    expect(clampFocus(s, { pile: 'T0', index: 0 })).toEqual({ pile: 'T0', index: 1 });
  });
});
