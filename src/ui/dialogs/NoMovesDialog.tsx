import type { Scoring } from '../../engine/types';
import type { Stuck } from '../useSolver';
import { Modal } from './Modal';

interface Props {
  kind: Stuck;
  scoring: Scoring;
  canUndo: boolean;
  busy: boolean;
  onUndo(): void;
  onRewind(): void;
  onRestart(): void;
  onNewGame(): void;
  onClose(): void;
}

export function NoMovesDialog(p: Props) {
  const lost = p.kind === 'unwinnable';
  return (
    <Modal
      open={p.kind !== null}
      title={lost ? 'No winning line from here' : 'No moves left'}
      onClose={p.onClose}
      actions={
        <>
          <button type="button" onClick={p.onClose}>Keep playing</button>
          {p.canUndo && <button type="button" onClick={p.onUndo}>Undo</button>}
          <button type="button" onClick={p.onRestart}>Restart deal</button>
          <button type="button" onClick={p.onNewGame}>New game</button>
          {p.canUndo && (
            <button type="button" className="primary" disabled={p.busy} onClick={p.onRewind}>
              {p.busy ? 'Searching…' : 'Rewind to last winnable'}
            </button>
          )}
        </>
      }
    >
      <p>
        {lost
          ? `The solver checked every possibility: this position can’t be won. ${
              p.scoring === 'vegas'
                ? 'You can rewind to the last position that could still be won.'
                : 'Every deal starts winnable, so you can rewind to the last position that could still be won.'
            }`
          : 'There are no useful moves left. Rewind to the last position that could still be won, or start over.'}
      </p>
    </Modal>
  );
}
