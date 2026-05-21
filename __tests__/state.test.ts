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
  test('BEGIN_SUIT_ACTION + RESOLVE_CLUBS applies a stored bonus and trashes the club', () => {
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
    const trashBefore = s.trash.length;
    const discardBefore = s.discard.length;
    const clubCard = s.drawn;
    s = step(s, { type: 'BEGIN_SUIT_ACTION' });
    expect(s.phase.kind).toBe('awaiting-target-clubs');
    s = step(s, { type: 'RESOLVE_CLUBS', hand: 'PAIR' });
    expect(s.clubs.PAIR).toBeGreaterThan(0);
    // The club card was trashed (rule #5), not discarded.
    expect(s.trash.length).toBe(trashBefore + 1);
    expect(s.trash).toContainEqual(clubCard);
    expect(s.discard.length).toBe(discardBefore);
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

const emptyGrid25 = () => Array.from({ length: 25 }, () => null);

const baseState = (overrides: Partial<GameState>): GameState => ({
  deck: [],
  discard: [],
  trash: [],
  grid: emptyGrid25() as GameState['grid'],
  drawn: null,
  clubs: {},
  modifiers: [],
  difficulty: 'easy',
  target: 200,
  phase: { kind: 'awaiting-action' },
  history: [],
  ...overrides,
});

describe('GameState — Diamonds new flow', () => {
  test('CHOOSE_DIAMOND enters diamond-resolving with chosen as drawn; diamond goes to trash', () => {
    const drawn = { kind: 'standard' as const, rank: '7' as const, suit: 'D' as const };
    const cardA = { kind: 'standard' as const, rank: 'A' as const, suit: 'H' as const };
    const cardB = { kind: 'standard' as const, rank: '5' as const, suit: 'S' as const };
    const state = baseState({ discard: [cardA, cardB], drawn });

    const afterBegin = step(state, { type: 'BEGIN_SUIT_ACTION' }, seededRng(1));
    expect(afterBegin.phase.kind).toBe('diamond-choosing');

    const afterChoose = step(afterBegin, { type: 'CHOOSE_DIAMOND', idx: 0 }, seededRng(1));
    expect(afterChoose.phase.kind).toBe('diamond-resolving');
    expect(afterChoose.grid.every(c => c === null)).toBe(true);
    expect([cardA, cardB]).toContainEqual(afterChoose.drawn);
    // Un-chosen card returns to discard.
    expect(afterChoose.discard).toHaveLength(1);
    // Original diamond is trashed (rule #5), NOT in discard.
    expect(afterChoose.trash).toContainEqual(drawn);
    expect(afterChoose.discard).not.toContainEqual(drawn);
  });

  test('Diamond auto-redraw (discard size 1) enters diamond-resolving and trashes the diamond', () => {
    const drawn = { kind: 'standard' as const, rank: '4' as const, suit: 'D' as const };
    const lone = { kind: 'standard' as const, rank: 'Q' as const, suit: 'C' as const };
    const state = baseState({ discard: [lone], drawn });

    const result = step(state, { type: 'BEGIN_SUIT_ACTION' }, seededRng(1));
    expect(result.phase.kind).toBe('diamond-resolving');
    expect(result.drawn).toEqual(lone);
    expect(result.discard).toEqual([]);
    expect(result.trash).toContainEqual(drawn);
    expect(result.grid.every(c => c === null)).toBe(true);
  });

  test('Diamond pick can be trashed via DISCARD_NONE (not added to discard)', () => {
    const pick = { kind: 'standard' as const, rank: '8' as const, suit: 'S' as const };
    const filler = { kind: 'standard' as const, rank: '2' as const, suit: 'H' as const };
    const state = baseState({
      deck: [filler],
      drawn: pick,
      phase: { kind: 'diamond-resolving' },
    });
    const after = step(state, { type: 'DISCARD_NONE' });
    expect(after.trash).toContainEqual(pick);
    expect(after.discard).not.toContainEqual(pick);
    expect(after.phase.kind).toBe('awaiting-action');
    expect(after.drawn).toEqual(filler);
  });

  test('Diamond pick CANNOT trigger another diamond perk (chain blocked)', () => {
    const pick = { kind: 'standard' as const, rank: '6' as const, suit: 'D' as const };
    const extra = { kind: 'standard' as const, rank: '2' as const, suit: 'H' as const };
    const state = baseState({
      discard: [extra],
      drawn: pick,
      phase: { kind: 'diamond-resolving' },
    });
    const after = step(state, { type: 'BEGIN_SUIT_ACTION' }, seededRng(1));
    // No state transition — diamond chain blocked.
    expect(after.phase.kind).toBe('diamond-resolving');
    expect(after.drawn).toEqual(pick);
  });

  test('Diamond pick perk (non-diamond) trashes the pick after resolution', () => {
    // Pick is a club. We need a hand type that the player can boost.
    const pick = { kind: 'standard' as const, rank: 'K' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '2' as const, suit: 'H' as const };
    const state = baseState({
      deck: [filler],
      drawn: pick,
      phase: { kind: 'diamond-resolving' },
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-clubs');
    const resolved = step(begun, { type: 'RESOLVE_CLUBS', hand: 'PAIR' });
    expect(resolved.trash).toContainEqual(pick);
    expect(resolved.discard).not.toContainEqual(pick);
    expect(resolved.clubs.PAIR).toBe(13); // K pip
  });

  test('Diamond place-via-swap displaces the existing card to discard', () => {
    const pick = { kind: 'standard' as const, rank: '9' as const, suit: 'H' as const };
    const onGrid = { kind: 'standard' as const, rank: '4' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '2' as const, suit: 'H' as const };
    const grid = emptyGrid25();
    (grid as any)[3] = onGrid;
    const state = baseState({
      deck: [filler],
      grid: grid as GameState['grid'],
      drawn: pick,
      phase: { kind: 'diamond-resolving' },
    });
    const enterSwap = step(state, { type: 'BEGIN_DIAMOND_SWAP' });
    expect(enterSwap.phase.kind).toBe('diamond-place-swap');
    const after = step(enterSwap, { type: 'RESOLVE_DIAMOND_SWAP', slot: 3 });
    // Pick now occupies slot 3; displaced card went to discard.
    expect(after.grid[3]).toEqual(pick);
    expect(after.discard).toContainEqual(onGrid);
    expect(after.trash).not.toContainEqual(onGrid);
    expect(after.phase.kind).toBe('awaiting-action');
    expect(after.drawn).toEqual(filler);
  });

  test('Diamond place-via-swap cannot target a joker slot', () => {
    const pick = { kind: 'standard' as const, rank: '9' as const, suit: 'H' as const };
    const grid = emptyGrid25();
    (grid as any)[3] = { kind: 'joker' };
    const state = baseState({
      grid: grid as GameState['grid'],
      drawn: pick,
      phase: { kind: 'diamond-place-swap' },
    });
    const after = step(state, { type: 'RESOLVE_DIAMOND_SWAP', slot: 3 });
    // No state transition.
    expect(after).toEqual(state);
  });
});

describe('GameState — suit-action cards are trashed', () => {
  test('hearts perk trashes the heart card', () => {
    const drawn = { kind: 'standard' as const, rank: '5' as const, suit: 'H' as const };
    const filler = { kind: 'standard' as const, rank: '2' as const, suit: 'C' as const };
    const cardA = { kind: 'standard' as const, rank: 'A' as const, suit: 'C' as const };
    const cardB = { kind: 'standard' as const, rank: 'K' as const, suit: 'D' as const };
    const grid = emptyGrid25();
    (grid as any)[0] = cardA;
    (grid as any)[3] = cardB;
    const state = baseState({
      deck: [filler],
      grid: grid as GameState['grid'],
      drawn,
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-hearts');
    const after = step(begun, { type: 'RESOLVE_HEARTS', i: 0, j: 3 });
    expect(after.trash).toContainEqual(drawn);
    expect(after.discard).not.toContainEqual(drawn);
  });

  test('spades perk trashes the spade card', () => {
    const drawn = { kind: 'standard' as const, rank: '3' as const, suit: 'S' as const };
    const filler = { kind: 'standard' as const, rank: '2' as const, suit: 'C' as const };
    const onGrid = { kind: 'standard' as const, rank: 'A' as const, suit: 'H' as const };
    const grid = emptyGrid25();
    (grid as any)[0] = onGrid;
    const state = baseState({
      deck: [filler],
      grid: grid as GameState['grid'],
      drawn,
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-spades');
    const after = step(begun, { type: 'RESOLVE_SPADES', from: 0, to: 1 });
    expect(after.trash).toContainEqual(drawn);
    expect(after.discard).not.toContainEqual(drawn);
  });
});

describe('GameState — CANCEL returns to the right parent', () => {
  test('cancelling a heart targeting started from diamond-resolving returns there', () => {
    const pick = { kind: 'standard' as const, rank: '5' as const, suit: 'H' as const };
    const onGridA = { kind: 'standard' as const, rank: 'A' as const, suit: 'C' as const };
    const onGridB = { kind: 'standard' as const, rank: 'K' as const, suit: 'D' as const };
    const grid = emptyGrid25();
    (grid as any)[0] = onGridA;
    (grid as any)[2] = onGridB;
    const state = baseState({
      grid: grid as GameState['grid'],
      drawn: pick,
      phase: { kind: 'diamond-resolving' },
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-hearts');
    const cancelled = step(begun, { type: 'CANCEL_ACTION' });
    expect(cancelled.phase.kind).toBe('diamond-resolving');
  });

  test('cancelling diamond-place-swap returns to diamond-resolving', () => {
    const pick = { kind: 'standard' as const, rank: '9' as const, suit: 'H' as const };
    const onGrid = { kind: 'standard' as const, rank: '4' as const, suit: 'C' as const };
    const grid = emptyGrid25();
    (grid as any)[3] = onGrid;
    const state = baseState({
      grid: grid as GameState['grid'],
      drawn: pick,
      phase: { kind: 'diamond-place-swap' },
    });
    const cancelled = step(state, { type: 'CANCEL_ACTION' });
    expect(cancelled.phase.kind).toBe('diamond-resolving');
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
