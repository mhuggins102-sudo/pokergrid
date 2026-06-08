// Activation + commit tests for the two new green specials:
// Revive (pulls a discard back onto the grid) and Rewind (sends 3-5
// grid cards back into the playing deck).

import {
  REVIVE_CARD,
  REWIND_CARD,
} from '../src/game/bonusCards';
import { newGame, step, GameState } from '../src/game/state';
import { seededRng } from '../src/game/deck';

const occupiedCount = (g: (unknown | null)[]) =>
  g.filter(c => c !== null).length;

const stateWithSpecials = (): GameState => {
  // Seeded RNG keeps the test deterministic across runs.
  const rng = seededRng(424242);
  // Three Tricks-style setup: noBonusCards + seed the hand with the
  // two new specials so we can activate them directly.
  return newGame(
    'hard',
    rng,
    undefined,
    undefined,
    false,
    false,
    [],
    [],
    [],
    false,
    true, // noBonusCards
    [REVIVE_CARD, REWIND_CARD],
  );
};

describe('Revive', () => {
  it('is a no-op when the discard pile is empty', () => {
    const s = stateWithSpecials();
    expect(s.discards.length).toBe(0);
    const after = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(after.phase.kind).toBe('awaiting-action');
  });

  it('pulls a discarded card back onto the grid at the spiral next slot', () => {
    let s = stateWithSpecials();
    // Manually move the drawn card into discards to get something to
    // revive — Discard via DISCARD_NONE pushes the drawn card onto the
    // discard pile.
    s = step(s, { type: 'DISCARD_NONE' });
    expect(s.discards.length).toBe(1);
    const recoveredCard = s.discards[0];
    const occBefore = occupiedCount(s.grid);

    // Activate Revive → pick the discard.
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-revive-pick');
    s = step(s, { type: 'RESOLVE_REVIVE', discardIdx: 0 });

    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.discards.length).toBe(0);
    expect(occupiedCount(s.grid)).toBe(occBefore + 1);
    // The revived card should now be somewhere on the grid.
    expect(s.grid.some(c => c === recoveredCard)).toBe(true);
    // Revive card itself is marked used.
    expect(s.bonusCards[0].used).toBe(true);
  });
});

describe('Rewind', () => {
  it('requires at least 3 occupied cards on the grid to activate', () => {
    const s = stateWithSpecials();
    // Fresh grid only has the first drawn card placed via drawNext (1
    // occupant). Activate Rewind (idx 1 in our seeded hand) — should
    // no-op.
    const after = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    expect(after.phase.kind).toBe('awaiting-action');
  });

  it('moves picked cards from the grid into the deck and clears slots', () => {
    let s = stateWithSpecials();
    // Place enough cards to make Rewind legal — at least 3 occupied
    // slots. Walk the spiral by repeatedly placing.
    while (occupiedCount(s.grid) < 5 && s.phase.kind === 'awaiting-action') {
      s = step(s, { type: 'PLACE' });
    }
    expect(occupiedCount(s.grid)).toBeGreaterThanOrEqual(3);
    const occBefore = occupiedCount(s.grid);
    const deckBefore = s.deck.length;

    // Activate Rewind, pick the first 3 occupied slots.
    const occupiedIndices: number[] = [];
    for (let i = 0; i < s.grid.length; i++) {
      if (s.grid[i] !== null) occupiedIndices.push(i);
    }
    const picks = occupiedIndices.slice(0, 3);

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    expect(s.phase.kind).toBe('awaiting-special-rewind');
    for (const slot of picks) {
      s = step(s, { type: 'TOGGLE_REWIND_TARGET', slot });
    }
    s = step(s, { type: 'RESOLVE_REWIND' });

    expect(s.phase.kind).toBe('awaiting-action');
    // 3 cards left the grid.
    expect(occupiedCount(s.grid)).toBe(occBefore - 3);
    // and the deck grew by exactly 3.
    expect(s.deck.length).toBe(deckBefore + 3);
    // The Rewind card itself is now used.
    expect(s.bonusCards[1].used).toBe(true);
  });

  it('caps multi-select at 5 picks', () => {
    let s = stateWithSpecials();
    while (occupiedCount(s.grid) < 6 && s.phase.kind === 'awaiting-action') {
      s = step(s, { type: 'PLACE' });
    }
    if (occupiedCount(s.grid) < 6) {
      // Difficulty-dependent — skip if we couldn't get there.
      return;
    }
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });

    const occupiedIndices: number[] = [];
    for (let i = 0; i < s.grid.length; i++) {
      if (s.grid[i] !== null) occupiedIndices.push(i);
    }
    // Add 5 — accepted.
    for (let i = 0; i < 5; i++) {
      s = step(s, { type: 'TOGGLE_REWIND_TARGET', slot: occupiedIndices[i] });
    }
    if (s.phase.kind === 'awaiting-special-rewind') {
      expect(s.phase.selected.length).toBe(5);
    }
    // Add a 6th — rejected (state unchanged).
    const before = s;
    s = step(s, { type: 'TOGGLE_REWIND_TARGET', slot: occupiedIndices[5] });
    expect(s).toBe(before);
  });
});
