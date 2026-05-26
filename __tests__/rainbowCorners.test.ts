import { Rank, StandardCard, Suit, Supercharge } from '../src/game/cards';
import { BONUS_DECK_POOL, BonusCard } from '../src/game/bonusCards';
import { emptyGrid, Grid, GRID_SLOTS } from '../src/game/grid';
import { scoreGrid } from '../src/game/scoring';

const C = (
  rank: Rank,
  suit: Suit,
  supercharge?: Supercharge
): StandardCard => ({ kind: 'standard', rank, suit, supercharge });

const findCard = (id: string): BonusCard => {
  const c = BONUS_DECK_POOL.find(b => b.id === id);
  if (!c) throw new Error(`No bonus card ${id}`);
  return c;
};

// Build a grid with specific cards at the four corners (slots 0, 4, 20, 24)
// and filler everywhere else so the grid is "full" and only the corner
// achievement matters.
const gridWithCorners = (tl: StandardCard, tr: StandardCard, bl: StandardCard, br: StandardCard): Grid => {
  const g: Grid = emptyGrid();
  for (let i = 0; i < GRID_SLOTS; i++) {
    g[i] = { kind: 'standard', rank: '7', suit: 'C' };
  }
  g[0] = tl;
  g[4] = tr;
  g[20] = bl;
  g[24] = br;
  return g;
};

describe('Rainbow Corners grid achievement', () => {
  const card = findCard('rainbow-corners-x1_25');

  test('triggers with 4 distinct natural suits', () => {
    const grid = gridWithCorners(C('A', 'H'), C('2', 'S'), C('3', 'D'), C('4', 'C'));
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeCloseTo(1.25);
  });

  test('triggers with 3 distinct natural suits + 1 wild', () => {
    const grid = gridWithCorners(
      C('A', 'H', 'wild'),
      C('2', 'S'),
      C('3', 'D'),
      C('4', 'C')
    );
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeCloseTo(1.25);
  });

  test('triggers with 2 distinct natural suits + 2 wilds', () => {
    const grid = gridWithCorners(
      C('A', 'H', 'wild'),
      C('2', 'S'),
      C('3', 'D'),
      C('4', 'C', 'wild')
    );
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeCloseTo(1.25);
  });

  test('does NOT trigger when non-wild corners have a duplicate suit', () => {
    const grid = gridWithCorners(
      C('A', 'H'),
      C('2', 'H'), // duplicate heart
      C('3', 'D'),
      C('4', 'C', 'wild')
    );
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeUndefined();
  });

  test('does NOT trigger when any corner is missing', () => {
    const grid = gridWithCorners(C('A', 'H'), C('2', 'S'), C('3', 'D'), C('4', 'C'));
    grid[24] = null;
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeUndefined();
  });

  test('triggers with 3 distinct natural suits + the joker', () => {
    // The joker is wild in rank and suit, so it should count as a
    // flexible suit slot for Rainbow Corners — same as a wild-
    // supercharged card. In a Challenge game (which doesn't carry
    // over wild-supercharged cards) this is the only way to land a
    // "flex" corner.
    const grid = gridWithCorners(C('A', 'H'), C('2', 'S'), C('3', 'D'), C('4', 'C'));
    grid[24] = { kind: 'joker' };
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeCloseTo(1.25);
  });

  test('triggers with mixed joker + wild flex corners', () => {
    const grid = gridWithCorners(C('A', 'H', 'wild'), C('2', 'S'), C('3', 'D'), C('4', 'C'));
    grid[24] = { kind: 'joker' };
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeCloseTo(1.25);
  });

  test('does NOT trigger when non-flex corners have a duplicate even with a joker', () => {
    const grid = gridWithCorners(C('A', 'H'), C('2', 'H'), C('3', 'D'), C('4', 'C'));
    grid[24] = { kind: 'joker' };
    const e = card.gridEffect!({ grid, deckRemaining: 0, discards: [], perkSpent: [], lines: [] }, card);
    expect(e.totalMultiplier).toBeUndefined();
  });
});
