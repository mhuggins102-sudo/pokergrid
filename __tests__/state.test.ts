import { isJoker } from '../src/game/cards';
import { seededRng } from '../src/game/deck';
import { GRID_SLOTS, SPIRAL_ORDER } from '../src/game/grid';
import { scoreGrid } from '../src/game/scoring';
import { GameState, newGame, step } from '../src/game/state';
import { BONUS_DECK_POOL, BONUS_HAND_LIMIT } from '../src/game/bonusCards';

const emptyGrid25 = () => Array.from({ length: 25 }, () => null) as GameState['grid'];

const baseState = (overrides: Partial<GameState>): GameState => ({
  deck: [],
  discards: [],
  perkSpent: [],
  bonusDeck: [...BONUS_DECK_POOL],
  bonusCards: [],
  grid: emptyGrid25(),
  drawn: null,
  difficulty: 'easy',
  target: 200,
  phase: { kind: 'awaiting-action' },
  history: [],
  past: [],
  undoCount: 0,
  ...overrides,
});

describe('GameState — initial state', () => {
  test('newGame seeds a complete state', () => {
    const s = newGame('easy', seededRng(1));
    expect(s.difficulty).toBe('easy');
    expect(s.target).toBe(300);
    // Center slot is filled first (spiral position 1 = slot 12).
    expect(s.grid[12]).not.toBeNull();
    // Easy and Medium each seed 1 starter bonus card from the shuffled deck.
    expect(s.bonusCards).toHaveLength(1);
    expect(s.bonusDeck.length).toBe(BONUS_DECK_POOL.length - 1);

    // Hard still starts empty.
    const hard = newGame('hard', seededRng(1));
    expect(hard.bonusCards).toEqual([]);
    expect(hard.bonusDeck.length).toBe(BONUS_DECK_POOL.length);
    expect(s.discards).toEqual([]);
    expect(s.perkSpent).toEqual([]);
    expect(['awaiting-action', 'game-over']).toContain(s.phase.kind);
  });

  test('PLACE puts the drawn card in spiral order (center first, then to the right)', () => {
    let s = newGame('easy', seededRng(2));
    expect(s.grid[12]).not.toBeNull();
    // Second card is on slot 13 (R3C4) after PLACE.
    const beforeDrawn = s.drawn!;
    s = step(s, { type: 'PLACE' });
    expect(s.grid[13]).toEqual(beforeDrawn);
  });
});

describe('GameState — discard is now trash (no discard pile)', () => {
  test('DISCARD_NONE pushes the drawn card to discards (not perkSpent)', () => {
    let s = newGame('easy', seededRng(3));
    while (s.drawn && isJoker(s.drawn)) s = step(s, { type: 'PLACE' });
    if (s.phase.kind !== 'awaiting-action') return;
    const card = s.drawn!;
    const discardsBefore = s.discards.length;
    const perksBefore = s.perkSpent.length;
    s = step(s, { type: 'DISCARD_NONE' });
    expect(s.discards.length).toBe(discardsBefore + 1);
    expect(s.discards).toContainEqual(card);
    expect(s.perkSpent.length).toBe(perksBefore);
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
    expect(s.grid.filter(c => c !== null)).toHaveLength(GRID_SLOTS);
    const { total } = scoreGrid(s.grid, s.bonusCards);
    expect(typeof total).toBe('number');
  });
});

describe('GameState — suit perks', () => {
  test('♥ Hop trashes the heart and swaps two same-row cards', () => {
    const heart = { kind: 'standard' as const, rank: '5' as const, suit: 'H' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'C' as const };
    const grid = emptyGrid25();
    const onGridA = { kind: 'standard' as const, rank: 'A' as const, suit: 'C' as const };
    const onGridB = { kind: 'standard' as const, rank: 'K' as const, suit: 'D' as const };
    grid[0] = onGridA;
    grid[3] = onGridB;
    const state = baseState({ deck: [filler], grid, drawn: heart });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-hop');
    const after = step(begun, { type: 'RESOLVE_HOP', i: 0, j: 3 });
    expect(after.grid[0]).toEqual(onGridB);
    expect(after.grid[3]).toEqual(onGridA);
    expect(after.perkSpent).toContainEqual(heart);
  });

  test('♠ Slide moves card to selected destination in chosen direction', () => {
    const spade = { kind: 'standard' as const, rank: '3' as const, suit: 'S' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'C' as const };
    const onGrid = { kind: 'standard' as const, rank: 'A' as const, suit: 'H' as const };
    const grid = emptyGrid25();
    grid[10] = onGrid; // R3C1
    const state = baseState({ deck: [filler], grid, drawn: spade });
    const src = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(src.phase.kind).toBe('awaiting-target-slide-source');
    const dest = step(src, { type: 'SLIDE_SELECT_SOURCE', slot: 10 });
    expect(dest.phase.kind).toBe('awaiting-target-slide-dest');
    const after = step(dest, {
      type: 'RESOLVE_SLIDE',
      from: 10,
      direction: 'right',
      distance: 3,
    });
    expect(after.grid[10]).toBeNull();
    expect(after.grid[13]).toEqual(onGrid);
    expect(after.perkSpent).toContainEqual(spade);
  });

  test('♦ Destroy trashes both the diamond and the chosen grid card', () => {
    const diamond = { kind: 'standard' as const, rank: '6' as const, suit: 'D' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'C' as const };
    const target = { kind: 'standard' as const, rank: 'A' as const, suit: 'H' as const };
    const grid = emptyGrid25();
    grid[12] = target;
    const state = baseState({ deck: [filler], grid, drawn: diamond });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('awaiting-target-destroy');
    const after = step(begun, { type: 'RESOLVE_DESTROY', slot: 12 });
    expect(after.grid[12]).toBeNull();
    // Target → discards (collateral, no perk spent). Diamond → perkSpent.
    expect(after.discards).toContainEqual(target);
    expect(after.perkSpent).toContainEqual(diamond);
  });

  test('♦ Destroy can target a joker', () => {
    const diamond = { kind: 'standard' as const, rank: '6' as const, suit: 'D' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'C' as const };
    const grid = emptyGrid25();
    grid[12] = { kind: 'joker' };
    const state = baseState({ deck: [filler], grid, drawn: diamond });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    const after = step(begun, { type: 'RESOLVE_DESTROY', slot: 12 });
    expect(after.grid[12]).toBeNull();
    // Destroyed joker is collateral — lands in discards, not perkSpent.
    expect(after.discards).toContainEqual({ kind: 'joker' });
  });
});

describe('GameState — ♣ Cards bonus draw', () => {
  test('drawing under the limit lets you KEEP one of 2', () => {
    const club = { kind: 'standard' as const, rank: 'K' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'H' as const };
    const state = baseState({ deck: [filler], drawn: club });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    expect(begun.phase.kind).toBe('bonus-card-resolving');
    if (begun.phase.kind !== 'bonus-card-resolving') return;
    expect(begun.phase.drawn).toHaveLength(2);
    const kept = begun.phase.drawn[0];
    const otherDrawn = begun.phase.drawn[1];
    const after = step(begun, { type: 'BONUS_KEEP', idx: 0 });
    expect(after.bonusCards).toEqual([kept]);
    // The un-chosen returned to the bottom of the bonus deck.
    expect(after.bonusDeck[after.bonusDeck.length - 1]).toEqual(otherDrawn);
    // The club itself was spent on a perk.
    expect(after.perkSpent).toContainEqual(club);
  });

  test('at the limit (3 held), declining is a no-op — the player must swap', () => {
    const club = { kind: 'standard' as const, rank: 'K' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'H' as const };
    const held = BONUS_DECK_POOL.slice(0, BONUS_HAND_LIMIT);
    const state = baseState({
      deck: [filler],
      drawn: club,
      bonusCards: held,
      bonusDeck: BONUS_DECK_POOL.slice(BONUS_HAND_LIMIT),
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    if (begun.phase.kind !== 'bonus-card-resolving') return;
    const after = step(begun, { type: 'BONUS_DECLINE' });
    // Phase unchanged, bonus cards unchanged, deck unchanged.
    expect(after.phase.kind).toBe('bonus-card-resolving');
    expect(after.bonusCards).toEqual(held);
  });

  test('declining returns both drawn to the bottom of the deck', () => {
    const club = { kind: 'standard' as const, rank: 'K' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'H' as const };
    const state = baseState({ deck: [filler], drawn: club });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    if (begun.phase.kind !== 'bonus-card-resolving') return;
    const [a, b] = begun.phase.drawn;
    const after = step(begun, { type: 'BONUS_DECLINE' });
    expect(after.bonusCards).toEqual([]);
    // Both drawn returned to the bottom in the order they came.
    expect(after.bonusDeck.slice(-2)).toEqual([a, b]);
  });

  test('at the limit (3 held), SELECT_NEW then REPLACE swaps one out and trashes it conceptually', () => {
    const club = { kind: 'standard' as const, rank: 'K' as const, suit: 'C' as const };
    const filler = { kind: 'standard' as const, rank: '3' as const, suit: 'H' as const };
    // Pre-fill 3 bonus cards from the pool.
    const held = BONUS_DECK_POOL.slice(0, BONUS_HAND_LIMIT);
    const state = baseState({
      deck: [filler],
      drawn: club,
      bonusCards: held,
      bonusDeck: BONUS_DECK_POOL.slice(BONUS_HAND_LIMIT),
    });
    const begun = step(state, { type: 'BEGIN_SUIT_ACTION' });
    if (begun.phase.kind !== 'bonus-card-resolving') return;
    expect(begun.bonusCards).toHaveLength(BONUS_HAND_LIMIT);
    // Try to KEEP without going through SELECT_NEW — should be rejected at limit.
    const noOp = step(begun, { type: 'BONUS_KEEP', idx: 0 });
    expect(noOp.phase.kind).toBe('bonus-card-resolving');
    // Proper path: SELECT_NEW then REPLACE.
    const selecting = step(begun, { type: 'BONUS_SELECT_NEW', idx: 0 });
    expect(selecting.phase.kind).toBe('bonus-card-replacing');
    const after = step(selecting, { type: 'BONUS_REPLACE', oldIdx: 1 });
    expect(after.bonusCards).toHaveLength(BONUS_HAND_LIMIT);
    // The first held card is unchanged, the second was replaced.
    expect(after.bonusCards[0]).toEqual(held[0]);
    expect(after.bonusCards[1]).toEqual(begun.phase.drawn[0]);
    expect(after.bonusCards[2]).toEqual(held[2]);
  });
});

describe('GameState — joker auto-place', () => {
  test('joker drawn from deck is auto-placed and never appears as drawn', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = newGame('easy', seededRng(seed));
      let safety = 100;
      while (s.phase.kind === 'awaiting-action' && safety-- > 0) {
        expect(s.drawn === null || !isJoker(s.drawn)).toBe(true);
        s = step(s, { type: 'PLACE' });
      }
    }
  });
});

describe('GameState — spiral placement order', () => {
  test('after N PLACE actions the first N slots in SPIRAL_ORDER are filled', () => {
    let s = newGame('easy', seededRng(50));
    // Place 5 cards
    for (let i = 0; i < 5 && s.phase.kind === 'awaiting-action'; i++) {
      s = step(s, { type: 'PLACE' });
    }
    // First 6 spiral slots should be filled (1 initial auto-place + up to 5 PLACE).
    const expected = SPIRAL_ORDER.slice(0, 6);
    for (const slot of expected) {
      expect(s.grid[slot]).not.toBeNull();
    }
  });
});

describe('GameState — undo', () => {
  test('UNDO is a no-op with empty past stack', () => {
    const s = newGame('easy', seededRng(7));
    const after = step(s, { type: 'UNDO' });
    expect(after.undoCount).toBe(0);
    expect(after).toBe(s);
  });

  test('PLACE pushes a snapshot; UNDO restores it and bumps undoCount', () => {
    const s = newGame('easy', seededRng(7));
    const drawnBefore = s.drawn;
    const gridBefore = s.grid;
    const afterPlace = step(s, { type: 'PLACE' });
    expect(afterPlace.past.length).toBe(1);
    expect(afterPlace.undoCount).toBe(0);
    expect(afterPlace.grid).not.toEqual(gridBefore); // something changed
    const afterUndo = step(afterPlace, { type: 'UNDO' });
    expect(afterUndo.past.length).toBe(0);
    expect(afterUndo.undoCount).toBe(1);
    expect(afterUndo.drawn).toEqual(drawnBefore);
    expect(afterUndo.grid).toEqual(gridBefore);
  });

  test('multiple PLACEs build a stack; UNDOs walk back through it', () => {
    let s = newGame('easy', seededRng(11));
    const grid0 = s.grid;
    s = step(s, { type: 'PLACE' });
    const grid1 = s.grid;
    s = step(s, { type: 'PLACE' });
    const grid2 = s.grid;
    expect(s.past.length).toBe(2);

    s = step(s, { type: 'UNDO' });
    expect(s.grid).toEqual(grid1);
    expect(s.undoCount).toBe(1);

    s = step(s, { type: 'UNDO' });
    expect(s.grid).toEqual(grid0);
    expect(s.undoCount).toBe(2);
    expect(s.past.length).toBe(0);

    // grid2 was the latest pre-undo state, just confirming the assertions stayed sane
    expect(grid2).not.toEqual(grid1);
  });

  test('CANCEL_ACTION does not push a snapshot', () => {
    const s = newGame('easy', seededRng(11));
    const begin = step(s, { type: 'BEGIN_SUIT_ACTION' });
    // BEGIN may or may not change the phase depending on the drawn card; if it
    // didn't, this is a no-op test which is also valid.
    if (begin === s) return;
    expect(begin.past).toEqual(s.past);
    const cancel = step(begin, { type: 'CANCEL_ACTION' });
    expect(cancel.past).toEqual(s.past);
  });

  test('snapshots store past: [] so the stack stays flat', () => {
    let s = newGame('easy', seededRng(3));
    s = step(s, { type: 'PLACE' });
    s = step(s, { type: 'PLACE' });
    for (const snap of s.past) {
      expect(snap.past).toEqual([]);
    }
  });
});
