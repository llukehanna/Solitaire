import { describe, it, expect } from 'vitest';
import { newSession, sessionReducer, type Session } from '../../src/game/session';
import { elapsed } from '../../src/game/timer';
import { applyMoves } from '../../src/engine/apply';
import { isWon } from '../../src/engine/movegen';
import type { GameState, Move } from '../../src/engine/types';
import { cards, makeState, upTo } from '../helpers';

const draw: Move = { type: 'draw' };
const withState = (state: GameState): Session => ({ ...newSession(1, state.drawCount, state.scoring), state });
const turn = (s: Session, moves: Move[], autoPlay = false, now = 1000) =>
  sessionReducer(s, { type: 'turn', moves, autoPlay, now });

describe('session', () => {
  it('starts playing with a stopped timer', () => {
    const s = newSession(42, 1, 'standard');
    expect(s.status).toBe('playing');
    expect(s.timer.runningSince).toBeNull();
    expect(s.state.seed).toBe(42);
  });

  it('records a turn and starts the timer', () => {
    const s = turn(newSession(42, 1, 'standard'), [draw], false, 5000);
    expect(s.history).toHaveLength(1);
    expect(s.turns).toEqual([[draw]]);
    expect(s.state.waste).toHaveLength(1);
    expect(s.timer.runningSince).toBe(5000);
  });

  it('ignores illegal turns', () => {
    const s = newSession(42, 1, 'standard');
    expect(turn(s, [{ type: 'recycle' }])).toBe(s);
  });

  it('undo and redo round-trip; a new turn clears redo', () => {
    const s0 = newSession(42, 1, 'standard');
    const s1 = turn(s0, [draw]);
    const s2 = turn(s1, [draw]);
    const u = sessionReducer(s2, { type: 'undo' });
    expect(u.state).toEqual(s1.state);
    expect(u.redo).toHaveLength(1);
    expect(u.undos).toBe(1);
    const r = sessionReducer(u, { type: 'redo', now: 2000 });
    expect(r.state).toEqual(s2.state);
    expect(r.redo).toHaveLength(0);
    expect(turn(u, [draw]).redo).toHaveLength(0);
  });

  it('appends safe auto-moves to the same turn when autoPlay is on', () => {
    const s = withState(makeState({ stock: cards('9C'), cols: [['AS', 0]] }));
    const r = turn(s, [draw], true);
    expect(r.turns[0]).toEqual([draw, { type: 'move', from: 'T0', to: 'F0', count: 1 }]);
    expect(sessionReducer(r, { type: 'undo' }).state).toEqual(s.state);
  });

  it('detects a win and stops the timer', () => {
    const s = withState(
      makeState({ foundations: [upTo('S', 12), upTo('H', 13), upTo('D', 13), upTo('C', 13)], cols: [['KS', 0]] }),
    );
    const started = { ...s, timer: { accumulatedMs: 0, runningSince: 0 } };
    const r = turn(started, [{ type: 'move', from: 'T0', to: 'F0', count: 1 }], false, 7000);
    expect(r.status).toBe('won');
    expect(elapsed(r.timer, 99_999)).toBe(7000);
    expect(sessionReducer(r, { type: 'undo' })).toBe(r);
  });

  it('auto-finishes once the last face-down card is revealed', () => {
    const s = withState(
      makeState({
        foundations: [upTo('S', 13), upTo('H', 4), upTo('D', 12), upTo('C', 13)],
        cols: [['6H KD', 1], ['7H', 0], ['8H', 0], ['9H', 0], ['TH', 0], ['JH', 0], ['QH', 0]],
        stock: cards('KH 5H'),
      }),
    );
    let r = turn(s, [{ type: 'move', from: 'T0', to: 'F2', count: 1 }]);
    expect(r.status).toBe('finishing');
    expect(r.turns).toHaveLength(2);
    expect(r.finishQueue.length).toBeGreaterThan(0);
    expect(turn(r, [draw])).toBe(r); // input locked while finishing
    let steps = 0;
    while (r.status === 'finishing') {
      r = sessionReducer(r, { type: 'finishStep', now: 2000 + steps });
      steps++;
    }
    expect(r.status).toBe('won');
    expect(isWon(r.state)).toBe(true);
    expect(isWon(applyMoves(s.state, r.turns.flat()))).toBe(true);
  });

  it('rewinds to a history index, pushing undone turns onto redo in order', () => {
    let s = newSession(42, 1, 'standard');
    for (let i = 0; i < 3; i++) s = turn(s, [draw]);
    const r = sessionReducer(s, { type: 'rewindTo', index: 1 });
    expect(r.state).toEqual(s.history[1]);
    expect(r.turns).toHaveLength(1);
    expect(r.undos).toBe(2);
    const again = sessionReducer(r, { type: 'redo', now: 0 });
    expect(again.state).toEqual(s.history[2]);
  });

  it('restart deals the same seed again', () => {
    const s = turn(newSession(42, 3, 'vegas'), [draw]);
    const r = sessionReducer(s, { type: 'restart' });
    expect(r.state).toEqual(newSession(42, 3, 'vegas').state);
    expect(r.turns).toHaveLength(0);
  });

  it('pause and resume drive the timer; resume waits for the first move', () => {
    const fresh = newSession(42, 1, 'standard');
    expect(sessionReducer(fresh, { type: 'resume', now: 5 })).toBe(fresh);
    const s = turn(fresh, [draw], false, 1000);
    const p = sessionReducer(s, { type: 'pause', now: 3000 });
    expect(p.timer).toEqual({ accumulatedMs: 2000, runningSince: null });
    const q = sessionReducer(p, { type: 'resume', now: 10_000 });
    expect(elapsed(q.timer, 11_000)).toBe(3000);
  });
});
