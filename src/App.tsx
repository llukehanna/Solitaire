import { useEffect, useRef, useState } from 'react';
import { appClassName, effectiveAnimation } from './ui/appClass';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { ResultDialog } from './ui/dialogs/ResultDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { playSound } from './ui/sound';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { turnEffect } from './ui/turnEffect';
import { useGame } from './ui/useGame';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats, holdTimer } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);
  const [celebrate, setCelebrate] = useState(false);
  const [showResult, setShowResult] = useState(session.status === 'won');

  // Sounds and the win sequence react to state transitions.
  const prev = useRef(session);
  useEffect(() => {
    const before = prev.current;
    prev.current = session;
    if (before === session) return;
    if (settings.sound) {
      const effect = turnEffect(before.state, session.state);
      if (effect) playSound(effect);
    }
    if (before.status !== 'won' && session.status === 'won') {
      if (settings.sound) playSound('win');
      if (effectiveAnimation(settings) === 'off') setShowResult(true);
      else setCelebrate(true);
    }
    if (session.status !== 'won') {
      setCelebrate(false);
      setShowResult(false);
    }
  }, [session, settings]);

  const playing = session.status === 'playing';
  const stuck = playing ? solver.stuck : null;
  const anyDialog = dialog !== null || stuck !== null || showResult;
  useEffect(() => {
    holdTimer(anyDialog);
  }, [anyDialog, holdTimer]);

  const closeStuck = (then?: () => void) => () => {
    solver.dismissStuck();
    then?.();
  };

  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        busy={solver.busy}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onHint={solver.requestHint}
        onCheck={solver.checkWinnable}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || anyDialog}
          hint={solver.hint}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
          onReject={() => settings.sound && playSound('nope')}
          celebrate={celebrate}
          onCelebrated={() => {
            setCelebrate(false);
            setShowResult(true);
          }}
        />
      </main>
      <StatusBar session={session} settings={settings} vegasBank={stats.vegasBank} />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        onChange={(patch) => {
          if (game.updateSettings(patch)) showToast('Applies to your next game');
        }}
        onClose={() => setDialog(null)}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onClose={() => setDialog(null)} />
      <NoMovesDialog
        kind={stuck}
        canUndo={session.history.length > 0}
        busy={solver.busy === 'rewind'}
        onUndo={closeStuck(game.undo)}
        onRewind={solver.rewind}
        onRestart={closeStuck(game.restart)}
        onNewGame={closeStuck(() => game.newGame())}
        onClose={closeStuck()}
      />
      <ResultDialog
        open={showResult}
        session={session}
        stats={stats}
        onNewGame={() => game.newGame()}
        onReplay={game.restart}
        onClose={() => setShowResult(false)}
      />
      <Toast message={toast} />
    </div>
  );
}
