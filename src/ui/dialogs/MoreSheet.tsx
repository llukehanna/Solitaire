import { Modal } from './Modal';

interface MoreSheetProps {
  open: boolean;
  busy?: string | null;
  onStats(): void;
  onSettings(): void;
  onCheck?(): void;
  onClose(): void;
}

export function MoreSheet(p: MoreSheetProps) {
  return (
    <Modal open={p.open} title="More" onClose={p.onClose}>
      <div className="sheet-list">
        <button type="button" onClick={p.onStats}>Stats</button>
        <button type="button" onClick={p.onSettings}>Settings</button>
        {p.onCheck && (
          <button type="button" disabled={!!p.busy} onClick={p.onCheck}>
            Winnable?
          </button>
        )}
      </div>
    </Modal>
  );
}
