import type { Session } from '../../game/session';
import { elapsed } from '../../game/timer';
import type { Stats } from '../../store/stats';
import { formatTime } from '../format';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  session: Session;
  stats: Stats;
  onNewGame(): void;
  onReplay(): void;
  onClose(): void;
}

export function ResultDialog({ open, session, stats, onNewGame, onReplay, onClose }: Props) {
  const mode = session.drawCount === 1 ? stats.draw1 : stats.draw3;
  return (
    <Modal
      open={open}
      title="You won!"
      className="result-dialog"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onReplay}>Replay deal</button>
          <button type="button" className="primary" onClick={onNewGame}>New game</button>
        </>
      }
    >
      <dl className="result">
        <div>
          <dt>Time</dt>
          <dd>{formatTime(elapsed(session.timer, Date.now()))}</dd>
        </div>
        <div>
          <dt>Moves</dt>
          <dd>{session.state.moves}</dd>
        </div>
        {session.scoring !== 'none' && (
          <div>
            <dt>Score</dt>
            <dd>{session.scoring === 'vegas' ? `$${session.state.score}` : session.state.score}</dd>
          </div>
        )}
        <div>
          <dt>Win streak</dt>
          <dd>{mode.currentStreak}</dd>
        </div>
      </dl>
    </Modal>
  );
}
