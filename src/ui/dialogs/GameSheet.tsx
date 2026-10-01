import type { DrawCount } from '../../engine/types';
import { Modal } from './Modal';

interface GameSheetProps {
  open: boolean;
  drawCount: DrawCount;
  onNew(): void;
  onRestart(): void;
  onSwitchDraw(d: DrawCount): void;
  onClose(): void;
}

export function GameSheet(p: GameSheetProps) {
  const pick = (fn: () => void) => () => {
    p.onClose();
    fn();
  };
  return (
    <Modal open={p.open} title="Game" onClose={p.onClose}>
      <div className="sheet-list">
        <button type="button" onClick={pick(p.onNew)}>New game</button>
        <button type="button" onClick={pick(p.onRestart)}>Restart this deal</button>
      </div>
      <div className="seg-row" role="radiogroup" aria-label="Draw">
        {([1, 3] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={p.drawCount === d} onClick={pick(() => p.onSwitchDraw(d))}>
            Draw {d}
          </button>
        ))}
      </div>
    </Modal>
  );
}
