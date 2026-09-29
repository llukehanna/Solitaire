import { expect, test } from '@playwright/test';
import { deal } from '../src/engine/deal';
import { applyMove } from '../src/engine/apply';
import { destinationsFor, legalMoves } from '../src/engine/movegen';
import type { GameState, Move, PileId } from '../src/engine/types';
import { solve } from '../src/solver/solve';
import { clickCenter, clickStock, freshGame, getSession, getState, pileCount, SEED } from './helpers';

function firstTap(s: GameState): { id: number; to: PileId } | null {
  const sources: [PileId, number | undefined][] = [['W', s.waste[s.waste.length - 1]]];
  s.tableau.forEach((c, i) => sources.push([`T${i}` as PileId, c.cards[c.cards.length - 1]]));
  for (const [from, id] of sources) {
    if (id === undefined) continue;
    const [to] = destinationsFor(s, from, 1);
    if (to) return { id, to };
  }
  return null;
}

test('plays a banked deal to a win, auto-finishing at the end', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const r = solve(deal(SEED, 1, 'standard'), { maxNodes: 1_000_000 });
  expect(r.status).toBe('winnable');
  if (r.status !== 'winnable') return;
  let issued = 0;
  for (const m of r.solution) {
    if ((await getSession(page)).status !== 'playing') break;
    await page.evaluate((mv) => window.__sol.turn([mv]), m);
    issued++;
  }
  await expect(page.getByRole('dialog', { name: 'You won!' })).toBeVisible({ timeout: 20_000 });
  const final = await getSession(page);
  expect(final.status).toBe('won');
  expect(final.turns.length).toBe(issued + 1); // the auto-finish is recorded as one extra turn
});

test('Escape skips the win cascade', async ({ page }) => {
  await freshGame(page, { seed: SEED, settings: { animation: 'normal' } });
  const r = solve(deal(SEED, 1, 'standard'), { maxNodes: 1_000_000 });
  expect(r.status).toBe('winnable');
  if (r.status !== 'winnable') return;
  for (const m of r.solution) {
    if ((await getSession(page)).status !== 'playing') break;
    await page.evaluate((mv) => window.__sol.turn([mv]), m);
  }
  await expect.poll(async () => (await getSession(page)).status, { timeout: 20_000 }).not.toBe('playing');
  await expect(page.locator('canvas.win-cascade')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'You won!' })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('canvas.win-cascade')).toHaveCount(0);
});

test('tapping the stock draws; tapping a playable card moves it', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  for (let i = 0; i < 30; i++) {
    const tap = firstTap(await getState(page));
    if (tap) {
      await clickCenter(page, `#card-${tap.id}`);
      await expect(page.locator(`#card-${tap.id}`)).toHaveAttribute('data-pile', tap.to);
      return;
    }
    await clickStock(page);
  }
  throw new Error('no tappable move found in 30 draws');
});

/** A tappable card whose move exposes another tappable card in the same spot (so a stray second click would move it too). */
function chainedTap(s: GameState): { id: number } | null {
  const sources: PileId[] = ['W', ...s.tableau.map((_, i) => `T${i}` as PileId)];
  for (const from of sources) {
    const pile = from === 'W' ? s.waste : s.tableau[Number(from.slice(1))].cards;
    const id = pile[pile.length - 1];
    if (id === undefined) continue;
    const [to] = destinationsFor(s, from, 1);
    if (!to) continue;
    const s2 = applyMove(s, { type: 'move', from, to, count: 1 });
    const pile2 = from === 'W' ? s2.waste : s2.tableau[Number(from.slice(1))].cards;
    if (pile2.length && destinationsFor(s2, from, 1).length) return { id };
  }
  return null;
}

test('a fast double-click makes exactly one move', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  for (let i = 0; i < 60; i++) {
    const s = await getState(page);
    const tap = chainedTap(s) ?? (i >= 30 ? firstTap(s) : null);
    if (tap) {
      const before = (await getSession(page)).turns.length;
      const box = (await page.locator(`#card-${tap.id}`).boundingBox())!;
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);
      expect((await getSession(page)).turns.length).toBe(before + 1);
      return;
    }
    await clickStock(page);
  }
  throw new Error('no tappable card found');
});

test('drag and drop moves a card onto a legal column', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  for (let i = 0; i < 30; i++) {
    const s = await getState(page);
    const m = legalMoves(s).find(
      (x): x is Extract<Move, { type: 'move' }> => x.type === 'move' && x.to[0] === 'T' && (x.from === 'W' || x.from[0] === 'T'),
    );
    if (m) {
      const src =
        m.from === 'W' ? s.waste[s.waste.length - 1] : s.tableau[Number(m.from.slice(1))].cards.slice(-m.count)[0];
      const destCol = s.tableau[Number(m.to.slice(1))].cards;
      const target = destCol.length ? `#card-${destCol[destCol.length - 1]}` : `#pile-${m.to}`;
      const a = (await page.locator(`#card-${src}`).boundingBox())!;
      const b = (await page.locator(target).boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + 10);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + 30, { steps: 12 });
      await page.mouse.up();
      await expect(page.locator(`#card-${src}`)).toHaveAttribute('data-pile', m.to);
      return;
    }
    await clickStock(page);
  }
  throw new Error('no draggable move found in 30 draws');
});

test('undo and redo buttons', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
});

test('reload restores the game and the timer', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  for (let i = 0; i < 3; i++) await clickStock(page);
  await page.waitForTimeout(2200);
  const seconds = (t: string) => t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  const before = seconds((await page.getByTestId('timer').textContent())!);
  expect(before).toBeGreaterThanOrEqual(2);
  const waste = await pileCount(page, 'W');
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  expect(await pileCount(page, 'W')).toBe(waste);
  expect(seconds((await page.getByTestId('timer').textContent())!)).toBeGreaterThanOrEqual(before);
});

test('new games never repeat a recent seed', async ({ page }) => {
  await freshGame(page);
  const seeds = [(await getSession(page)).seed];
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Game menu').click();
    await page.getByRole('menuitem', { name: 'New game' }).click();
    await expect.poll(async () => (await getSession(page)).seed).not.toBe(seeds[seeds.length - 1]);
    seeds.push((await getSession(page)).seed);
  }
  expect(new Set(seeds).size).toBe(seeds.length);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('sol.v1.recent')!).draw1 as number[]);
  for (const s of seeds) expect(recent).toContain(s);
});

test('keyboard: D draws, Z undoes, arrows + Enter move a card', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.locator('.table').focus();
  await page.keyboard.press('d');
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.keyboard.press('z');
  await expect.poll(() => pileCount(page, 'W')).toBe(0);

  const ORDER = ['S', 'W', 'F0', 'F1', 'F2', 'F3', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
  for (let i = 0; i < 30; i++) {
    const s = await getState(page);
    const tap = firstTap(s);
    if (tap) {
      const from = s.waste[s.waste.length - 1] === tap.id ? 'W' : `T${s.tableau.findIndex((c) => c.cards[c.cards.length - 1] === tap.id)}`;
      await page.keyboard.press('ArrowRight'); // first arrow focuses T0
      const go = async (a: string, b: string) => {
        const n = (ORDER.indexOf(b) - ORDER.indexOf(a) + ORDER.length) % ORDER.length;
        for (let k = 0; k < n; k++) await page.keyboard.press('ArrowRight');
      };
      await go('T0', from);
      await page.keyboard.press('Enter');
      await go(from, tap.to);
      await page.keyboard.press('Enter');
      await expect(page.locator(`#card-${tap.id}`)).toHaveAttribute('data-pile', tap.to);
      return;
    }
    await page.keyboard.press('d');
  }
  throw new Error('no keyboard move found in 30 draws');
});

test('Space draws from the stock, even right after clicking a toolbar button', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await page.locator('.table').focus();
  await page.keyboard.press(' ');
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pileCount(page, 'W')).toBe(0);
  await page.keyboard.press(' ');
  await expect.poll(() => pileCount(page, 'W')).toBe(1); // drew again, did not re-press Undo
});

test('layout fits the viewport without scrolling', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    sw: document.documentElement.scrollWidth,
    ih: innerHeight,
    iw: innerWidth,
  }));
  expect(m.sh).toBeLessThanOrEqual(m.ih);
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  const boxes = await page
    .locator('[data-card]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, b: r.bottom })));
  for (const b of boxes) {
    expect(b.l).toBeGreaterThanOrEqual(0);
    expect(b.r).toBeLessThanOrEqual(m.iw);
    expect(b.b).toBeLessThanOrEqual(m.ih);
  }
});

test('registers a service worker for offline play', async ({ page }) => {
  await freshGame(page);
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 15_000 })
    .toBe(true);
});

test('a mid-game rules change shows its "next game" note inside the settings dialog', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await clickStock(page);
  await expect.poll(() => pileCount(page, 'W')).toBe(1);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByText('Applies to your next game.')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Draw 3' }).click();
  await expect(dialog.getByText('Applies to your next game.')).toBeVisible();
  expect((await getSession(page)).drawCount).toBe(1); // the current game is untouched
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText('Applies to your next game.')).toHaveCount(0);
});

test('the table switch changes the look and persists across reload', async ({ page }) => {
  await freshGame(page, { seed: SEED });
  await expect(page.locator('.app')).toHaveClass(/table-studio/);
  await page.getByRole('radio', { name: 'Paper table' }).click();
  await expect(page.locator('.app')).toHaveClass(/table-paper/);
  await page.reload();
  await page.waitForFunction(() => !!window.__sol);
  await expect(page.locator('.app')).toHaveClass(/table-paper/);
  await expect(page.getByRole('radio', { name: 'Paper table' })).toHaveAttribute('aria-checked', 'true');
});
