import { appClassName } from './ui/appClass';
import { Table } from './ui/Table';
import { useGame } from './ui/useGame';

export default function App() {
  const game = useGame();
  return (
    <div className={appClassName(game.settings)}>
      <main className="table-wrap">
        <Table
          state={game.session.state}
          settings={game.settings}
          locked={game.session.status !== 'playing'}
          hint={null}
          focus={null}
          selection={null}
          onTurn={game.turn}
          onStockTap={game.stockTap}
        />
      </main>
    </div>
  );
}
