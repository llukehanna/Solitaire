import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { FLIP_MS, MOVE_MS, TABLE_BASE, appClassName, celebrationAllowed, effectiveAnimation } from './ui/appClass';
import { describeHint, describeTurn } from './ui/announce';
import { NoMovesDialog } from './ui/dialogs/NoMovesDialog';
import { ResultDialog } from './ui/dialogs/ResultDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { playSound } from './ui/sound';
import { Readout } from './ui/Readout';
import { Table } from './ui/Table';
import { Toast, useToast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { turnEffect } from './ui/turnEffect';
import { useGame } from './ui/useGame';
import { useKeyboard } from './ui/useKeyboard';
import { useSolver } from './ui/useSolver';

type DialogName = 'settings' | 'stats' | null;

export default function App() {
  const game = useGame();
  const { session, settings, stats, holdTimer } = game;
  const [dialog, setDialog] = useState<DialogName>(null);
  // Set when a settings change only applies from the next game; shown inline because toasts render under modals.
  const [deferredNote, setDeferredNote] = useState(false);
  const [toast, showToast] = useToast();
  const solver = useSolver(game, showToast);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimer = useRef<number | undefined>(undefined);
  const [showResult, setShowResult] = useState(session.status === 'won');
  // n changes on every announcement so identical messages still mutate the live region and are re-read.
  const [announcement, setAnnouncementState] = useState({ text: '', n: 0 });
  const setAnnouncement = useCallback((text: string) => setAnnouncementState((a) => ({ text, n: a.n + 1 })), []);

  const playing = session.status === 'playing';
  const stuck = playing ? solver.stuck : null;
  const anyDialog = dialog !== null || stuck !== null || showResult;
  const reject = () => {
    if (settings.sound) playSound('nope');
    setAnnouncement("Can't move there.");
  };

  const keys = useKeyboard({
    enabled: playing && !anyDialog,
    state: session.state,
    onTurn: game.turn,
    onStockTap: game.stockTap,
    onUndo: game.undo,
    onRedo: game.redo,
    onHint: solver.requestHint,
    onNew: () => game.newGame(),
    onReject: reject,
    onAnnounce: setAnnouncement,
  });

  // Sounds, announcements and the win sequence react to session transitions.
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
      setAnnouncement('You won!');
      if (settings.sound) playSound('win');
      // Let the last auto-finish card land before the cascade or result dialog covers the table.
      const land = MOVE_MS[effectiveAnimation(settings)];
      window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = window.setTimeout(() => (celebrationAllowed(settings) ? setCelebrate(true) : setShowResult(true)), land + 60);
    } else if (before.status === 'playing' && session.status === 'finishing') {
      setAnnouncement('All cards revealed. Finishing automatically.');
    } else if (session.seed !== before.seed || (session.turns.length === 0 && before.turns.length > 0 && session.undos === 0)) {
      setAnnouncement('New deal.');
    } else if (session.turns.length > before.turns.length) {
      setAnnouncement(describeTurn(session.history[session.history.length - 1], session.turns[session.turns.length - 1]));
    } else if (session.undos > before.undos) {
      setAnnouncement('Move undone.');
    }
    if (session.status !== 'won') {
      window.clearTimeout(celebrateTimer.current);
      setCelebrate(false);
      setShowResult(false);
    }
  }, [session, settings]);

  useEffect(() => {
    holdTimer(anyDialog);
  }, [anyDialog, holdTimer]);

  useEffect(() => {
    if (solver.hint) setAnnouncement(describeHint(session.state, solver.hint));
  }, [solver.hint, setAnnouncement]);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TABLE_BASE[settings.table]);
  }, [settings.table]);

  const closeStuck = (then?: () => void) => () => {
    solver.dismissStuck();
    then?.();
  };

  const anim = effectiveAnimation(settings);
  return (
    <div
      className={appClassName(settings)}
      style={{ '--move-ms': `${MOVE_MS[anim]}ms`, '--flip-ms': `${FLIP_MS[anim]}ms` } as CSSProperties}
    >
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
        readout={<Readout session={session} settings={settings} vegasBank={stats.vegasBank} />}
        table={settings.table}
        onTable={(table) => game.updateSettings({ table })}
      />
      <main className="table-wrap">
        <Table
          state={session.state}
          settings={settings}
          locked={!playing || anyDialog}
          hint={solver.hint}
          focus={keys.focus}
          selection={keys.selection}
          onTurn={game.turn}
          onStockTap={game.stockTap}
          onReject={reject}
          celebrate={celebrate}
          onCelebrated={() => {
            setCelebrate(false);
            setShowResult(true);
          }}
        />
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement.text}
        {announcement.n % 2 ? '' : '\u00a0'}
      </div>
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        deferredNote={deferredNote}
        onChange={(patch) => {
          if (game.updateSettings(patch)) setDeferredNote(true);
        }}
        onClose={() => {
          setDialog(null);
          setDeferredNote(false);
        }}
      />
      <StatsDialog open={dialog === 'stats'} stats={stats} onImport={game.importStats} onClose={() => setDialog(null)} />
      <NoMovesDialog
        kind={stuck}
        scoring={session.scoring}
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
