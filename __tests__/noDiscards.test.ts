import { Card } from '../src/game/cards';
import { findChallenge } from '../src/game/challenges';
import { GameState, newGame, step } from '../src/game/state';
import { seededRng } from '../src/game/deck';

describe("'No Discards' challenge", () => {
  it('exposes a challenge entry with scoreTarget 500', () => {
    const c = findChallenge('no-discards');
    expect(c.id).toBe('no-discards');
    expect(c.scoreTarget).toBe(500);
  });

  it('the reducer ignores DISCARD_NONE when noDiscards is on', () => {
    // newGame seeded so the test is deterministic.
    const rng = seededRng(42);
    const initial: GameState = newGame(
      'hard',
      rng,
      500,
      undefined,
      false,
      true // noDiscards on
    );
    // Whatever was drawn first, attempt to discard it.
    const after = step(initial, { type: 'DISCARD_NONE' });
    // State is unchanged — drawn card still there, discards still empty.
    expect(after).toBe(initial);
    expect(after.discards.length).toBe(0);
    expect(after.drawn).toBe(initial.drawn);
  });

  it('DISCARD_NONE still works in a normal (no-flag) game', () => {
    const rng = seededRng(42);
    const initial: GameState = newGame(
      'hard',
      rng,
      500,
      undefined,
      false,
      false // noDiscards off
    );
    if (initial.drawn === null) throw new Error('expected a drawn card');
    const after = step(initial, { type: 'DISCARD_NONE' });
    // Either the card went to discards (standard) OR was auto-handled
    // (joker auto-places, which path returns same state for DISCARD_NONE).
    // For a standard non-joker draw, discards should have grown by 1.
    if (initial.drawn.kind !== 'joker') {
      expect(after.discards.length).toBe(1);
      expect(after).not.toBe(initial);
    }
  });

  it("the challenge's structural condition is satisfied by reaching the score", () => {
    // The Discard button is hidden + the reducer rejects the action, so
    // the only requirement at scoring time is hitting 500+. conditionMet
    // can be checked with any state — it always passes.
    const c = findChallenge('no-discards');
    const fakeState = newGame('hard', seededRng(1), 500, undefined, false, true);
    const fakeReport = { lines: [], subtotal: 0, incompletePenalty: 0, gridMultiplier: 1, gridFlat: 0, total: 500 } as any;
    expect(c.conditionMet(fakeState, fakeReport)).toBe(true);
  });
});
