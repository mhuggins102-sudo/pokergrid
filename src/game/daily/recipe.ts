// Daily Grid recipe — pure function from dateISO → {difficulty, twist?}.
//
// Every player worldwide gets the same recipe on the same UTC day
// because the function is deterministic from the date string. Twist
// support is wired in but disabled in Phase 1 (TWIST_PROBABILITY = 0)
// per the implementation plan — Phase 3 turns it on.

import type { Difficulty } from '../rules';
import type { ChallengeId } from '../challenges';
import { fnv1a } from './seed';

export interface DailyRecipe {
  difficulty: Difficulty;
  twist?: ChallengeId;
}

// Weighted difficulty distribution (locked per spec):
//   Easy 20% / Medium 35% / Hard 35% / Extreme 10%.
// Anything that adds up cleanly works; the weighted-bag picker
// normalizes against the sum.
export interface RecipeConfig {
  difficultyWeights: Record<Difficulty, number>;
  twistProbability: number;        // 0..1
  // Per-difficulty twist eligibility. Extreme always empty so twists
  // never compound with the hardest baseline (locked decision). Other
  // tiers can host any twist; Phase 3 may narrow these once playtesting
  // reveals which combos feel unfair.
  twistEligibility: Record<Difficulty, ChallengeId[]>;
}

const ALL_TWISTS: ChallengeId[] = [
  'short-circuit',
  'no-discards',
  'gridlock',
  'short-deck',
  'poker-purist',
  'mixed-bag',
  'three-tricks',
];

export const RECIPE_CONFIG: RecipeConfig = {
  difficultyWeights: { easy: 20, medium: 35, hard: 35, extreme: 10 },
  // Phase 3: twists live at 30%. Suppressed on Extreme days so the
  // hardest baseline doesn't compound with a structural handicap.
  twistProbability: 0.3,
  twistEligibility: {
    easy: ALL_TWISTS,
    medium: ALL_TWISTS,
    hard: ALL_TWISTS,
    extreme: [],
  },
};

// Two independent 16-bit channels from a single hash: the high half
// drives difficulty selection, the low half drives twist roll +
// twist-pool index. Splitting like this keeps "difficulty random" and
// "twist random" uncorrelated so a Hard day isn't systematically more
// twist-prone than a Medium day.
const channelsFor = (dateISO: string): { difficultyRoll: number; twistRoll: number; twistIndexRoll: number } => {
  const h = fnv1a(`pokergrid-recipe::${dateISO}`);
  const high = (h >>> 16) & 0xffff;
  const low = h & 0xffff;
  // Split the low half again for twist probability vs. twist index so
  // they don't share the same source.
  return {
    difficultyRoll: high / 0x10000,        // [0, 1)
    twistRoll: (low >>> 8) / 0x100,        // [0, 1) (8 bits)
    twistIndexRoll: low & 0xff,            // 0..255
  };
};

const pickDifficulty = (
  roll: number,
  weights: Record<Difficulty, number>
): Difficulty => {
  const order: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];
  const total = order.reduce((acc, d) => acc + weights[d], 0);
  let cumulative = 0;
  const r = roll * total;
  for (const d of order) {
    cumulative += weights[d];
    if (r < cumulative) return d;
  }
  return 'hard'; // fallback (shouldn't reach in practice)
};

export const recipeFor = (
  dateISO: string,
  config: RecipeConfig = RECIPE_CONFIG
): DailyRecipe => {
  const { difficultyRoll, twistRoll, twistIndexRoll } = channelsFor(dateISO);
  const difficulty = pickDifficulty(difficultyRoll, config.difficultyWeights);
  const eligibleTwists = config.twistEligibility[difficulty];
  if (
    eligibleTwists.length === 0 ||
    twistRoll >= config.twistProbability
  ) {
    return { difficulty };
  }
  const twist = eligibleTwists[twistIndexRoll % eligibleTwists.length];
  return { difficulty, twist };
};
