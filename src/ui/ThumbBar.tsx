import { Icon, type IconName } from './Icon';

interface ThumbBarProps {
  canUndo: boolean;
  canRedo: boolean;
  busy?: string | null;
  onNew(): void;
  onUndo(): void;
  onRedo(): void;
  onHint?(): void;
  onMore(): void;
}

function ThumbButton({ icon, label, disabled, onClick }: { icon: IconName; label: string; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className="thumb-btn"
      disabled={disabled}
      onClick={(e) => {
        onClick();
        if (e.detail > 0) e.currentTarget.blur(); // pointer click (detail 0 = keyboard): let Space reach the table
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

/** Phone controls within thumb reach. Hidden by CSS outside the phone query. */
export function ThumbBar(p: ThumbBarProps) {
  return (
    <nav className="thumb-bar" aria-label="Game controls">
      <ThumbButton icon="cards" label="New" onClick={p.onNew} />
      <ThumbButton icon="undo" label="Undo" disabled={!p.canUndo} onClick={p.onUndo} />
      {p.onHint && <ThumbButton icon="bulb" label={p.busy === 'hint' ? 'Thinking…' : 'Hint'} disabled={!!p.busy} onClick={p.onHint} />}
      <ThumbButton icon="redo" label="Redo" disabled={!p.canRedo} onClick={p.onRedo} />
      <ThumbButton icon="more" label="More" onClick={p.onMore} />
    </nav>
  );
}
