import { useEffect, useState } from 'react';
import { appClassName } from './ui/appClass';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { useGame } from './ui/useGame';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats, holdTimer } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);

  const playing = session.status === 'playing';
  const stuck = playing ? solver.stuck : null;
  const anyDialog = dialog !== null || stuck !== null;
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
      <Toast message={toast} />
    </div>
  );
}
