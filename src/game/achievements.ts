import { isJoker } from './cards';
import { HandRank } from './hands';
import { ScoreReport } from './scoring';
import type { GameState } from './state';
import { CHALLENGES } from './challenges';
import type { Difficulty } from './rules';

// ============================================================================
// Achievements — passive accomplishments earned through play.
//
// Three tiers:
//   - 'easy'         : Free Play on Easy only.
//   - 'hard-extreme' : Free Play on Hard or Extreme only.
//   - 'milestone'    : longer-term cumulative goals (wins across modes,
//                      challenge completion totals, etc.) plus a couple of
//                      one-shot prowess achievements that don't fit a
//                      single-difficulty tier.
//
// Medium runs are deliberately ineligible for tiered achievements. Targets
// Up and Challenges contribute to milestones but don't have their own
// tier sets.
//
// Every achievement has:
//   - id: stable string saved into stats.achievementsDone
//   - tier: gates how the run / stats are checked
//   - name / description: shown on the AchievementsScreen and the result-
//     screen "earned" callout. The Achievements page renders the tier as
//     a section header, so descriptions DON'T repeat the difficulty.
//   - scoreTarget?: minimum score for the run to qualify (tiered only).
//   - conditionMet: checks the run / cumulative state.
// ============================================================================

export type AchievementTier = 'easy' | 'hard-extreme' | 'milestone';

// Pair, Two Pair, and Three of a Kind — and anything that scored nothing
// (no hand). Used by the Low Hands achievement.
const LOW_OR_NONE: Set<HandRank> = new Set<HandRank>([
  'HIGH_CARD',
  'PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
]);

export type AchievementId =
  | 'balanced'
  | 'dynamite'
  | 'jokerless'
  | 'no-swap'
  | 'grid-only'
  | 'line-only'
  | 'low-hands'
  | 'high-hands'
  | 'easy-overshot'
  | 'easy-grand'
  | 'easy-soloist'
  // Milestones
  | 'win-every-difficulty'
  | 'perfect-every-difficulty'
  | 'wins-25'
  | 'wins-100'
  | 'all-challenges'
  | 'full-bonus-hand';

// Minimal subset of stats / run data the milestone-tier conditions need.
// Filled in by ResultScreen against the post-run stats, so e.g. the
// "win 25 games" milestone fires when the qualifying run pushes the
// total past the threshold. Separating this from the raw Stats type
// keeps src/game/ from importing src/ui/.
export interface MilestoneInputs {
  // Per-difficulty Free Play wins (post-run).
  winsByDifficulty: Record<Difficulty, number>;
  // Per-difficulty SS-tier Free Play wins (post-run).
  ssByDifficulty: Record<Difficulty, number>;
  // Total Free Play wins across all difficulties (post-run).
  totalWins: number;
  // Number of completed Challenges and the size of the catalog.
  challengesCompleted: number;
  totalChallenges: number;
  // Per-card Shapley contribution for the held bonus cards on this
  // run. Index-aligned with state.bonusCards.
  runBonusShapley: number[];
  // True if the current run was a Free Play context (vs Targets Up or
  // Challenge). Milestones that only fire on Free Play wins use this.
  runWasFreePlay: boolean;
  // How many distinct cards from BONUS_DECK_POOL have ever scored
  // (Shapley > 0) including the current run, and the size of the
  // pool itself. The Full Slate milestone fires when these match.
  uniqueBonusCardsScored: number;
  totalBonusCardsInPool: number;
}

export interface AchievementCheckCtx {
  state: GameState;
  report: ScoreReport;
  milestone: MilestoneInputs;
  // Which play mode produced this run. Achievements only count from
  // Free Play, except for 'all-challenges' which fires when the
  // qualifying Challenge run clears the last entry in the catalog.
  mode: 'free' | 'targets-up' | 'challenge';
}

export interface Achievement {
  id: AchievementId;
  tier: AchievementTier;
  name: string;
  description: string;
  // Optional — undefined for milestones whose floor isn't a single
  // per-run score.
  scoreTarget?: number;
  conditionMet: (ctx: AchievementCheckCtx) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ---------- Easy tier ----------
  {
    id: 'easy-overshot',
    tier: 'easy',
    name: 'Overshot',
    description: 'Score 750+ points.',
    scoreTarget: 750,
    conditionMet: () => true,
  },
  {
    id: 'easy-grand',
    tier: 'easy',
    name: 'Grand',
    description: 'Score 1000+ points.',
    scoreTarget: 1000,
    conditionMet: () => true,
  },
  {
    id: 'easy-soloist',
    tier: 'easy',
    name: 'Soloist',
    description: 'Score 500+ with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: ({ state }) =>
      !state.grid.some(c => c !== null && isJoker(c)),
  },

  // ---------- Hard / Extreme tier ----------
  {
    id: 'dynamite',
    tier: 'hard-extreme',
    name: 'Dynamite',
    description: 'Score 500+ with at least one row or column worth 300+.',
    scoreTarget: 500,
    conditionMet: ({ report }) => report.lines.some(l => l.total >= 300),
  },
  {
    id: 'line-only',
    tier: 'hard-extreme',
    name: 'Line Only',
    description: 'Score 500+ holding no end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: ({ state }) =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.gridEffect),
  },
  {
    id: 'grid-only',
    tier: 'hard-extreme',
    name: 'Grid Only',
    description: 'Score 500+ holding only end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: ({ state }) =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.lineEffect),
  },
  {
    id: 'balanced',
    tier: 'hard-extreme',
    name: 'Balanced',
    description: 'Score 500+ without any single row or column worth 100+.',
    scoreTarget: 500,
    conditionMet: ({ report }) => report.lines.every(l => l.total < 100),
  },
  {
    id: 'jokerless',
    tier: 'hard-extreme',
    name: 'Jokerless',
    description: 'Score 500+ with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: ({ state }) =>
      !state.grid.some(c => c !== null && isJoker(c)),
  },
  {
    id: 'no-swap',
    tier: 'hard-extreme',
    name: 'No Swap',
    description: 'Score 500+ without swapping out a bonus card at the cap.',
    scoreTarget: 500,
    conditionMet: ({ state }) => !state.swappedBonus,
  },
  {
    id: 'high-hands',
    tier: 'hard-extreme',
    name: 'High Hands',
    description:
      'Score 500+ with every scoring line a Three of a Kind or higher (High Card lines don\'t count against).',
    scoreTarget: 500,
    conditionMet: ({ report }) =>
      report.lines.every(l => l.hand !== 'PAIR' && l.hand !== 'TWO_PAIR'),
  },
  {
    id: 'low-hands',
    tier: 'hard-extreme',
    name: 'Low Hands',
    description: 'Score 500+ with no line scoring higher than Three of a Kind.',
    scoreTarget: 500,
    conditionMet: ({ report }) =>
      report.lines.every(l => !l.hand || LOW_OR_NONE.has(l.hand)),
  },

  // ---------- Milestones ----------
  {
    id: 'win-every-difficulty',
    tier: 'milestone',
    name: 'Globetrotter',
    description: 'Win a game at each difficulty.',
    conditionMet: ({ milestone }) => {
      const w = milestone.winsByDifficulty;
      return w.easy > 0 && w.medium > 0 && w.hard > 0 && w.extreme > 0;
    },
  },
  {
    id: 'perfect-every-difficulty',
    tier: 'milestone',
    name: 'Perfectionist',
    description: 'Win a game with Perfect (SS rating) at each difficulty.',
    conditionMet: ({ milestone }) => {
      const s = milestone.ssByDifficulty;
      return s.easy > 0 && s.medium > 0 && s.hard > 0 && s.extreme > 0;
    },
  },
  {
    id: 'wins-25',
    tier: 'milestone',
    name: 'Quarter Century',
    description: 'Win 25+ games across all difficulties.',
    conditionMet: ({ milestone }) => milestone.totalWins >= 25,
  },
  {
    id: 'wins-100',
    tier: 'milestone',
    name: 'Centurion',
    description: 'Win 100+ games across all difficulties.',
    conditionMet: ({ milestone }) => milestone.totalWins >= 100,
  },
  {
    id: 'all-challenges',
    tier: 'milestone',
    name: 'Challenge Sweep',
    description: 'Beat every Challenge.',
    conditionMet: ({ milestone }) =>
      milestone.challengesCompleted >= milestone.totalChallenges,
  },
  {
    id: 'full-bonus-hand',
    tier: 'milestone',
    name: 'Full Slate',
    description: 'Score points with every bonus card at least once.',
    conditionMet: ({ milestone }) =>
      milestone.uniqueBonusCardsScored >= milestone.totalBonusCardsInPool,
  },
];

export const findAchievement = (id: AchievementId): Achievement | undefined =>
  ACHIEVEMENTS.find(a => a.id === id);

// Size of the Challenge catalog, exposed for milestone bookkeeping so
// callers don't need to import CHALLENGES directly.
export const CHALLENGES_TOTAL = CHALLENGES.length;

// Achievements only earn on Free Play runs, with one exception:
// 'all-challenges' fires when the qualifying Challenge run clears
// the last entry in the catalog (so the trigger event is the
// Challenge win itself).
const modeAllowedFor = (
  ach: Achievement,
  mode: AchievementCheckCtx['mode']
): boolean => {
  if (ach.id === 'all-challenges') {
    return mode === 'free' || mode === 'challenge';
  }
  return mode === 'free';
};

// Earned iff the achievement's tier-specific gating passes AND the
// per-tier condition fires. Easy / Hard-Extreme tiers require the
// matching Free Play difficulty plus a score floor; Milestones run
// the condition directly and ignore per-difficulty / score gating.
// Every tier additionally requires modeAllowedFor — without it
// Hard-tier achievements would fire on Challenge runs because every
// Challenge runs on the Hard ruleset.
export const achievementEarned = (
  ach: Achievement,
  ctx: AchievementCheckCtx
): boolean => {
  const { state, report, mode } = ctx;
  if (!modeAllowedFor(ach, mode)) return false;
  if (ach.tier === 'easy' && state.difficulty !== 'easy') return false;
  if (
    ach.tier === 'hard-extreme' &&
    state.difficulty !== 'hard' &&
    state.difficulty !== 'extreme'
  ) {
    return false;
  }
  if (ach.scoreTarget !== undefined && report.total < ach.scoreTarget) {
    return false;
  }
  return ach.conditionMet(ctx);
};
