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

  test('Rainbow ×2 treats wild-supercharged cards as a flexible suit', () => {
    // Regression: a wild that originally rolled a suit already in the
    // line wasn't filling the missing 4th suit, so Rainbow failed to
    // trigger even though the wild SHOULD have counted as the
    // missing distinct suit. Line below has 3 distinct standard
    // suits (H, C, D) plus a wild that originally rolled H — without
    // the fix the wild's H duplicates, distinct count = 3, no
    // trigger. With the fix the wild fills the missing S and the
    // line reads as 4 distinct.
    const rainbow = findCard('rainbow-line-x2');
    const wildH = { ...C('A', 'H'), supercharge: 'wild' as const };
    const line = [C('2', 'H'), C('2', 'C'), C('5', 'D'), wildH, C('K', 'H')];
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
    const withJoker = scoreGrid(g, [card], { discards: [{ kind: 'joker' }] }).total;
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

  test('Diagonal Run triggers per straight diagonal — none / one / both', () => {
    const card = findCard('diagonal-run-x1_25');
    // filledNonPair happens to put all-hearts on the anti-diagonal (slots
    // 4,8,12,16,20 all land on suitCycle[0]='H'), which under the corrected
    // "straight or higher" logic IS a triggering flush. Break that flush so
    // the baseline really has no diagonal hand.
    const breakAntiFlush = (g: Grid) => { g[8] = C('10','C'); };

    const noDiagonal = filledNonPair();
    breakAntiFlush(noDiagonal);
    expect(scoreGrid(noDiagonal, [card]).total).toBe(scoreGrid(noDiagonal, []).total);

    // Main diagonal slots (0,6,12,18,24): place 5-6-7-8-9 so the main is a
    // Straight, anti is not.
    const oneDiag = filledNonPair();
    breakAntiFlush(oneDiag);
    oneDiag[0] = C('5','H');
    oneDiag[6] = C('6','C');
    oneDiag[12] = C('7','D');
    oneDiag[18] = C('8','S');
    oneDiag[24] = C('9','H');
    const base1 = scoreGrid(oneDiag, []).total;
    const with1 = scoreGrid(oneDiag, [card]).total;
    expect(with1).toBe(Math.ceil(base1 * 1.25));

    // Anti diagonal slots (4,8,12,16,20): also a straight. The center (slot
    // 12) is shared with the main, but evaluateLine works on 5-card subsets
    // independently — both diagonals can match the Straight constraint.
    const twoDiag = filledNonPair();
    // Main: 5,6,7,8,9 (Straight)
    twoDiag[0] = C('5','H');
    twoDiag[6] = C('6','C');
    twoDiag[12] = C('7','D');
    twoDiag[18] = C('8','S');
    twoDiag[24] = C('9','H');
    // Anti: 3,4,7,10,J (Straight 3-4-5-6-7 wouldn't reuse the 7 cleanly,
    // so use 3,4,7,10,J for distinct Straight 7-10 not possible). Use
    // 9,10,7,J,Q with the center already = 7. So anti = 9,10,7,J,Q. Hmm
    // those aren't consecutive. Build a straight that includes 7 in the
    // middle: 5,6,7,8,9 again would conflict. Use 7 in middle, plus 8,9
    // on one side and 5,6 on the other — but that overlaps the main.
    //
    // Easier: clobber center to a card that lets both diagonals form
    // straights. Choose center = 7 (shared), main 5,6,7,8,9, anti
    // 9,8,7,6,5 (same ranks, doesn't matter that they overlap card-wise
    // since each diagonal is its own 5 slots).
    twoDiag[4] = C('9','D');
    twoDiag[8] = C('8','H');
    // twoDiag[12] is already '7','D'
    twoDiag[16] = C('6','S');
    twoDiag[20] = C('5','C');
    const base2 = scoreGrid(twoDiag, []).total;
    const with2 = scoreGrid(twoDiag, [card]).total;
    expect(with2).toBe(Math.ceil(base2 * 1.25 * 1.25));
  });

  test('Diagonal Run also triggers on Flush / Full House / better-than-Straight', () => {
    const card = findCard('diagonal-run-x1_25');
    // Main diagonal: a Flush (all ♥, non-consecutive ranks).
    const flushDiag = filledNonPair();
    // filledNonPair leaves the anti-diagonal all-hearts; break it so only
    // the main diagonal triggers.
    flushDiag[8] = C('10','C');
    flushDiag[0] = C('2','H');
    flushDiag[6] = C('5','H');
    flushDiag[12] = C('7','H');
    flushDiag[18] = C('9','H');
    flushDiag[24] = C('J','H');
    const base = scoreGrid(flushDiag, []).total;
    const withCard = scoreGrid(flushDiag, [card]).total;
    expect(withCard).toBe(Math.ceil(base * 1.25));
  });

  test('Symmetric Frame multiplies on matching row pairs / column pairs', () => {
    const card = findCard('symmetric-frame-x1_25');

    // Full grid: R1 & R5 both Pair; C1 & C5 both High Card (which now
    // counts after the High-Card-no-longer-excluded change). Both
    // axes match, so the multiplier stacks to ×1.25².
    const g = emptyGrid();
    g[0] = C('2','H'); g[1] = C('2','C'); g[2] = C('5','D'); g[3] = C('8','S'); g[4] = C('K','H');
    g[20] = C('3','H'); g[21] = C('3','C'); g[22] = C('6','D'); g[23] = C('9','S'); g[24] = C('Q','H');
    g[5] = C('4','D'); g[6] = C('7','S'); g[7] = C('10','H'); g[8] = C('J','D'); g[9] = C('A','C');
    g[10] = C('6','S'); g[11] = C('9','H'); g[12] = C('Q','C'); g[13] = C('4','H'); g[14] = C('7','D');
    g[15] = C('10','C'); g[16] = C('J','S'); g[17] = C('A','D'); g[18] = C('5','S'); g[19] = C('8','C');

    const base = scoreGrid(g, []).total;
    const with1 = scoreGrid(g, [card]).total;
    expect(with1).toBe(Math.ceil(base * 1.25 * 1.25));
  });

  test('Symmetric Frame requires the line to be FULL — incomplete lines never count', () => {
    const card = findCard('symmetric-frame-x1_25');

    // Same R1 / R5 layout but with R1 missing one card so its hand is
    // unscored (null). Row axis must NOT trigger even though both rows
    // would otherwise be a Pair.
    const g = emptyGrid();
    g[0] = C('2','H'); g[1] = C('2','C'); g[2] = C('5','D'); g[3] = C('8','S'); // slot 4 empty
    g[20] = C('3','H'); g[21] = C('3','C'); g[22] = C('6','D'); g[23] = C('9','S'); g[24] = C('Q','H');
    // Fill inner rows enough that columns stay incomplete too (no
    // accidental column match should bump the score).
    g[5] = C('4','D'); g[10] = C('6','S'); g[15] = C('10','C');

    const base = scoreGrid(g, []).total;
    const with1 = scoreGrid(g, [card]).total;
    expect(with1).toBe(base);
  });

  test('Burnout triggers at 20+ perks spent', () => {
    const card = findCard('burnout-x1_25');
    const g = filledNonPair();
    const base = scoreGrid(g, [card]).total;
    expect(base).toBe(scoreGrid(g, []).total); // 0 perks → inactive
    // Plain discards never count toward Burnout, no matter how many.
    const lotsOfDiscards = Array(30).fill(C('2','H'));
    expect(scoreGrid(g, [card], { discards: lotsOfDiscards }).total).toBe(base);
    // 19 perks → still inactive.
    const nineteenPerks = Array(19).fill(C('2','H'));
    expect(scoreGrid(g, [card], { perkSpent: nineteenPerks }).total).toBe(base);
    // 20 perks → ×1.5 (was 1.25, bumped to reward the harder threshold).
    const twentyPerks = Array(20).fill(C('2','H'));
    expect(scoreGrid(g, [card], { perkSpent: twentyPerks }).total).toBe(Math.ceil(base * 1.5));
  });

  test('Frugal triggers at ≤14 perks spent', () => {
    const card = findCard('frugal-x1_5');
    const g = filledNonPair();
    // 0 perks → triggers (perkSpent is the empty array by default).
    expect(scoreGrid(g, [card]).total).toBe(Math.ceil(scoreGrid(g, []).total * 1.5));
    // 14 perks → still triggers (threshold relaxed from 12 to 14).
    const fourteen = Array(14).fill(C('2','H'));
    expect(scoreGrid(g, [card], { perkSpent: fourteen }).total).toBe(
      Math.ceil(scoreGrid(g, [], { perkSpent: fourteen }).total * 1.5)
    );
    // 15 perks → doesn't trigger.
    const fifteen = Array(15).fill(C('2','H'));
    expect(scoreGrid(g, [card], { perkSpent: fifteen }).total).toBe(
      scoreGrid(g, [], { perkSpent: fifteen }).total
    );
    // Discards don't affect Frugal.
    const manyDiscards = Array(30).fill(C('2','H'));
    expect(scoreGrid(g, [card], { discards: manyDiscards }).total).toBe(
      Math.ceil(scoreGrid(g, [], { discards: manyDiscards }).total * 1.5)
    );
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

  test('Patience cancels the incomplete-line penalty without needing the option', () => {
    const patience = findCard('patience-no-penalty');
    const empty = emptyGrid();
    // Without Patience: 10 lines × -25 = -250.
    expect(scoreGrid(empty, []).total).toBe(-250);
    // With Patience: penalty is gone.
    expect(scoreGrid(empty, [patience]).total).toBe(0);

    // Partial grid: 4 cards in row 0 only. Other 9 lines still incomplete,
    // plus row 0 itself (4 cards < 5) → 10 penalty lines without Patience.
    const g = emptyGrid();
    g[0] = C('A','H'); g[1] = C('A','C'); g[2] = C('5','D'); g[3] = C('8','S');
    const withoutPatience = scoreGrid(g, []).total;
    const withPatience = scoreGrid(g, [patience]).total;
    expect(withPatience).toBeGreaterThan(withoutPatience);
    expect(withPatience).toBe(withoutPatience + 250);
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

  test('Monochrome Border ×1.15 (each) — per-edge, stacks up to ×1.15⁴', () => {
    const mono = findCard('monochrome-border-x1_75');
    // Fill the grid with a baseline of mixed-color borders so no edge
    // qualifies. We'll then flip edges to all-red one at a time and
    // confirm each flip adds a single ×1.15 factor.
    const g: Grid = emptyGrid();
    const ranks2to10: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const suitCycle: Suit[] = ['H', 'S', 'D', 'C'];
    for (let i = 0; i < 25; i++) {
      // Alternate suits across slots so borders are mixed by default.
      g[i] = C(ranks2to10[i % ranks2to10.length], suitCycle[i % suitCycle.length]);
    }

    const baseline = scoreGrid(g, [mono]).total;
    const noBonus = scoreGrid(g, []).total;
    expect(baseline).toBe(noBonus); // 0 edges qualify → no multiplier

    // Top edge all red (R1 = slots 0..4 set to H/D suits only).
    g[0] = C('2', 'H'); g[1] = C('3', 'D'); g[2] = C('4', 'H'); g[3] = C('5', 'D'); g[4] = C('6', 'H');
    const noBonusTop = scoreGrid(g, []).total;
    const oneEdge = scoreGrid(g, [mono]).total;
    expect(oneEdge).toBe(Math.ceil(noBonusTop * 1.15));

    // Bottom edge ALSO all red — second factor stacks multiplicatively.
    g[20] = C('7', 'H'); g[21] = C('8', 'D'); g[22] = C('9', 'H'); g[23] = C('10', 'D'); g[24] = C('2', 'H');
    const noBonusTwo = scoreGrid(g, []).total;
    const twoEdges = scoreGrid(g, [mono]).total;
    expect(twoEdges).toBe(Math.ceil(noBonusTwo * 1.15 * 1.15));
  });
});
