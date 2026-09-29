import { useState } from 'react';
import { parseImportForm, SOLITAIRED_PREFILL, type ImportFields, type ImportInput } from '../../store/stats';
import { formatTime } from '../format';

const initial: ImportFields = {
  played: String(SOLITAIRED_PREFILL.played),
  won: String(SOLITAIRED_PREFILL.won),
  time: SOLITAIRED_PREFILL.timeMs === null ? '' : formatTime(SOLITAIRED_PREFILL.timeMs),
  moves: SOLITAIRED_PREFILL.moves === null ? '' : String(SOLITAIRED_PREFILL.moves),
};

export function ImportForm({ onImport, onCancel }: { onImport(v: ImportInput): void; onCancel(): void }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof ImportFields, label: string, inputMode: 'numeric' | 'text' = 'numeric') => (
    <label className="field">
      <span className="label">{label}</span>
      <input inputMode={inputMode} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );
  return (
    <form
      className="import"
      onSubmit={(e) => {
        e.preventDefault();
        const r = parseImportForm(f);
        if (r.ok) onImport(r.value);
        else setError(r.error);
      }}
    >
      <p className="note">Adds your solitaired.com Klondike (turn 1) record to Draw 1 on this device. Streaks and score don't carry over.</p>
      <div className="import-grid">
        {field('played', 'Games played')}
        {field('won', 'Games won')}
        {field('time', 'Fastest win (m:ss)', 'text')}
        {field('moves', 'Fewest moves')}
      </div>
      {error && <p className="note error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary">Import</button>
      </div>
    </form>
  );
}
