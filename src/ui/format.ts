import type { Session } from '../game/session';
import type { Settings } from '../store/settings';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const dollars = (n: number) => (n < 0 ? `-$${-n}` : `$${n}`);

export function formatScore(session: Session, settings: Settings, vegasBank: number): string | null {
  if (session.scoring === 'none') return null;
  if (session.scoring === 'vegas') return dollars(session.state.score + (settings.cumulativeVegas ? vegasBank : 0));
  return String(session.state.score);
}
