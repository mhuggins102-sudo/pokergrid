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

  test('slideDestinationsFrom enumerates each leading-edge destination per direction', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    g = placeAt(g, 14, C('K', 'C')); // blocker to the right of (12) +2
    const moves = slideDestinationsFrom(g, 12);
    const right = moves.filter(m => m.direction === 'right').map(m => m.leadingDest);
    expect(right).toEqual([13]); // single-card chain can only reach slot 13
    const up = moves
      .filter(m => m.direction === 'up')
      .map(m => m.leadingDest)
      .sort((a, b) => a - b);
    expect(up).toEqual([2, 7]);
  });

  test('canSlide is false on an empty grid and on a fully packed grid', () => {
    expect(canSlide(emptyGrid())).toBe(false);

    // Fully packed grid: every chain spans the row/column entirely → nowhere to go.
    let full: Grid = emptyGrid();
    for (let i = 0; i < 25; i++) full = placeAt(full, i, C('2', 'C'));
    expect(canSlide(full)).toBe(false);

    // A surrounded center is itself blocked, but neighbors form chains that
    // can slide outward.
    const g = fillSlots([
      [12, C('A', 'H')],
      [7, C('2', 'C')],
      [17, C('3', 'C')],
      [11, C('4', 'C')],
      [13, C('5', 'C')],
    ]);
    expect(canSlide(g)).toBe(true);
  });

  test('executeSlide moves a single-card chain and empties source', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    const next = executeSlide(g, 12, 'right', 1);
    expect(next[12]).toBeNull();
    expect(next[13]).toEqual(C('A', 'H'));
  });

  test('executeSlide throws when distance exceeds maximum', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    g = placeAt(g, 14, C('K', 'C'));
    // chain at 12, max distance right = 1 (blocked at 14)
    expect(() => executeSlide(g, 12, 'right', 2)).toThrow();
  });

  test('group slide moves a 3-card vertical chain up by 1 (the user\'s example)', () => {
    // C4 = column index 3. R2/R3/R4 filled, R1 empty.
    let g = emptyGrid();
    const a = C('A', 'H');
    const b = C('K', 'C');
    const c = C('Q', 'D');
    g = placeAt(g, 1 * 5 + 3, a); // R2C4 = 8
    g = placeAt(g, 2 * 5 + 3, b); // R3C4 = 13
    g = placeAt(g, 3 * 5 + 3, c); // R4C4 = 18
    // User taps the bottom of the chain (R4C4 = 18) and chooses up by 1.
    const next = executeSlide(g, 18, 'up', 1);
    // After up-1: cards land at R1C4 (=3), R2C4 (=8), R3C4 (=13); R4C4 (=18) empty.
    expect(next[3]).toEqual(a);
    expect(next[8]).toEqual(b);
    expect(next[13]).toEqual(c);
    expect(next[18]).toBeNull();
  });

  test('clicking the back of a chain slides the entire chain (R5 of an R2-R5 column)', () => {
    // Column 3 (C4 in user-facing labels): R2..R5 filled, R1 empty.
    let g = emptyGrid();
    const cards = [C('A', 'H'), C('K', 'C'), C('Q', 'D'), C('J', 'S')];
    g = placeAt(g, 8, cards[0]);  // R2
    g = placeAt(g, 13, cards[1]); // R3
    g = placeAt(g, 18, cards[2]); // R4
    g = placeAt(g, 23, cards[3]); // R5
    const next = executeSlide(g, 23, 'up', 1);
    // All four shift up by 1 row; R5 becomes empty.
    expect(next[3]).toEqual(cards[0]);
    expect(next[8]).toEqual(cards[1]);
    expect(next[13]).toEqual(cards[2]);
    expect(next[18]).toEqual(cards[3]);
    expect(next[23]).toBeNull();
  });

  test('clicking the middle of a chain only slides cards from that point forward', () => {
    // Same column, R2-R5 filled. Click R4 (slot 18), slide up by 1.
    // Only R2/R3/R4 should move; R5 stays put.
    let g = emptyGrid();
    const cards = [C('A', 'H'), C('K', 'C'), C('Q', 'D'), C('J', 'S')];
    g = placeAt(g, 8, cards[0]);
    g = placeAt(g, 13, cards[1]);
    g = placeAt(g, 18, cards[2]);
    g = placeAt(g, 23, cards[3]);
    const next = executeSlide(g, 18, 'up', 1);
    expect(next[3]).toEqual(cards[0]);  // R2's card moved to R1
    expect(next[8]).toEqual(cards[1]);  // R3's card moved to R2
    expect(next[13]).toEqual(cards[2]); // R4's card moved to R3
    expect(next[18]).toBeNull();        // R4 now empty
    expect(next[23]).toEqual(cards[3]); // R5 untouched
  });

  test('group slide max distance respects walls and blockers', () => {
    let g = emptyGrid();
    // Vertical chain at C2 R2-R3 (slots 6, 11). R1=1, R4=16, R5=21 are empty.
    g = placeAt(g, 6, C('A', 'H'));
    g = placeAt(g, 11, C('K', 'C'));
    const moves = slideDestinationsFrom(g, 11);
    const up = moves.filter(m => m.direction === 'up').map(m => m.distance).sort();
    expect(up).toEqual([1]); // can only go up 1 before wall
    const down = moves.filter(m => m.direction === 'down').map(m => m.distance).sort();
    expect(down).toEqual([1, 2]); // can go down 1 or 2 (R4 then R5)
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
