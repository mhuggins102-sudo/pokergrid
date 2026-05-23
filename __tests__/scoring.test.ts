import { Rank, StandardCard, Suit } from '../src/game/cards';
import {
  BonusCard,
  BONUS_DECK_POOL,
  LineContext,
} from '../src/game/bonusCards';
import { emptyGrid, Grid, GRID_SLOTS } from '../src/game/grid';
import { HAND_BASE_VALUE, scoreGrid } from '../src/game/scoring';

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });

const gridWithRow0 = (line: StandardCard[]): Grid => {
  const g: Grid = emptyGrid();
  for (let i = 0; i < 5; i++) g[i] = line[i];
  const junkRanks: Rank[] = ['2', '3', '4', '6', '7'];
  const junkSuits: Suit[] = ['C', 'D', 'S', 'H', 'C'];
  for (let i = 5; i < GRID_SLOTS; i++) {
    g[i] = C(junkRanks[i % junkRanks.length], junkSuits[i % junkSuits.length]);
  }
  return g;
};

const findCard = (id: string): BonusCard => {
  const c = BONUS_DECK_POOL.find(b => b.id === id);
  if (!c) throw new Error(`No bonus card ${id}`);
  return c;
};

describe('scoring (no bonus cards)', () => {
  test('empty grid penalizes all 10 lines as incomplete', () => {
    const { total } = scoreGrid(emptyGrid(), []);
    expect(total).toBe(-250); // 10 lines × -25
  });

  test('base values reflect HAND_BASE_VALUE', () => {
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), []);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.hand).toBe('PAIR');
    expect(row0.base).toBe(HAND_BASE_VALUE.PAIR);
    expect(row0.total).toBe(5);
  });
});

describe('scoring with bonus cards', () => {
  test('Pair ×4 multiplies pair lines', () => {
    const pair4 = findCard('hand-pair-x4');
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), [pair4]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.multiplier).toBe(4);
    expect(row0.total).toBe(20); // ceil(5 * 4)
  });

  test('two bonuses stack multiplicatively on the same line', () => {
    // Pair on row 0 ⇒ Pair ×4 hits AND Row 1 ×2 hits ⇒ ×8 total.
    const pair4 = findCard('hand-pair-x4');
    const row1 = findCard('row-1-x2');
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), [pair4, row1]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.multiplier).toBe(8);
    expect(row0.total).toBe(40); // ceil(5 * 8)
  });

  test('×1.1 per ♥ in line compounds with hearts count', () => {
    const hearts = findCard('suit-density-h');
    // 3 hearts + 2 others → straight (use 4-5-6-7-8 to also be a straight for higher base)
    const line = [C('4', 'H'), C('5', 'H'), C('6', 'H'), C('7', 'C'), C('8', 'D')];
    const { lines } = scoreGrid(gridWithRow0(line), [hearts]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.hand).toBe('STRAIGHT');
    // multiplier = 1 + (1.1^3 - 1) = 1.331; ceil(30 * 1.331) = ceil(39.93) = 40
    expect(row0.multiplier).toBeCloseTo(1.331);
    expect(row0.total).toBe(40);
  });

  test('Rainbow ×2 only triggers on lines with 4+ distinct suits', () => {
    const rainbow = findCard('rainbow-line-x2');
    // 4 distinct suits: H, C, D, S, H (suits: 4)
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const { lines } = scoreGrid(gridWithRow0(line), [rainbow]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.multiplier).toBe(2);
  });

  test('Row 3 ×2 only multiplies row index 2', () => {
    const row3 = findCard('row-3-x2');
    const g = emptyGrid();
    // Build pair in row 0 and pair in row 2
    const pairA = [C('2', 'H'), C('2', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const pairB = [C('3', 'H'), C('3', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    for (let i = 0; i < 5; i++) g[i] = pairA[i];
    for (let i = 0; i < 5; i++) g[10 + i] = pairB[i];
    const { lines } = scoreGrid(g, [row3]);
    const row0 = lines.find(l => l.kind === 'row' && l.index === 0)!;
    const row2 = lines.find(l => l.kind === 'row' && l.index === 2)!;
    expect(row0.multiplier).toBe(1);
    expect(row2.multiplier).toBe(2);
  });
});

describe('incomplete-line penalty', () => {
  test('a line with fewer than 5 cards scores -25', () => {
    const g = emptyGrid();
    // Place 4 cards in row 0 (incomplete) and 0 in others.
    g[0] = C('2', 'H');
    g[1] = C('3', 'H');
    g[2] = C('4', 'H');
    g[3] = C('5', 'H');
    const report = scoreGrid(g, []);
    const row0 = report.lines.find(l => l.kind === 'row' && l.index === 0)!;
    expect(row0.incomplete).toBe(true);
    expect(row0.total).toBe(-25);
    // All other 9 lines also incomplete → 10 lines × -25 = -250 subtotal.
    expect(report.subtotal).toBe(-250);
    expect(report.incompletePenalty).toBe(-250);
  });

  test('a single empty slot at game end penalizes both its row and column', () => {
    // Fill the grid except slot 0.
    const g = emptyGrid();
    let v = 0;
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;
    const suits = ['H','S','D','C'] as const;
    for (let i = 1; i < 25; i++) {
      g[i] = C(ranks[v % ranks.length], suits[v % suits.length]);
      v++;
    }
    const report = scoreGrid(g, []);
    const row0 = report.lines.find(l => l.kind === 'row' && l.index === 0)!;
    const col0 = report.lines.find(l => l.kind === 'col' && l.index === 0)!;
    expect(row0.incomplete).toBe(true);
    expect(col0.incomplete).toBe(true);
    expect(row0.total).toBe(-25);
    expect(col0.total).toBe(-25);
    expect(report.incompletePenalty).toBe(-50);
  });
});

describe('grid-level achievements', () => {
  test('Clean border ×1.2 applies only when no face cards on the border', () => {
    const clean = findCard('clean-border-x1_2');
    // Fill the grid completely with non-face cards so only the border test matters.
    const g: Grid = emptyGrid();
    const ranks2to10: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const suitCycle: Suit[] = ['H', 'C', 'D', 'S'];
    for (let i = 0; i < 25; i++) {
      g[i] = C(ranks2to10[i % ranks2to10.length], suitCycle[i % suitCycle.length]);
    }
    // Force a clean Pair on row 0 for a known scoring delta.
    g[0] = C('2', 'H');
    g[1] = C('2', 'C');
    g[2] = C('5', 'D');
    g[3] = C('8', 'S');
    g[4] = C('10', 'H');

    const noBonus = scoreGrid(g, []).total;
    const withClean = scoreGrid(g, [clean]).total;
    expect(withClean).toBeCloseTo(Math.ceil(noBonus * 1.2));

    // Place a face card on the border → bonus disabled.
    g[20] = C('K', 'C');
    const broken = scoreGrid(g, [clean]).total;
    expect(broken).toBeLessThanOrEqual(scoreGrid(g, []).total);
  });
});
