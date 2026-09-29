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

/** Clean storage, deterministic settings (no animation, no sound, no auto-play), optional fixed deal. */
export async function freshGame(page: Page, opts: { seed?: number; drawCount?: DrawCount; settings?: Record<string, unknown> } = {}) {
  // Seed storage before the app's first script runs, once per tab (sessionStorage survives reloads). Clearing from
  // page.evaluate() after load is not enough: the running app re-saves its game on pagehide, so the previous
  // game's seed would survive the reload while its `recent` entry is gone.
  await page.addInitScript((settings) => {
    if (sessionStorage.getItem('e2e-init')) return;
    sessionStorage.setItem('e2e-init', '1');
    localStorage.clear();
    localStorage.setItem('sol.v1.settings', JSON.stringify({ animation: 'off', sound: false, autoPlay: false, ...settings }));
  }, opts.settings ?? {});
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
