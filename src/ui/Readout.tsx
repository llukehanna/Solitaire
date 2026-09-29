import type { Session } from '../game/session';
import { elapsed } from '../game/timer';
import type { Settings } from '../store/settings';
import { formatScore, formatTime } from './format';
import { useNow } from './useNow';

export function Readout({ session, settings, vegasBank }: { session: Session; settings: Settings; vegasBank: number }) {
  const now = useNow(session.timer.runningSince !== null ? 1000 : null);
  const score = formatScore(session, settings, vegasBank);
  return (
    <div className="readout">
      {score !== null && (
        <span>
          Score <b>{score}</b>
          {session.scoring === 'vegas' && (
            <span className="tag" title="Vegas limits passes through the stock, so this deal may not be winnable">Vegas</span>
          )}
        </span>
      )}
      <span>
        Moves <b>{session.state.moves}</b>
      </span>
      <span>
        <span className="sr-only">Time </span>
        <b data-testid="timer">{formatTime(elapsed(session.timer, now))}</b>
      </span>
      <span className="pill">Draw {session.drawCount}</span>
    </div>
  );
}
