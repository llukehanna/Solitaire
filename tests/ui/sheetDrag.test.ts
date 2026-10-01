import { describe, it, expect } from 'vitest';
import { DISMISS_PX, DISMISS_VELOCITY, shouldDismiss } from '../../src/ui/dialogs/sheetDrag';

describe('shouldDismiss', () => {
  it('closes once dragged past the distance threshold', () => {
    expect(shouldDismiss(DISMISS_PX, 0)).toBe(true);
    expect(shouldDismiss(DISMISS_PX - 1, 0)).toBe(false);
  });
  it('closes on a fast downward flick even when short', () => {
    expect(shouldDismiss(20, DISMISS_VELOCITY + 0.01)).toBe(true);
    expect(shouldDismiss(20, DISMISS_VELOCITY)).toBe(false);
  });
  it('never closes on an upward flick or no movement', () => {
    expect(shouldDismiss(0, 2)).toBe(false);
    expect(shouldDismiss(30, -2)).toBe(false);
  });
});
