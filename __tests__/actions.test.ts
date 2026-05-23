import { Card, Rank, StandardCard, Suit } from '../src/game/cards';
import {
  canDestroy,
  canDrawBonus,
  canHop,
  canSlide,
  destroyableSlots,
  executeDestroy,
  executeHop,
  executeSlide,
  slideDestinationsFrom,
  validHopSwaps,
  validSlideSources,
} from '../src/game/actions';
import { emptyGrid, Grid, placeAt } from '../src/game/grid';

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });
const JK: Card = { kind: 'joker' };

const fillSlots = (slots: Array<[number, Card]>): Grid => {
  let g = emptyGrid();
  for (const [i, c] of slots) g = placeAt(g, i, c);
  return g;
};

describe('♥ Hop (heart) — row/column swaps', () => {
  test('canHop: false when fewer than 2 cards on grid', () => {
    expect(canHop(fillSlots([[0, C('A', 'H')]]))).toBe(false);
    expect(canHop(emptyGrid())).toBe(false);
  });

  test('two cards in same row are a valid pair', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [3, C('2', 'C')],
    ]);
    expect(canHop(g)).toBe(true);
    expect(validHopSwaps(g)).toContainEqual([0, 3]);
  });

  test('two cards in same column are a valid pair', () => {
    const g = fillSlots([
      [0, C('A', 'H')], // R1C1
      [20, C('2', 'C')], // R5C1
    ]);
    expect(validHopSwaps(g)).toContainEqual([0, 20]);
  });

  test('two cards in different row AND column are NOT a valid pair', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [6, C('2', 'C')], // R2C2 — different row and column
    ]);
    expect(validHopSwaps(g)).toEqual([]);
    expect(canHop(g)).toBe(false);
  });

  test('joker can participate in hop', () => {
    const g = fillSlots([
      [0, JK],
      [1, C('A', 'H')],
    ]);
    expect(canHop(g)).toBe(true);
    expect(validHopSwaps(g)).toContainEqual([0, 1]);
  });

  test('executeHop swaps two cards in a row', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [3, C('2', 'C')],
    ]);
    const next = executeHop(g, 0, 3);
    expect(next[0]).toEqual(C('2', 'C'));
    expect(next[3]).toEqual(C('A', 'H'));
  });

  test('executeHop throws when cards do not share a row or column', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [6, C('2', 'C')],
    ]);
    expect(() => executeHop(g, 0, 6)).toThrow();
  });
});

describe('♠ Slide (spade) — free destination in path', () => {
  test('a single card on the grid has slide targets in 4 directions', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    expect(canSlide(g)).toBe(true);
    expect(validSlideSources(g)).toEqual([12]);
  });

  test('slideDestinationsFrom enumerates each empty slot in each direction up to first blocker', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    g = placeAt(g, 14, C('K', 'C')); // blocker to the right of (12) +2
    const moves = slideDestinationsFrom(g, 12);
    const right = moves.filter(m => m.direction === 'right').map(m => m.to);
    expect(right).toEqual([13]); // can land on 13 only, blocked at 14
    const up = moves.filter(m => m.direction === 'up').map(m => m.to).sort((a, b) => a - b);
    expect(up).toEqual([2, 7]);
  });

  test('canSlide is false when no card can move in any direction', () => {
    // Surround the only card on all 4 sides with blockers.
    const g = fillSlots([
      [12, C('A', 'H')], // center
      [7, C('2', 'C')],  // up
      [17, C('3', 'C')], // down
      [11, C('4', 'C')], // left
      [13, C('5', 'C')], // right
    ]);
    // The center is blocked, but the 4 blockers themselves can slide.
    expect(canSlide(g)).toBe(true);

    // Now fully wall it off.
    const fullRow = emptyGrid();
    // single card cornered
    fullRow[0] = C('A', 'H');
    fullRow[1] = C('2', 'C');
    fullRow[5] = C('3', 'C');
    expect(validSlideSources(fullRow).includes(0)).toBe(false); // 0 is cornered with neighbors
  });

  test('executeSlide moves card and empties source', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    const next = executeSlide(g, 12, 13);
    expect(next[12]).toBeNull();
    expect(next[13]).toEqual(C('A', 'H'));
  });

  test('executeSlide throws when source and dest are not in line', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    expect(() => executeSlide(g, 12, 6)).toThrow(); // 6 is diagonal
  });
});

describe('♦ Destroy (diamond) — trash any card on grid', () => {
  test('canDestroy is true when at least one card is on the grid', () => {
    expect(canDestroy(fillSlots([[0, C('A', 'H')]]))).toBe(true);
    expect(canDestroy(emptyGrid())).toBe(false);
  });

  test('destroyableSlots lists every filled slot', () => {
    const g = fillSlots([
      [0, C('A', 'H')],
      [12, JK],
      [5, C('2', 'C')],
    ]);
    expect(destroyableSlots(g).sort((a, b) => a - b)).toEqual([0, 5, 12]);
  });

  test('executeDestroy empties the slot and returns the removed card', () => {
    const g = fillSlots([[12, C('A', 'H')]]);
    const { grid, removed } = executeDestroy(g, 12);
    expect(grid[12]).toBeNull();
    expect(removed).toEqual(C('A', 'H'));
  });

  test('executeDestroy can target a joker', () => {
    const g = fillSlots([[12, JK]]);
    const { grid, removed } = executeDestroy(g, 12);
    expect(grid[12]).toBeNull();
    expect(removed).toEqual(JK);
  });
});

describe('♣ Cards (club) — bonus deck legality', () => {
  test('canDrawBonus reflects bonus deck size', () => {
    expect(canDrawBonus(0)).toBe(false);
    expect(canDrawBonus(1)).toBe(true);
    expect(canDrawBonus(30)).toBe(true);
  });
});
