export const KEYS = {
  game: 'sol.v1.game',
  settings: 'sol.v1.settings',
  stats: 'sol.v1.stats',
  recent: 'sol.v1.recent',
  installHint: 'sol.v1.installHint',
} as const;

export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota, blocked) — the game still works, it just won't persist.
  }
}

export const asRecord = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
