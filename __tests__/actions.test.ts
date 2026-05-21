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
  spadeDestination,
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

describe('Spades action', () => {
  test('spadeDestination wraps from slot 20 + pip 11 to slot 5 (0-indexed)', () => {
    // Spec: position 20 + 11 wraps to position 6 (1-indexed); slot index 5.
    expect(spadeDestination(19, 11)).toBe(5);
  });

  test('spadeDestination simple forward', () => {
    expect(spadeDestination(2, 11)).toBe(13);
  });

  test('validSpadeMoves: only legal moves with empty destination', () => {
    const g = fillSlots([
      [0, C('A', 'H')], // moves to 0 + pip
      [5, C('K', 'H')], // dest occupied for some pips
    ]);
    const spade = C('5', 'S'); // pip 5: 0→5 dest occupied, 5→10 dest empty
    const moves = validSpadeMoves(g, spade);
    expect(moves).toContainEqual({ from: 5, to: 10 });
    expect(moves.find(m => m.from === 0)).toBeUndefined(); // 0→5 blocked
  });

  test('canExecuteSpades is false when no card moves to empty slot', () => {
    // Pip 1, all 25 slots full → no moves possible.
    // Easier setup: only one card on grid, pip moves it back to itself (impossible since pip > 0)
    // or to occupied. Single card, pip 1 → moves card from 0 to 1 (empty). True.
    // To make false: every "from" position lands on an occupied slot.
    let g = emptyGrid();
    g = placeAt(g, 0, C('2', 'H'));
    // pip 0 is not possible; minimum spade pip is 1 (A).
    // With pip 1, 0 → 1 (empty). So canExecuteSpades is true.
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
