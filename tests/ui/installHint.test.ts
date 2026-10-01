import { describe, it, expect } from 'vitest';
import { installHintMode, isIOS, type HintEnv } from '../../src/ui/installHint';

const base: HintEnv = { phone: true, standalone: false, dismissed: false, gamesPlayed: 1, ios: false, canPrompt: true };

describe('installHintMode', () => {
  it('offers the Android prompt when the browser supports it', () => {
    expect(installHintMode(base)).toBe('android');
    expect(installHintMode({ ...base, canPrompt: false })).toBeNull();
  });
  it('gives iOS written steps', () => {
    expect(installHintMode({ ...base, ios: true, canPrompt: false })).toBe('ios');
  });
  it.each<[string, Partial<HintEnv>]>([
    ['not a phone', { phone: false }],
    ['already installed', { standalone: true }],
    ['dismissed', { dismissed: true }],
    ['before the first finished game', { gamesPlayed: 0 }],
  ])('stays hidden when %s', (_, patch) => {
    expect(installHintMode({ ...base, ios: true, ...patch })).toBeNull();
  });
});

describe('isIOS', () => {
  it('spots iPhones and iPads, including iPads that claim to be Macs', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5)).toBe(false);
  });
});
