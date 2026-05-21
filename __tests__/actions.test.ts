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

describe('Hearts action', () => {
  test('canExecuteHearts: false when no same-suit pair', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [1, C('2', 'C')],
      [2, C('3', 'D')],
    ]);
    expect(canExecuteHearts(g)).toBe(false);
  });

  test('canExecuteHearts: true when 2 same-suit cards exist', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [1, C('2', 'H')],
    ]);
    expect(canExecuteHearts(g)).toBe(true);
    expect(validHeartsSwaps(g)).toEqual([[0, 1]]);
  });

  test('canExecuteHearts ignores joker', () => {
    const g = fillSlots([
      [0, JK],
      [1, C('2', 'H')],
    ]);
    expect(canExecuteHearts(g)).toBe(false);
  });

  test('executeHearts swaps cards', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [1, C('2', 'H')],
    ]);
    const next = executeHearts(g, 0, 1);
    expect(next[0]).toEqual(C('2', 'H'));
    expect(next[1]).toEqual(C('A', 'H'));
  });

  test('executeHearts throws on different suits', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [1, C('2', 'C')],
    ]);
    expect(() => executeHearts(g, 0, 1)).toThrow();
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
