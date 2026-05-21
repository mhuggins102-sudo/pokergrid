import { Grid, lines } from './grid';
import { HandRank, evaluateLine } from './hands';
import { applyModifiers, LineContext, Modifier } from './modifiers';

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

// One club bonus per hand type. The stored value is the pip used by the club
// card (with A=14), and the bonus multiplier is 1 + pip * 2 / 100.
export type ClubBonus = Partial<Record<HandRank, number>>;

export const clubMultiplier = (hand: HandRank, clubs: ClubBonus): number => {
  const pip = clubs[hand];
  if (!pip) return 1;
  return 1 + (pip * 2) / 100;
};

export interface ScoredLine extends LineContext {
  base: number;
  clubBonus: number;
  modifierMultiplier: number;
  modifierFlatBonus: number;
  total: number;
}

export const scoreGrid = (
  grid: Grid,
  clubs: ClubBonus,
  modifiers: readonly Modifier[]
): { lines: ScoredLine[]; total: number } => {
  const scored: ScoredLine[] = lines(grid).map(l => {
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
        clubBonus: 1,
        modifierMultiplier: 1,
        modifierFlatBonus: 0,
        total: 0,
      };
    }
    const base = HAND_BASE_VALUE[ctx.hand];
    const cb = clubMultiplier(ctx.hand, clubs);
    const { multiplier, flat } = applyModifiers(ctx, modifiers);
    const total = Math.ceil(base * cb * multiplier) + flat;
    return {
      ...ctx,
      base,
      clubBonus: cb,
      modifierMultiplier: multiplier,
      modifierFlatBonus: flat,
      total,
    };
  });
  const total = scored.reduce((sum, s) => sum + s.total, 0);
  return { lines: scored, total };
};
