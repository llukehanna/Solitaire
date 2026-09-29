import { winRate, type ModeStats, type Stats } from '../../store/stats';
import { formatTime } from '../format';
import { Modal } from './Modal';

const ROWS: [string, (m: ModeStats) => string][] = [
  ['Played', (m) => String(m.played)],
  ['Won', (m) => String(m.won)],
  ['Win rate', (m) => (m.played ? `${Math.round(winRate(m) * 100)}%` : '—')],
  ['Current streak', (m) => String(m.currentStreak)],
  ['Best streak', (m) => String(m.bestStreak)],
  ['Best time', (m) => (m.bestTimeMs === null ? '—' : formatTime(m.bestTimeMs))],
  ['Fewest moves', (m) => (m.fewestMoves === null ? '—' : String(m.fewestMoves))],
  ['Best score', (m) => (m.bestScore === null ? '—' : String(m.bestScore))],
];

export function StatsDialog({ open, stats, onClose }: { open: boolean; stats: Stats; onClose(): void }) {
  return (
    <Modal open={open} title="Statistics" onClose={onClose} actions={<button type="button" className="primary" onClick={onClose}>Close</button>}>
      <table className="stats">
        <thead>
          <tr>
            <th />
            <th scope="col">Draw 1</th>
            <th scope="col">Draw 3</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, get]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{get(stats.draw1)}</td>
              <td>{get(stats.draw3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stats.vegasBank !== 0 && <p className="note">Vegas bank: {stats.vegasBank < 0 ? `-$${-stats.vegasBank}` : `$${stats.vegasBank}`}</p>}
    </Modal>
  );
}
