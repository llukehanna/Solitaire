import { useEffect, useState } from 'react';
import { winRate, type ImportInput, type ModeStats, type Stats } from '../../store/stats';
import { formatTime } from '../format';
import { ImportForm } from './ImportForm';
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

export function StatsDialog({ open, stats, onImport, onClose }: { open: boolean; stats: Stats; onImport(v: ImportInput): void; onClose(): void }) {
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!open) setImporting(false);
  }, [open]);
  return (
    <Modal
      open={open}
      title="Statistics"
      onClose={onClose}
      actions={importing ? undefined : <button type="button" className="primary" onClick={onClose}>Close</button>}
    >
      {importing ? (
        <ImportForm
          onImport={(v) => {
            onImport(v);
            setImporting(false);
          }}
          onCancel={() => setImporting(false)}
        />
      ) : (
        <>
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
          {stats.draw1.imported ? (
            <p className="note">Imported from solitaired.com on {new Date(stats.draw1.imported.at).toLocaleDateString()}</p>
          ) : (
            <button type="button" className="link-btn" onClick={() => setImporting(true)}>Import from solitaired.com</button>
          )}
        </>
      )}
    </Modal>
  );
}
