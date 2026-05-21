import { Card, Rank, StandardCard, Suit } from '../src/game/cards';
import { emptyGrid, Grid, placeAt } from '../src/game/grid';
import {
  availableClubTargets,
  canExecuteClubs,
  canExecuteDiamonds,
  canExecuteHearts,
  canExecuteSpades,
  executeClubs,
  executeHearts,
  executeSpades,
  spadeBackward,
  spadeForward,
  validHeartsSwaps,
  validSpadeMoves,
} from '../src/game/actions';

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });
const JK: Card = { kind: 'joker' };

const fillSlots = (slots: Array<[number, Card]>): Grid => {
  let g = emptyGrid();
  for (const [i, c] of slots) g = placeAt(g, i, c);
  return g;
};

describe('Hearts action (distance-based)', () => {
  test('canExecuteHearts: false when only one card on grid', () => {
    const g = fillSlots([[0, C('A', 'H')]]);
    expect(canExecuteHearts(g, C('5', 'H'))).toBe(false);
  });

  test('canExecuteHearts ignores suit — any two cards work if within pip', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [1, C('2', 'C')],
    ]);
    expect(canExecuteHearts(g, C('A', 'H'))).toBe(true);
    expect(validHeartsSwaps(g, C('A', 'H'))).toEqual([[0, 1]]);
  });

  test('joker can be involved in a hearts swap', () => {
    const g = fillSlots([
      [0, JK],
      [1, C('2', 'H')],
    ]);
    expect(canExecuteHearts(g, C('5', 'H'))).toBe(true);
    expect(validHeartsSwaps(g, C('5', 'H'))).toEqual([[0, 1]]);
  });

  test('pip bounds reach: 5♥ from slot 2 reaches slots 3-7 forward and 0-1 backward', () => {
    // Slot 2 = position 3 in user-facing 1-indexed numbering.
    // 5♥: reachable positions 1, 2, 4-8 → slot indices 0, 1, 3, 4, 5, 6, 7
    let g = emptyGrid();
    g = placeAt(g, 2, C('K', 'C')); // anchor card
    for (const idx of [0, 1, 3, 4, 5, 6, 7]) g = placeAt(g, idx, C('2', 'D'));
    const pairs = validHeartsSwaps(g, C('5', 'H'));
    const partnersOf2 = pairs
      .filter(([a, b]) => a === 2 || b === 2)
      .map(([a, b]) => (a === 2 ? b : a))
      .sort((x, y) => x - y);
    expect(partnersOf2).toEqual([0, 1, 3, 4, 5, 6, 7]);
  });

  test('pip wraps backward: 5♥ from slot 2 also reaches slots 22, 23, 24', () => {
    // Position 3 minus 3, 4, 5 wraps to positions 25, 24, 23 → slot indices 24, 23, 22.
    let g = emptyGrid();
    g = placeAt(g, 2, C('K', 'C'));
    for (const idx of [22, 23, 24]) g = placeAt(g, idx, C('2', 'D'));
    const pairs = validHeartsSwaps(g, C('5', 'H'));
    const partnersOf2 = pairs
      .filter(([a, b]) => a === 2 || b === 2)
      .map(([a, b]) => (a === 2 ? b : a))
      .sort((x, y) => x - y);
    expect(partnersOf2).toEqual([22, 23, 24]);
  });

  test('cards just outside the pip radius are unreachable', () => {
    // 5♥ from slot 2: distance 6 (slot 8 or slot 21) is NOT reachable.
    let g = emptyGrid();
    g = placeAt(g, 2, C('K', 'C'));
    g = placeAt(g, 8, C('2', 'D'));
    g = placeAt(g, 21, C('3', 'D'));
    const pairs = validHeartsSwaps(g, C('5', 'H'));
    const partnersOf2 = pairs
      .filter(([a, b]) => a === 2 || b === 2)
      .map(([a, b]) => (a === 2 ? b : a));
    expect(partnersOf2).toEqual([]);
  });

  test('A♥ (pip 1) only reaches immediate neighbors', () => {
    let g = emptyGrid();
    g = placeAt(g, 2, C('K', 'C'));
    g = placeAt(g, 1, C('2', 'D'));
    g = placeAt(g, 3, C('3', 'D'));
    g = placeAt(g, 4, C('4', 'D'));
    const pairs = validHeartsSwaps(g, C('A', 'H'));
    const partnersOf2 = pairs
      .filter(([a, b]) => a === 2 || b === 2)
      .map(([a, b]) => (a === 2 ? b : a))
      .sort((x, y) => x - y);
    expect(partnersOf2).toEqual([1, 3]);
  });

  test('executeHearts swaps any two cards regardless of suit', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [4, C('2', 'C')],
    ]);
    const next = executeHearts(g, 0, 4);
    expect(next[0]).toEqual(C('2', 'C'));
    expect(next[4]).toEqual(C('A', 'H'));
  });
});

describe('Spades action (both directions)', () => {
  test('spadeForward wraps slot 20 + pip 11 to slot 5 (0-indexed)', () => {
    expect(spadeForward(19, 11)).toBe(5);
  });

  test('spadeForward simple forward', () => {
    expect(spadeForward(2, 11)).toBe(13);
  });

  test('spadeBackward wraps slot 2 minus 11 to slot 16', () => {
    // 2 - 11 = -9, +25 = 16
    expect(spadeBackward(2, 11)).toBe(16);
  });

  test('spadeBackward simple backward (no wrap)', () => {
    expect(spadeBackward(13, 5)).toBe(8);
  });

  test('validSpadeMoves includes both forward AND backward destinations', () => {
    // One card at slot 2. Pip 5: forward → 7, backward → 22. Both empty.
    let g = emptyGrid();
    g = placeAt(g, 2, C('A', 'H'));
    const moves = validSpadeMoves(g, C('5', 'S'));
    expect(moves).toContainEqual({ from: 2, to: 7, direction: 'forward' });
    expect(moves).toContainEqual({ from: 2, to: 22, direction: 'backward' });
    expect(moves).toHaveLength(2);
  });

  test('validSpadeMoves blocks occupied destinations in either direction', () => {
    // Card at slot 5 and slot 0. Pip 5.
    // - From slot 0: forward → 5 (occupied), backward → 20 (empty) ✓
    // - From slot 5: forward → 10 (empty) ✓, backward → 0 (occupied)
    const g = fillSlots([
      [0, C('A', 'H')],
      [5, C('K', 'H')],
    ]);
    const moves = validSpadeMoves(g, C('5', 'S'));
    expect(moves).toContainEqual({ from: 0, to: 20, direction: 'backward' });
    expect(moves).toContainEqual({ from: 5, to: 10, direction: 'forward' });
    expect(moves.find(m => m.from === 0 && m.to === 5)).toBeUndefined();
    expect(moves.find(m => m.from === 5 && m.to === 0)).toBeUndefined();
    expect(moves).toHaveLength(2);
  });

  test('canExecuteSpades is true with at least one open destination', () => {
    let g = emptyGrid();
    g = placeAt(g, 0, C('2', 'H'));
    expect(canExecuteSpades(g, C('A', 'S'))).toBe(true);
  });

  test('executeSpades moves card and empties source', () => {
    const g = fillSlots([[3, C('A', 'H')]]);
    const next = executeSpades(g, 3, 8);
    expect(next[3]).toBe(null);
    expect(next[8]).toEqual(C('A', 'H'));
  });
});

describe('Clubs action', () => {
  test('availableClubTargets excludes already-boosted hands', () => {
    const targets = availableClubTargets({ PAIR: 13 });
    expect(targets).not.toContain('PAIR');
    expect(targets).toContain('FLUSH');
  });

  test('canExecuteClubs is true unless every hand is boosted', () => {
    expect(canExecuteClubs({})).toBe(true);
  });

  test('executeClubs records pip (A=14)', () => {
    const out = executeClubs({}, C('A', 'C'), 'FLUSH');
    expect(out.FLUSH).toBe(14);
  });

  test('executeClubs throws when retargeting the same hand type', () => {
    expect(() => executeClubs({ PAIR: 5 }, C('2', 'C'), 'PAIR')).toThrow();
  });
});

describe('Diamonds action', () => {
  test('canExecuteDiamonds: false when discard empty', () => {
    expect(canExecuteDiamonds(0)).toBe(false);
    expect(canExecuteDiamonds(1)).toBe(true);
    expect(canExecuteDiamonds(5)).toBe(true);
  });
});
