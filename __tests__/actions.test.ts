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

describe('Spades action (forward 1..pip)', () => {
  test('validSpadeMoves enumerates 1..pip forward destinations only', () => {
    // One card at slot 2. Pip 5: reaches slots 3, 4, 5, 6, 7 (forward only).
    let g = emptyGrid();
    g = placeAt(g, 2, C('A', 'H'));
    const moves = validSpadeMoves(g, C('5', 'S'));
    const tos = moves.map(m => m.to).sort((a, b) => a - b);
    expect(tos).toEqual([3, 4, 5, 6, 7]);
    expect(moves.every(m => m.from === 2)).toBe(true);
    expect(moves.every(m => m.distance >= 1 && m.distance <= 5)).toBe(true);
    // No backward moves anywhere
    expect(moves.find(m => m.to === 22)).toBeUndefined();
    expect(moves.find(m => m.to === 1)).toBeUndefined();
  });

  test('validSpadeMoves wraps forward correctly', () => {
    // Card at slot 23, pip 5: reaches 24, 0, 1, 2, 3 (wrap from 23+1..23+5 % 25).
    let g = emptyGrid();
    g = placeAt(g, 23, C('K', 'C'));
    const moves = validSpadeMoves(g, C('5', 'S'));
    const tos = moves.map(m => m.to).sort((a, b) => a - b);
    expect(tos).toEqual([0, 1, 2, 3, 24]);
  });

  test('validSpadeMoves skips occupied destinations along the path', () => {
    // Card at slot 2, blocker at slot 4. Pip 5: reaches 3, 5, 6, 7 (slot 4 blocked).
    const g = fillSlots([
      [2, C('A', 'H')],
      [4, C('K', 'H')],
    ]);
    const moves = validSpadeMoves(g, C('5', 'S'));
    const fromTwo = moves.filter(m => m.from === 2).map(m => m.to).sort((a, b) => a - b);
    expect(fromTwo).toEqual([3, 5, 6, 7]);
  });

  test('A♠ (pip 1) only reaches the immediately-next slot', () => {
    let g = emptyGrid();
    g = placeAt(g, 7, C('A', 'H'));
    const moves = validSpadeMoves(g, C('A', 'S'));
    expect(moves).toEqual([{ from: 7, to: 8, distance: 1 }]);
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
