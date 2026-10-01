import { describe, it, expect, vi } from 'vitest';
import { buzz } from '../../src/ui/haptics';

describe('buzz', () => {
  it('vibrates briefly on a rejected move and in a pattern on a win', () => {
    const vibrate = vi.fn(() => true);
    buzz('reject', true, { vibrate });
    buzz('win', true, { vibrate });
    expect(vibrate.mock.calls).toEqual([[12], [[20, 40, 20]]]);
  });
  it('stays silent when sound is off or vibration is unsupported', () => {
    const vibrate = vi.fn(() => true);
    buzz('reject', false, { vibrate });
    expect(vibrate).not.toHaveBeenCalled();
    expect(() => buzz('win', true, {})).not.toThrow();
    expect(() => buzz('win', true, undefined)).not.toThrow();
  });
});
