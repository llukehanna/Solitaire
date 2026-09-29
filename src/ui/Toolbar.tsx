import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { DrawCount } from '../engine/types';
import type { TableTheme } from '../store/settings';
import { Icon, type IconName } from './Icon';
import { TableSwitch } from './TableSwitch';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  drawCount: DrawCount;
  busy?: string | null;
  onNew(): void;
  onRestart(): void;
  onSwitchDraw(d: DrawCount): void;
  onUndo(): void;
  onRedo(): void;
  onHint?(): void;
  onCheck?(): void;
  onSettings(): void;
  onStats(): void;
  readout: ReactNode;
  table: TableTheme;
  onTable(t: TableTheme): void;
}

function TbButton({ icon, label, onClick, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="tb-btn"
      aria-label={label}
      title={label}
      onClick={(e) => {
        onClick?.(e);
        if (e.detail > 0) e.currentTarget.blur(); // pointer click (detail 0 = keyboard): let Space reach the table
      }}
      {...rest}
    >
      <Icon name={icon} />
      <span className="tb-label">{label}</span>
    </button>
  );
}

export function Toolbar(p: ToolbarProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) {
      menu.current.open = false;
      (menu.current.querySelector('summary') as HTMLElement | null)?.blur();
    }
    fn();
  };
  return (
    <header className="toolbar">
      <span className="wordmark">Solitaire</span>
      <details className="menu" ref={menu}>
        <summary className="tb-btn" aria-label="Game menu" title="Game menu">
          <Icon name="cards" />
          <span className="tb-label">New</span>
        </summary>
        <div className="menu-pop" role="menu">
          <button type="button" role="menuitem" onClick={pick(p.onNew)}>New game</button>
          <button type="button" role="menuitem" onClick={pick(p.onRestart)}>Restart this deal</button>
          <hr />
          <button type="button" role="menuitemradio" aria-checked={p.drawCount === 1} onClick={pick(() => p.onSwitchDraw(1))}>Draw 1</button>
          <button type="button" role="menuitemradio" aria-checked={p.drawCount === 3} onClick={pick(() => p.onSwitchDraw(3))}>Draw 3</button>
        </div>
      </details>
      <TbButton icon="undo" label="Undo" disabled={!p.canUndo} onClick={p.onUndo} />
      <TbButton icon="redo" label="Redo" disabled={!p.canRedo} onClick={p.onRedo} />
      {p.onHint && <TbButton icon="bulb" label={p.busy === 'hint' ? 'Thinking…' : 'Hint'} disabled={!!p.busy} onClick={p.onHint} />}
      {p.onCheck && <TbButton icon="check" label="Winnable?" disabled={!!p.busy} onClick={p.onCheck} />}
      <span className="tb-spacer" />
      {p.readout}
      <TableSwitch value={p.table} onChange={p.onTable} />
      <TbButton icon="chart" label="Stats" onClick={p.onStats} />
      <TbButton icon="sliders" label="Settings" onClick={p.onSettings} />
    </header>
  );
}
