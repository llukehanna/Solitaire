import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { DrawCount, GameState, Move } from '../src/engine/types';
import type { Session } from '../src/game/session';

declare global {
  interface Window {
    __sol: { session(): Session; turn(moves: Move[]): void; load(seed: number, drawCount: DrawCount): void };
  }
}

export const BANK1 = JSON.parse(readFileSync('src/deals/bank-draw1.json', 'utf8')) as { entries: [number, number][] };
export const SEED = BANK1.entries[0][0];

/** Clean storage, deterministic settings (no animation, no sound, auto-move off), optional fixed deal. */
export async function freshGame(
  page: Page,
  opts: { seed?: number; drawCount?: DrawCount; settings?: Record<string, unknown>; storage?: Record<string, unknown> } = {},
) {
  // Seed storage before the app's first script runs, once per tab (sessionStorage survives reloads). Clearing from
  // page.evaluate() after load is not enough: the running app re-saves its game on pagehide, so the previous
  // game's seed would survive the reload while its `recent` entry is gone.
  await page.addInitScript(
    ([settings, storage]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.clear();
      localStorage.setItem('sol.v1.settings', JSON.stringify({ animation: 'off', sound: false, autoMove: false, ...settings }));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
    },
    [opts.settings ?? {}, opts.storage ?? {}] as const,
  );
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => !!window.__sol);
  if (opts.seed !== undefined) {
    await page.evaluate(([s, d]) => window.__sol.load(s, d), [opts.seed, opts.drawCount ?? 1] as [number, DrawCount]);
  }
}

export const getSession = (page: Page) => page.evaluate(() => window.__sol.session());
export const getState = async (page: Page): Promise<GameState> => (await getSession(page)).state;
export const pileCount = (page: Page, pile: string) => page.locator(`[data-card][data-pile="${pile}"]`).count();

export async function clickCenter(page: Page, selector: string, dy?: number) {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + (dy ?? box.height / 2));
}

export const clickStock = (page: Page) => clickCenter(page, '#pile-S');

/** The phone layout is on when the thumb bar is showing. */
export const isPhone = (page: Page) => page.locator('.thumb-bar').isVisible();

async function fromMore(page: Page, name: string) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name, exact: true }).click();
}

export async function openSettings(page: Page) {
  if (await isPhone(page)) await fromMore(page, 'Settings');
  else await page.getByRole('button', { name: 'Settings' }).click();
}

export async function openStats(page: Page) {
  if (await isPhone(page)) await fromMore(page, 'Stats');
  else await page.getByRole('button', { name: 'Stats' }).click();
}

export async function newGameFromMenu(page: Page) {
  if (await isPhone(page)) {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('dialog', { name: 'Game' }).getByRole('button', { name: 'New game' }).click();
  } else {
    await page.getByLabel('Game menu').click();
    await page.getByRole('menuitem', { name: 'New game' }).click();
  }
}

/** Desktop uses the toolbar swatches; phones pick the table in Settings. */
export async function pickTable(page: Page, table: 'Studio' | 'Felt' | 'Paper') {
  if (await isPhone(page)) {
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('radiogroup', { name: 'Table' }).getByRole('radio', { name: table }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
  } else {
    await page.getByRole('radio', { name: `${table} table` }).click();
  }
}
