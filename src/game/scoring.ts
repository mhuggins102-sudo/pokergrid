import {
  applyGridEffects,
  applyLineEffects,
  BonusCard,
  LineContext,
} from './bonusCards';
import { Grid, lines } from './grid';
import { evaluateLine, HandRank } from './hands';

export const HAND_BASE_VALUE: Record<HandRank, number> = {
  HIGH_CARD: 1,
  PAIR: 5,
  TWO_PAIR: 12,
  THREE_OF_A_KIND: 20,
  STRAIGHT: 30,
  FLUSH: 35,
  FULL_HOUSE: 50,
  FOUR_OF_A_KIND: 75,
  STRAIGHT_FLUSH: 120,
  FIVE_OF_A_KIND: 150,
  ROYAL_FLUSH: 200,
};

export const INCOMPLETE_LINE_PENALTY = -25;

export interface ScoredLine extends LineContext {
  base: number;
  multiplier: number;
  flat: number;
  total: number;
  incomplete: boolean; // line has fewer than 5 cards
}

export interface ScoreReport {
  lines: ScoredLine[];
  subtotal: number; // sum of all line totals (including penalties)
  incompletePenalty: number; // sum of all penalty contributions (negative or 0)
  gridMultiplier: number;
  gridFlat: number;
  total: number; // final score: ceil(subtotal * gridMultiplier) + gridFlat
}

export const scoreGrid = (
  grid: Grid,
  bonusCards: readonly BonusCard[]
): ScoreReport => {
  const scored: ScoredLine[] = lines(grid).map(l => {
    const filled = l.cards.filter(c => c !== null).length;
    const incomplete = filled < 5;
    const ctx: LineContext = {
      kind: l.kind,
      index: l.index,
      cards: l.cards,
      hand: evaluateLine(l.cards),
    };
    if (!ctx.hand) {
      return {
        ...ctx,
        base: 0,
        multiplier: 1,
        flat: 0,
        total: incomplete ? INCOMPLETE_LINE_PENALTY : 0,
        incomplete,
      };
    }
    const base = HAND_BASE_VALUE[ctx.hand];
    const { multiplier, flat } = applyLineEffects(ctx, bonusCards);
    const total = Math.ceil(base * multiplier) + flat;
    return { ...ctx, base, multiplier, flat, total, incomplete: false };
  });
  const subtotal = scored.reduce((sum, s) => sum + s.total, 0);
  const incompletePenalty = scored
    .filter(s => s.incomplete)
    .reduce((sum, s) => sum + s.total, 0);
  const { multiplier: gridMultiplier, flat: gridFlat } = applyGridEffects(
    { grid },
    bonusCards
  );
  const total = Math.ceil(subtotal * gridMultiplier) + gridFlat;
  return {
    lines: scored,
    subtotal,
    incompletePenalty,
    gridMultiplier,
    gridFlat,
    total,
  };
};
