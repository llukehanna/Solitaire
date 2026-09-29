import { useEffect, useState } from 'react';
import { appClassName } from './ui/appClass';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { StatusBar } from './ui/StatusBar';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { useGame } from './ui/useGame';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats, holdTimer } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    holdTimer(dialog !== null);
  }, [dialog, holdTimer]);

  const playing = session.status === 'playing';
  return (
    <div className={appClassName(settings)}>
      <Toolbar
        canUndo={playing && session.history.length > 0}
        canRedo={playing && session.redo.length > 0}
        drawCount={session.drawCount}
        onNew={() => game.newGame()}
        onRestart={game.restart}
        onSwitchDraw={game.switchDraw}
        onUndo={game.undo}
        onRedo={game.redo}
        onSettings={() => setDialog('settings')}
        onStats={() => setDialog('stats')}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || dialog !== null}
          hint={null}
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
      <Toast message={toast} />
    </div>
  );
}
