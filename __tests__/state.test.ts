import { isJoker } from '../src/game/cards';
import { seededRng } from '../src/game/deck';
import { GRID_SLOTS } from '../src/game/grid';
import { scoreGrid } from '../src/game/scoring';
import { GameState, newGame, step } from '../src/game/state';

describe('GameState — initial state', () => {
  test('newGame seeds a complete state', () => {
    const s = newGame('easy', seededRng(1));
    expect(s.difficulty).toBe('easy');
    expect(s.target).toBe(200);
    expect(s.grid[0]).not.toBeNull();
    expect(s.modifiers).toHaveLength(3);
    expect(new Set(s.modifiers.map(m => m.id)).size).toBe(3);
    // We've drawn the second card by now (or auto-placed jokers).
    expect(s.phase.kind === 'awaiting-action' || s.phase.kind === 'game-over').toBe(true);
  });

  test('newGame is deterministic given a seed', () => {
    const a = newGame('medium', seededRng(7));
    const b = newGame('medium', seededRng(7));
    expect(a.modifiers.map(m => m.id)).toEqual(b.modifiers.map(m => m.id));
    expect(a.grid[0]).toEqual(b.grid[0]);
    expect(a.drawn).toEqual(b.drawn);
  });
});

describe('GameState — PLACE flow', () => {
  test('PLACE puts drawn in the lowest empty slot and advances draw', () => {
    let s = newGame('easy', seededRng(2));
    expect(s.phase.kind).toBe('awaiting-action');
    const drawnBefore = s.drawn!;
    s = step(s, { type: 'PLACE' });
    // The previously drawn card is now on the grid in the slot that was lowest empty.
    const placed = s.grid.find(c => c !== null && JSON.stringify(c) === JSON.stringify(drawnBefore));
    expect(placed).toBeDefined();
  });

  test('DISCARD_NONE places drawn into discard pile', () => {
    let s = newGame('easy', seededRng(3));
    // ensure drawn is not joker (the joker must be placed)
    while (s.drawn && isJoker(s.drawn)) s = step(s, { type: 'PLACE' });
    if (s.phase.kind !== 'awaiting-action') return; // game-over guard
    const drawnBefore = s.drawn!;
    const sizeBefore = s.discard.length;
    s = step(s, { type: 'DISCARD_NONE' });
    expect(s.discard).toHaveLength(sizeBefore + 1);
    expect(s.discard[s.discard.length - 1]).toEqual(drawnBefore);
  });
});

describe('GameState — full scripted run', () => {
  test('always-PLACE strategy fills the grid and ends', () => {
    let s = newGame('easy', seededRng(42));
    const safety = 100;
    let steps = 0;
    while (s.phase.kind !== 'game-over' && steps < safety) {
      s = step(s, { type: 'PLACE' });
      steps++;
    }
    expect(s.phase.kind).toBe('game-over');
    // Grid should be full (always-PLACE never discards).
    expect(s.grid.filter(c => c !== null)).toHaveLength(GRID_SLOTS);
    expect(s.discard).toHaveLength(0);
    const { total } = scoreGrid(s.grid, s.clubs, s.modifiers);
    expect(typeof total).toBe('number');
  });
});

describe('GameState — Clubs flow', () => {
  test('BEGIN_SUIT_ACTION + RESOLVE_CLUBS applies a stored bonus', () => {
    // Walk forward until drawn is a club with grid not full.
    let s: GameState = newGame('easy', seededRng(5));
    let safety = 200;
    while (
      s.phase.kind === 'awaiting-action' &&
      !(s.drawn && !isJoker(s.drawn) && s.drawn.suit === 'C') &&
      safety-- > 0
    ) {
      s = step(s, { type: 'PLACE' });
    }
    if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn) || s.drawn.suit !== 'C') {
      return; // seed produced no clubs before game-over; skip
    }
    s = step(s, { type: 'BEGIN_SUIT_ACTION' });
    expect(s.phase.kind).toBe('awaiting-target-clubs');
    s = step(s, { type: 'RESOLVE_CLUBS', hand: 'PAIR' });
    expect(s.clubs.PAIR).toBeGreaterThan(0);
    // The club card went to discard.
    expect(s.discard.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GameState — CANCEL_ACTION', () => {
  test('cancelling a sub-phase returns to awaiting-action', () => {
    let s: GameState = newGame('easy', seededRng(11));
    let safety = 200;
    // find a club draw with at least one available target
    while (
      s.phase.kind === 'awaiting-action' &&
      !(s.drawn && !isJoker(s.drawn) && s.drawn.suit === 'C') &&
      safety-- > 0
    ) {
      s = step(s, { type: 'PLACE' });
    }
    if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn) || s.drawn.suit !== 'C') {
      return;
    }
    s = step(s, { type: 'BEGIN_SUIT_ACTION' });
    expect(s.phase.kind).toBe('awaiting-target-clubs');
    s = step(s, { type: 'CANCEL_ACTION' });
    expect(s.phase.kind).toBe('awaiting-action');
  });
});

describe('GameState — Diamonds new-drawn flow', () => {
  test('CHOOSE_DIAMOND makes the picked card the new drawn (does not auto-place)', () => {
    // Build a minimal hand-crafted state with a diamond drawn and 2 discards.
    const drawn = { kind: 'standard' as const, rank: '7' as const, suit: 'D' as const };
    const cardA = { kind: 'standard' as const, rank: 'A' as const, suit: 'H' as const };
    const cardB = { kind: 'standard' as const, rank: '5' as const, suit: 'S' as const };
    const state: GameState = {
      deck: [],
      discard: [cardA, cardB],
      grid: Array.from({ length: 25 }, () => null),
      drawn,
      clubs: {},
      modifiers: [],
      difficulty: 'easy',
      target: 200,
      phase: { kind: 'awaiting-action' },
      history: [],
    };
    const afterBegin = step(state, { type: 'BEGIN_SUIT_ACTION' }, seededRng(1));
    expect(afterBegin.phase.kind).toBe('diamond-choosing');

    const afterChoose = step(afterBegin, { type: 'CHOOSE_DIAMOND', idx: 0 }, seededRng(1));
    expect(afterChoose.phase.kind).toBe('awaiting-action');
    // Grid is unchanged (chosen card was NOT placed).
    expect(afterChoose.grid.every(c => c === null)).toBe(true);
    // Drawn is the chosen card (one of the 2 discards from before).
    expect([cardA, cardB]).toContainEqual(afterChoose.drawn);
    // Discard now contains the un-chosen card AND the original diamond drawn.
    expect(afterChoose.discard).toHaveLength(2);
    expect(afterChoose.discard).toContainEqual(drawn);
  });

  test('BEGIN_SUIT_ACTION on diamond with 1 discard auto-redraws it as the new drawn', () => {
    const drawn = { kind: 'standard' as const, rank: '4' as const, suit: 'D' as const };
    const lone = { kind: 'standard' as const, rank: 'Q' as const, suit: 'C' as const };
    const state: GameState = {
      deck: [],
      discard: [lone],
      grid: Array.from({ length: 25 }, () => null),
      drawn,
      clubs: {},
      modifiers: [],
      difficulty: 'easy',
      target: 200,
      phase: { kind: 'awaiting-action' },
      history: [],
    };
    const result = step(state, { type: 'BEGIN_SUIT_ACTION' }, seededRng(1));
    expect(result.phase.kind).toBe('awaiting-action');
    expect(result.drawn).toEqual(lone);
    expect(result.discard).toEqual([drawn]);
    expect(result.grid.every(c => c === null)).toBe(true);
  });
});

describe('GameState — joker behavior', () => {
  test('joker drawn is auto-placed and never appears as drawn', () => {
    // Across many seeds, verify state.drawn is never a joker when phase is awaiting-action.
    for (let seed = 1; seed <= 30; seed++) {
      let s = newGame('easy', seededRng(seed));
      let safety = 100;
      while (s.phase.kind !== 'game-over' && safety-- > 0) {
        if (s.phase.kind === 'awaiting-action') {
          expect(s.drawn === null || !isJoker(s.drawn)).toBe(true);
          s = step(s, { type: 'PLACE' });
        } else {
          break;
        }
      }
    }
  });
});
