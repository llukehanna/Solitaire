import { test } from '@playwright/test';
import { freshGame, openSettings, openStats, SEED } from './helpers';

for (const table of ['studio', 'felt', 'paper'] as const) {
  test(`screenshot: ${table} table`, async ({ page }, info) => {
    await freshGame(page, { seed: SEED, settings: { table } });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}.png` });
    await openStats(page);
    await page.waitForFunction(() =>
      document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'),
    );
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}-stats.png` });
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    await openSettings(page);
    await page.waitForFunction(() =>
      document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'),
    );
    await page.screenshot({ path: `test-results/visual/${info.project.name}-${table}-settings.png` });
  });
}

for (const table of ['studio', 'felt', 'paper'] as const) {
  test(`screenshot: ${table} table at 375x812 with the Game sheet`, async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone size only');
    await page.setViewportSize({ width: 375, height: 812 });
    await freshGame(page, { seed: SEED, settings: { table } });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/visual/phone375-${table}.png` });
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'),
    );
    await page.screenshot({ path: `test-results/visual/phone375-${table}-game.png` });
  });
}
