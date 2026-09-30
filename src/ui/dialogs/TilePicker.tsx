import type { ReactNode } from 'react';

export interface TileOption<T extends string> {
  value: T;
  name: string;
  /** Decorative swatch; the tile's accessible name is `name`. */
  thumb: ReactNode;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly TileOption<T>[];
  /** Tiles per row, as a CSS grid column count. */
  cols: number;
  onChange(v: T): void;
}

/** A radiogroup of visual tiles: label on the left of the header, the current choice's name on the right. */
export function TilePicker<T extends string>({ label, value, options, cols, onChange }: Props<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <div className="tile-picker">
      <div className="tile-head">
        <span className="label">{label}</span>
        <span className="tile-current">{current?.name}</span>
      </div>
      <div className="tiles" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button type="button" key={o.value} role="radio" aria-checked={value === o.value} aria-label={o.name} className="tile" onClick={() => onChange(o.value)}>
            {o.thumb}
            <span className="tile-name" aria-hidden="true">{o.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
