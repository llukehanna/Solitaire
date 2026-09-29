import { TABLES, type TableTheme } from '../store/settings';

const NAMES: Record<TableTheme, string> = { studio: 'Studio', felt: 'Felt', paper: 'Paper' };

export function TableSwitch({ value, onChange }: { value: TableTheme; onChange(t: TableTheme): void }) {
  return (
    <div className="table-switch" role="radiogroup" aria-label="Table">
      {TABLES.map((t) => (
        <button
          type="button"
          key={t}
          role="radio"
          aria-checked={value === t}
          aria-label={`${NAMES[t]} table`}
          title={NAMES[t]}
          className={`swatch swatch-${t}`}
          onClick={(e) => {
            onChange(t);
            if (e.detail > 0) e.currentTarget.blur(); // pointer click (detail 0 = keyboard): let Space reach the table
          }}
        />
      ))}
    </div>
  );
}
