import {
  BONUS_DECK_POOL,
  BonusCard,
  LineContext,
  powerUpBonusCard,
} from '../src/game/bonusCards';
import { Rank, StandardCard, Suit } from '../src/game/cards';

const findCard = (id: string): BonusCard => {
  const c = BONUS_DECK_POOL.find(b => b.id === id);
  if (!c) throw new Error(`No bonus card with id ${id}`);
  return c;
};

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });

describe('powerUpBonusCard', () => {
  it('scales static multipliers by ×1.2 and rounds to the nearest tenth', () => {
    // The three examples the user worked through when speccing the
    // feature — these are the de-facto contract tests.
    const pair4 = findCard('hand-pair-x4');
    expect(powerUpBonusCard(pair4).multValue).toBe(4.8);

    const flush15 = findCard('hand-flush-x1.5');
    // 1.5 × 1.2 = 1.8 (round-tenth no-op)
    expect(powerUpBonusCard(flush15).multValue).toBe(1.8);

    const row2 = findCard('row-1-x2');
    expect(powerUpBonusCard(row2).multValue).toBe(2.4);
  });

  it('scales suit-density per-card multipliers (1.1 → 1.3)', () => {
    const density = findCard('suit-density-h');
    const powered = powerUpBonusCard(density);
    expect(powered.multValue).toBe(1.3);
    // The compound effect on a 3-heart line goes from 1.1^3 = 1.331 to
    // 1.3^3 = 2.197 — that's the intended power-up bite.
    const line: LineContext = {
      kind: 'row',
      index: 0,
      cards: [C('A', 'H'), C('2', 'H'), C('3', 'H'), C('4', 'C'), C('5', 'D')],
      hand: 'HIGH_CARD',
    };
    const e = powered.lineEffect!(line, powered);
    expect(e.multiplier).toBeCloseTo(Math.pow(1.3, 3), 5);
  });

  it('updates the chip text and detail name to match the new multiplier', () => {
    const powered = powerUpBonusCard(findCard('hand-pair-x4'));
    expect(powered.mult).toBe('×4.8 (each)');
    expect(powered.name).toContain('×4.8');
  });

  it('stacks across repeated power-ups', () => {
    const pair4 = findCard('hand-pair-x4');
    const once = powerUpBonusCard(pair4);
    const twice = powerUpBonusCard(once);
    // 4 → 4.8 → 5.76 → rounded 5.8
    expect(twice.multValue).toBe(5.8);
    expect(twice.powerLevel).toBe(2);
    expect(twice.baseMultValue).toBe(4);
  });

  it('assigns a unique -pwrN id so powered + original can coexist', () => {
    const pair4 = findCard('hand-pair-x4');
    const once = powerUpBonusCard(pair4);
    const twice = powerUpBonusCard(once);
    expect(once.id).toBe('hand-pair-x4-pwr1');
    expect(twice.id).toBe('hand-pair-x4-pwr2');
  });

  it('leaves Patience untouched (no multiplier to scale)', () => {
    const patience = findCard('patience-no-penalty');
    const powered = powerUpBonusCard(patience);
    expect(powered).toBe(patience);
  });

  it('preserves baseMultValue across multiple power-ups', () => {
    const flush15 = findCard('hand-flush-x1.5');
    const once = powerUpBonusCard(flush15);
    const twice = powerUpBonusCard(once);
    expect(once.baseMultValue).toBe(1.5);
    expect(twice.baseMultValue).toBe(1.5);
  });
});
