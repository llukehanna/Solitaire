import { expect, test } from '@playwright/test';
import { deal } from '../src/engine/deal';
import { destinationsFor } from '../src/engine/movegen';
import type { PileId } from '../src/engine/types';
import { clickCenter, freshGame, pileCount, SEED } from './helpers';

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout only');
});

test('cards run edge to edge, fan tall, and carry a big index', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const w = await page.locator('[data-card]').first().evaluate((el) => el.getBoundingClientRect().width);
  expect(w).toBeGreaterThanOrEqual(50);

  // Tap a tableau card that has a tableau move, so its destination holds two face-up cards.
  const s = deal(SEED, 1, 'standard');
  const from = [0, 1, 2, 3, 4, 5, 6].find((i) => destinationsFor(s, `T${i}` as PileId, 1).some((d) => d[0] === 'T'))!;
  const to = destinationsFor(s, `T${from}` as PileId, 1).find((d) => d[0] === 'T')!;
  const id = s.tableau[from].cards[s.tableau[from].cards.length - 1];
  const before = s.tableau[Number(to.slice(1))].cards.length;
  await clickCenter(page, `#card-${id}`);
  await expect.poll(() => pileCount(page, to)).toBe(before + 1);

  const ys = await page
    .locator(`[data-card][data-pile="${to}"]`)
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: r.top, h: r.height })).sort((a, b) => a.y - b.y));
  const [under, top] = ys.slice(-2);
  expect(top.y - under.y).toBeGreaterThanOrEqual(under.h * 0.4 - 1);

  const index = await page.locator(`#card-${id} .face`).evaluate((el) => {
    const rank = el.querySelector('.face-rank')!.getBoundingClientRect();
    const suit = el.querySelector('.face-suit')!.getBoundingClientRect();
    return { rankPx: parseFloat(getComputedStyle(el.querySelector('.face-rank')!).fontSize), sameRow: Math.abs(rank.top - suit.top) < rank.height, suitLeft: suit.left, rankRight: rank.right };
  });
  expect(index.rankPx).toBeGreaterThanOrEqual(w * 0.42 - 0.5);
  expect(index.sameRow).toBe(true);
  expect(index.suitLeft).toBeGreaterThan(index.rankRight);
});

test('dialogs open as bottom sheets and close with a downward swipe', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'));
  const vh = page.viewportSize()!.height;
  const card = (await page.locator('dialog[open] .modal-card').boundingBox())!;
  expect(Math.abs(card.y + card.height - vh)).toBeLessThanOrEqual(1);
  expect(card.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);

  // A short, slow drag springs back.
  const handle = (await page.locator('dialog[open] .sheet-handle').boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 30, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(x, y + 31);
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  // A long drag closes it.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 200, { steps: 12 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
});
