import { describe, it, expect } from 'vitest';
import { appClassName } from '../../src/ui/appClass';
import { DEFAULT_SETTINGS } from '../../src/store/settings';

describe('appClassName', () => {
  it('carries the table and card back', () => {
    const cls = appClassName({ ...DEFAULT_SETTINGS, table: 'paper', cardBack: 'ink', fourColor: true }).split(' ');
    expect(cls).toEqual(expect.arrayContaining(['app', 'table-paper', 'back-ink', 'four-color']));
  });
});
