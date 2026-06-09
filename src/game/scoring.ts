import { Card } from './cards';
import {
  applyGridEffects,
  applyLineEffects,
  BonusCard,
  LineContext,
} from './bonusCards';
import { Grid, lines } from './grid';
import { evaluateLine, HandRank } from './hands';

export const HAND_BASE_VALUE: Record<HandRank, number> = {
  HIGH_CARD: 0,
  PAIR: 5,
  TWO_PAIR: 12,
  THREE_OF_A_KIND: 20,
  STRAIGHT: 30,
  FLUSH: 40,
  FULL_HOUSE: 50,
  FOUR_OF_A_KIND: 70,
  STRAIGHT_FLUSH: 90,
  ROYAL_FLUSH: 120,
  FIVE_OF_A_KIND: 150,
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

export interface ScoreOptions {
  // Cards remaining in the playing-card deck — used by grid-level bonus cards
  // (e.g. "×1.05 per deck card").
  deckRemaining?: number;
  // For mid-game live previews: treat incomplete lines as 0 (not -25). The
  // penalty only matters at game end; showing it live can be misleading.
  ignoreIncompletePenalty?: boolean;
  // Cards in the discards pile (no-perk ditches + destroyed targets).
  // "Trash Joker" looks here.
  discards?: readonly Card[];
  // Drawn cards spent on suit perks. Burnout / Frugal look here.
  perkSpent?: readonly Card[];
}

/**
 * Shapley-value attribution of the bonus-card contribution.
 *
 * For each held bonus card, returns the fair share of the score it contributes
 * given the other cards. The leave-one-out marginal (with-all minus
 * without-this) double-counts when multiple bonuses multiplicatively stack on
 * the same line — three ×2 cards on a Pair would each show ~5×(8-4)=20 even
 * though the cards together only added 5×(8-1)=35 total.
 *
 * Shapley averages the marginal contribution across every order the cards
 * could have been added. By construction:
 *
 *   sum(shapley) = scoreGrid(grid, allCards, options).total
 *                - scoreGrid(grid, [],       options).total
 *
 * Returned values are rounded to the nearest integer; the tiny rounding drift
 * is bounded by N (≤ 3 cards) so the displayed sum tracks the actual bonus
 * contribution within a few points.
 *
 * Cost: 2^N scoreGrid evaluations. With N capped at 3 (BONUS_HAND_LIMIT) the
 * worst case is 8 evaluations — fast.
 */
const popcount = (n: number): number => {
  let c = 0;
  while (n > 0) { c += n & 1; n >>= 1; }
  return c;
};

export const bonusShapleyValues = (
  grid: Grid,
  cards: readonly BonusCard[],
  options: ScoreOptions = {}
): number[] => {
  const N = cards.length;
  if (N === 0) return [];

  // Precompute total score for every subset of bonuses.
  const subsetTotal: number[] = new Array(1 << N);
  for (let mask = 0; mask < (1 << N); mask++) {
    const subset = cards.filter((_, i) => (mask & (1 << i)) !== 0);
    subsetTotal[mask] = scoreGrid(grid, subset, options).total;
  }

  const fact: number[] = [1];
  for (let i = 1; i <= N; i++) fact.push(fact[i - 1] * i);

  const values: number[] = [];
  for (let i = 0; i < N; i++) {
    let sh = 0;
    for (let mask = 0; mask < (1 << N); mask++) {
      if ((mask & (1 << i)) !== 0) continue; // S must NOT contain i
      const k = popcount(mask);
      const weight = (fact[k] * fact[N - k - 1]) / fact[N];
      sh += weight * (subsetTotal[mask | (1 << i)] - subsetTotal[mask]);
    }
    values.push(Math.round(sh));
  }
  return values;
};

export const scoreGrid = (
  grid: Grid,
  bonusCards: readonly BonusCard[],
  options: ScoreOptions = {}
): ScoreReport => {
  const deckRemaining = options.deckRemaining ?? 0;
  // The penalty is skipped during live-preview scoring (option) AND when the
  // player holds Patience. Either route reaches the same place.
  const ignorePenalty =
    (options.ignoreIncompletePenalty ?? false) ||
    bonusCards.some(c => c.negatesIncompletePenalty);
  const discards = options.discards ?? [];
  const perkSpent = options.perkSpent ?? [];
  // First pass — build every LineContext up front (kind / index /
  // cards / hand) WITHOUT yet applying bonus effects. Cross-line
  // bonus cards (Lowhand) need to compare the current line against
  // the rest of the board; supplying allCtxs to applyLineEffects
  // below gives them that visibility. Single-line cards ignore the
  // extra argument and behave exactly as before.
  const allCtxs: LineContext[] = lines(grid).map(l => ({
    kind: l.kind,
    index: l.index,
    cards: l.cards,
    hand: evaluateLine(l.cards),
  }));
  const scored: ScoredLine[] = allCtxs.map(ctx => {
    const filled = ctx.cards.filter(c => c !== null).length;
    const incomplete = filled < 5;
    if (!ctx.hand) {
      const total = incomplete && !ignorePenalty ? INCOMPLETE_LINE_PENALTY : 0;
      return { ...ctx, base: 0, multiplier: 1, flat: 0, total, incomplete };
    }
    const base = HAND_BASE_VALUE[ctx.hand];
    const { multiplier, flat } = applyLineEffects(ctx, bonusCards, allCtxs);
    const total = Math.ceil(base * multiplier) + flat;
    return { ...ctx, base, multiplier, flat, total, incomplete: false };
  });
  const subtotal = scored.reduce((sum, s) => sum + s.total, 0);
  const incompletePenalty = scored
    .filter(s => s.incomplete)
    .reduce((sum, s) => sum + s.total, 0);
  const { multiplier: gridMultiplier, flat: gridFlat } = applyGridEffects(
    { grid, deckRemaining, discards, perkSpent, lines: scored },
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
