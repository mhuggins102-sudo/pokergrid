import { Rank, StandardCard, Suit } from '../src/game/cards';
import {
  BonusCard,
  BONUS_DECK_POOL,
  LineContext,
  universalEffectFor,
} from '../src/game/bonusCards';
import { emptyGrid, Grid, GRID_SLOTS } from '../src/game/grid';
import { bonusShapleyValues, HAND_BASE_VALUE, scoreGrid } from '../src/game/scoring';

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

describe('bonusShapleyValues attribution', () => {
  test('sum of values equals the joint bonus contribution (no double-counting)', () => {
    const pair4 = findCard('hand-pair-x4');
    const row1 = findCard('row-1-x2');
    const royal = findCard('royal-touch-x1_5');
    const cards = [pair4, row1, royal];
    // A grid where Row 1 contains a Pair AND an Ace — all three bonuses fire
    // on that one line, which is exactly the case that breaks leave-one-out.
    const line = [C('A', 'H'), C('A', 'C'), C('5', 'D'), C('8', 'S'), C('K', 'H')];
    const g = gridWithRow0(line);
    const opts = {} as const;
    const withAll = scoreGrid(g, cards, opts).total;
    const withNone = scoreGrid(g, [], opts).total;
    const shapley = bonusShapleyValues(g, cards, opts);

    // The whole point of Shapley: shares add up exactly to the joint
    // contribution (modulo per-card rounding, ≤ N points off).
    const sum = shapley.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - (withAll - withNone))).toBeLessThanOrEqual(cards.length);
  });

  test('a card that contributes nothing gets value 0', () => {
    const pair4 = findCard('hand-pair-x4');
    // Pair ×4 on a no-pair line contributes nothing.
    const line = [C('A', 'H'), C('5', 'C'), C('8', 'D'), C('J', 'S'), C('K', 'H')];
    const g = gridWithRow0(line);
    const shapley = bonusShapleyValues(g, [pair4], {});
    expect(shapley[0]).toBe(0);
  });

  test('empty hand returns empty array', () => {
    expect(bonusShapleyValues(emptyGrid(), [], {})).toEqual([]);
  });
});

describe('universal-effect detection (scoring chart)', () => {
  test('suit-density cards are NOT classified as universal', () => {
    const sd = ['suit-density-h', 'suit-density-s', 'suit-density-d', 'suit-density-c'];
    for (const id of sd) {
      const bc = findCard(id);
      // Across all hand types, suit-density should always come back as conditional.
      const hands = ['PAIR', 'FLUSH', 'STRAIGHT', 'FULL_HOUSE'] as const;
      for (const h of hands) {
        expect(universalEffectFor(bc, h)).toBeNull();
      }
    }
  });

  test('hand-type bonus cards ARE universal for their matching hand', () => {
    const pair4 = findCard('hand-pair-x4');
    const eff = universalEffectFor(pair4, 'PAIR');
    expect(eff?.multiplier).toBe(4);
    expect(universalEffectFor(pair4, 'FLUSH')).toBeNull();
  });
});

describe('deck-bank ×1.05/card bonus', () => {
  test('multiplies the final total by 1.05^deckRemaining', () => {
    const deckBank = findCard('deck-bank-x1_05');
    // Grid with row 0 = Pair, rest filled with non-pairing cards.
    const g = emptyGrid();
    const ranks2to10: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const suitCycle: Suit[] = ['H', 'C', 'D', 'S'];
    for (let i = 0; i < 25; i++) {
      g[i] = C(ranks2to10[i % ranks2to10.length], suitCycle[i % suitCycle.length]);
    }
    // Pair on row 0 — well-defined subtotal.
    g[0] = C('2', 'H');
    g[1] = C('2', 'C');
    g[2] = C('5', 'D');
    g[3] = C('8', 'S');
    g[4] = C('10', 'H');

    const baseline = scoreGrid(g, [deckBank], { deckRemaining: 0 }).total;
    const ten = scoreGrid(g, [deckBank], { deckRemaining: 10 }).total;
    // ceil(baseline × 1.05^10), since the card contributes only the multiplier.
    expect(ten).toBe(Math.ceil(baseline * Math.pow(1.05, 10)));
    // Zero deck cards = no effect.
    const zero = scoreGrid(g, [deckBank], { deckRemaining: 0 }).total;
    expect(zero).toBe(baseline);
  });
});

describe('new grid-wide bonuses', () => {
  const filledNonPair = (): Grid => {
    const g = emptyGrid();
    const ranks2to10: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const suitCycle: Suit[] = ['H', 'C', 'D', 'S'];
    for (let i = 0; i < 25; i++) {
      g[i] = C(ranks2to10[i % ranks2to10.length], suitCycle[i % suitCycle.length]);
    }
    // Ensure row 0 is a Pair so subtotal > 0.
    g[0] = C('2', 'H');
    g[1] = C('2', 'C');
    g[2] = C('5', 'D');
    g[3] = C('8', 'S');
    g[4] = C('10', 'H');
    return g;
  };

  test('Trash Joker activates only when the joker is in the trash', () => {
    const card = findCard('trash-joker-x1_25');
    const g = filledNonPair();
    const baseline = scoreGrid(g, [card]).total;
    const withJoker = scoreGrid(g, [card], { trash: [{ kind: 'joker' }] }).total;
    expect(withJoker).toBe(Math.ceil(baseline * 1.25));
  });

  test('No Flushes activates only when no flush of any kind appears', () => {
    const card = findCard('no-flushes-x1_25');
    // First grid: contains a flush in row 0 → bonus should NOT activate.
    const flushGrid = emptyGrid();
    flushGrid[0] = C('2', 'H');
    flushGrid[1] = C('5', 'H');
    flushGrid[2] = C('8', 'H');
    flushGrid[3] = C('10', 'H');
    flushGrid[4] = C('K', 'H');
    // Fill rest non-flush
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const suits: Suit[] = ['C', 'D', 'S'];
    for (let i = 5; i < 25; i++) {
      flushGrid[i] = C(ranks[i % ranks.length], suits[i % suits.length]);
    }
    const flushBase = scoreGrid(flushGrid, []).total;
    const flushWith = scoreGrid(flushGrid, [card]).total;
    expect(flushWith).toBe(flushBase); // unchanged

    // Second grid: row 0 is a Pair (no flush anywhere) → bonus DOES activate.
    const noFlushGrid = filledNonPair();
    const baseNoFlush = scoreGrid(noFlushGrid, []).total;
    const withCard = scoreGrid(noFlushGrid, [card]).total;
    expect(withCard).toBe(Math.ceil(baseNoFlush * 1.25));
  });

  test('Outer Edge multiplies only edge lines (R1/R5/C1/C5)', () => {
    const card = findCard('outer-edge-x1_25');
    const g = emptyGrid();
    // Row 0 = Pair, Row 2 = Pair (both 5-card lines so scoring is comparable).
    const r0 = [C('2','H'), C('2','C'), C('5','D'), C('8','S'), C('K','H')];
    const r2 = [C('3','H'), C('3','C'), C('5','D'), C('8','S'), C('K','H')];
    for (let i = 0; i < 5; i++) g[i] = r0[i];
    for (let i = 0; i < 5; i++) g[10 + i] = r2[i];
    const report = scoreGrid(g, [card]);
    const row0 = report.lines.find(l => l.kind === 'row' && l.index === 0)!;
    const row2 = report.lines.find(l => l.kind === 'row' && l.index === 2)!;
    expect(row0.multiplier).toBe(1.25);
    expect(row2.multiplier).toBe(1);
  });
});

describe('live-score ignore-penalty option', () => {
  test('with ignoreIncompletePenalty, incomplete lines score 0', () => {
    const empty = emptyGrid();
    const live = scoreGrid(empty, [], { ignoreIncompletePenalty: true });
    expect(live.total).toBe(0);
    const final = scoreGrid(empty, []);
    expect(final.total).toBe(-250);
  });
});

describe('grid-level achievements', () => {
  test('Clean border ×1.5 applies only when no face cards on the border', () => {
    const clean = findCard('clean-border-x1_5');
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
    expect(withClean).toBe(Math.ceil(noBonus * 1.5));

    // Place a face card on the border → bonus disabled.
    g[20] = C('K', 'C');
    const broken = scoreGrid(g, [clean]).total;
    expect(broken).toBeLessThanOrEqual(scoreGrid(g, []).total);
  });
});
