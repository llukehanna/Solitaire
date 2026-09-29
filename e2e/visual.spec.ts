import { test } from '@playwright/test';
import { freshGame, SEED } from './helpers';

for (const table of ['studio', 'felt', 'paper'] as const) {
  test(`screenshot: ${table} table`, async ({ page }, info) => {
    await freshGame(page, { seed: SEED, settings: { table } });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}.png` });
    await page.getByRole('button', { name: 'Stats' }).click();
    await page.waitForFunction(() =>
      document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'),
    );
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}-stats.png` });
  });
}
