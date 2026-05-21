import { Rank, StandardCard, Suit } from '../src/game/cards';
import { emptyGrid, Grid, GRID_SLOTS } from '../src/game/grid';
import { Modifier } from '../src/game/modifiers';
import {
  clubMultiplier,
  HAND_BASE_VALUE,
  scoreGrid,
} from '../src/game/scoring';

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });

// Helper: a 5x5 grid where row 0 is a specific 5-card line and the rest is
// junk that doesn't form any matching line. This isolates scoring to row 0
// for clearer assertions.
const gridWithRow0 = (line: StandardCard[]): Grid => {
  const g: Grid = emptyGrid();
  for (let i = 0; i < 5; i++) g[i] = line[i];
  // Fill remaining slots with a junk sequence that creates only high cards
  // — non-matching ranks/suits so no row/col makes anything.
  const junkRanks: Rank[] = ['2', '3', '4', '6', '7'];
  const junkSuits: Suit[] = ['C', 'D', 'S', 'H', 'C'];
  for (let i = 5; i < GRID_SLOTS; i++) {
    g[i] = C(junkRanks[i % junkRanks.length], junkSuits[i % junkSuits.length]);
  }
  return g;
};

describe('scoring', () => {
  test('empty grid totals 0', () => {
    const { total } = scoreGrid(emptyGrid(), {}, []);
    expect(total).toBe(0);
  });

  test('clubMultiplier: K (pip 13) is 1.52 with pip*4 formula', () => {
    expect(clubMultiplier('PAIR', { PAIR: 13 })).toBeCloseTo(1.52);
    expect(clubMultiplier('PAIR', {})).toBe(1);
  });

  test('clubMultiplier: A (pip 14) is 1.56', () => {
    expect(clubMultiplier('FLUSH', { FLUSH: 14 })).toBeCloseTo(1.56);
  });

  test('club bonus rounds UP at the per-hand level', () => {
    // Pair base = 5. K♣ bonus = ×1.52 → 7.6 → round up to 8
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), { PAIR: 13 }, []);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.hand).toBe('PAIR');
    expect(row0.base).toBe(HAND_BASE_VALUE.PAIR);
    expect(row0.total).toBe(8); // ceil(5 * 1.52) = 8
  });

  test('multiplier and flat bonus stack additively / additively respectively', () => {
    // Pair base 5, with multiplierBoost +1.0 → multiplier=2, total=ceil(5*1*2)+0=10
    const pair2x: Modifier = {
      id: 't.pair2x',
      label: '',
      description: '',
      effect: line => (line.hand === 'PAIR' ? { multiplierBoost: 1.0 } : {}),
    };
    const flat5: Modifier = {
      id: 't.flat5',
      label: '',
      description: '',
      effect: line => (line.hand === 'PAIR' ? { flatAdd: 5 } : {}),
    };
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), {}, [pair2x, flat5]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.modifierMultiplier).toBe(2);
    expect(row0.modifierFlatBonus).toBe(5);
    // ceil(5 * 1 * 2) + 5 = 15
    expect(row0.total).toBe(15);
  });

  test('club + modifier multiplier compose: ceil(base * club * mult) + flat', () => {
    // PAIR base 5, club K♣ → 1.52, modifier pair2x → +1.0 mult
    // total: ceil(5 * 1.52 * 2) = ceil(15.2) = 16
    const pair2x: Modifier = {
      id: 't.pair2x',
      label: '',
      description: '',
      effect: line => (line.hand === 'PAIR' ? { multiplierBoost: 1.0 } : {}),
    };
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), { PAIR: 13 }, [pair2x]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.total).toBe(16);
  });
});
