import { beforeEach, describe, it, expect } from 'vitest';
import { installLocalStorage } from '../localStorage';
import { fromSaved, loadSavedGame, saveGame, toSaved } from '../../src/game/persist';
import { newSession, sessionReducer, type Session } from '../../src/game/session';
import { KEYS, writeJSON } from '../../src/store/storage';

beforeEach(() => {
  installLocalStorage();
});

function played(): Session {
  let s = newSession(42, 1, 'standard');
  for (let i = 0; i < 4; i++) s = sessionReducer(s, { type: 'turn', moves: [{ type: 'draw' }], autoPlay: false, now: 1000 });
  return sessionReducer(s, { type: 'undo' });
}

describe('saved game', () => {
  it('round-trips through JSON', () => {
    const s = played();
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved(s, 4000))));
    expect(back).not.toBeNull();
    expect(back!.state).toEqual(s.state);
    expect(back!.history).toEqual(s.history);
    expect(back!.redo).toEqual(s.redo);
    expect(back!.undos).toBe(1);
    expect(back!.timer).toEqual({ accumulatedMs: 3000, runningSince: null });
    expect(back!.status).toBe('playing');
  });
  it('rejects wrong versions, bad shapes and illegal moves', () => {
    const good = toSaved(played(), 4000);
    expect(fromSaved({ ...good, v: 2 })).toBeNull();
    expect(fromSaved({ ...good, turns: 'x' })).toBeNull();
    expect(fromSaved({ ...good, turns: [[{ type: 'move', from: 'T0', to: 'F9', count: 1 }]] })).toBeNull();
    expect(fromSaved({ ...good, turns: [[{ type: 'recycle' }]] })).toBeNull();
    expect(fromSaved(null)).toBeNull();
  });
  it('saves to and loads from localStorage', () => {
    const s = played();
    saveGame(s, 4000);
    expect(loadSavedGame()!.state).toEqual(s.state);
    writeJSON(KEYS.game, { garbage: true });
    expect(loadSavedGame()).toBeNull();
  });
});
