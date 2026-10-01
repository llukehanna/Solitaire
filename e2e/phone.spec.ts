import { devices, expect, test } from '@playwright/test';
import { deal } from '../src/engine/deal';
import { destinationsFor } from '../src/engine/movegen';
import type { PileId } from '../src/engine/types';
import { clickCenter, clickStock, freshGame, getSession, openSettings, pileCount, SEED } from './helpers';

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
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'));
  const vh = page.viewportSize()!.height;
  const card = (await page.locator('dialog[open] .modal-card').boundingBox())!;
  expect(Math.abs(card.y + card.height - vh)).toBeLessThanOrEqual(1);
  expect(card.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);

  const settled = () =>
    page.waitForFunction(() => {
      const c = document.querySelector('dialog[open] .modal-card');
      return !!c && getComputedStyle(c).transform === 'none';
    });
  const handleCentre = async () => {
    const h = (await page.locator('dialog[open] .sheet-handle').boundingBox())!;
    return { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  };
  const translateY = () =>
    page.locator('dialog[open] .modal-card').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42);

  // A short, slow drag springs back.
  let { x, y } = await handleCentre();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 30, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.move(x, y + 31);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await settled();
  await expect
    .poll(async () => {
      const b = (await page.locator('dialog[open] .modal-card').boundingBox())!;
      return Math.abs(b.y + b.height - vh);
    })
    .toBeLessThanOrEqual(1);

  // A long drag follows the finger, then closes it (by the swipe, not the backdrop).
  ({ x, y } = await handleCentre());
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 100, { steps: 8 });
  expect(Math.abs((await translateY()) - 100)).toBeLessThanOrEqual(5);
  await page.mouse.move(x, y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeHidden();
});

test('a drag that is held still before release does not dismiss on stale velocity', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await openSettings(page);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => document.querySelector('dialog[open] .modal-card')?.getAnimations().every((a) => a.playState === 'finished'));
  const h = (await page.locator('dialog[open] .sheet-handle').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 2 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
});

test('phones get a readout strip on top and a thumb bar below the cards', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const bar = page.getByRole('navigation', { name: 'Game controls' });
  await expect(bar).toBeVisible();
  for (const name of ['New', 'Undo', 'Hint', 'Redo', 'More']) {
    const b = (await bar.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(b.width, name).toBeGreaterThanOrEqual(44);
    expect(b.height, name).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.toolbar .tb-btn').first()).toBeHidden();
  await expect(page.getByTestId('timer')).toBeVisible();
  expect((await page.locator('.toolbar').boundingBox())!.height).toBeLessThanOrEqual(32);
  const barTop = (await bar.boundingBox())!.y;
  const bottoms = await page.locator('[data-card]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  for (const b of bottoms) expect(b).toBeLessThanOrEqual(barTop);
});

test('the Game sheet restarts the deal and switches the draw', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Game' });
  await sheet.getByRole('button', { name: 'Restart this deal' }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => pileCount(page, 'W')).toBe(0);
  expect((await getSession(page)).seed).toBe(SEED);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('dialog', { name: 'Game' }).getByRole('radio', { name: 'Draw 3' }).click();
  await expect.poll(async () => (await getSession(page)).drawCount).toBe(3);
  await expect(page.locator('.readout .pill')).toHaveText('Draw 3');
});

test('Hint works from the thumb bar', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect.poll(() => page.locator('.card.hinted, .hint-target').count()).toBeGreaterThan(0);
});

test('More opens Stats', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Stats', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Statistics' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
});

const PLAYED_ONE = {
  v: 1,
  draw1: { played: 1, won: 0, currentStreak: 0, bestStreak: 0, bestTimeMs: null, fewestMoves: null, bestScore: null },
  draw3: { played: 0, won: 0, currentStreak: 0, bestStreak: 0, bestTimeMs: null, fewestMoves: null, bestScore: null },
  vegasBank: 0,
};

test('iPhones get install steps after their first game, and dismissing sticks', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL: 'http://localhost:4173' });
  const page = await ctx.newPage();
  await freshGame(page, { seed: SEED, storage: { 'sol.v1.stats': PLAYED_ONE } });
  const hint = page.getByRole('complementary', { name: 'Install Solitaire' });
  await expect(hint).toContainText('Add to Home Screen');
  await hint.getByRole('button', { name: 'Dismiss' }).click();
  await expect(hint).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  await expect(hint).toBeHidden();
  await ctx.close();
});

test('no install hint before the first finished game', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], baseURL: 'http://localhost:4173' });
  const page = await ctx.newPage();
  await freshGame(page, { seed: SEED });
  await page.waitForTimeout(300);
  await expect(page.getByRole('complementary', { name: 'Install Solitaire' })).toHaveCount(0);
  await ctx.close();
});

test('the installed app is locked to portrait', async ({ page }) => {
  await freshGame(page);
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json());
  expect(manifest.orientation).toBe('portrait');
});
