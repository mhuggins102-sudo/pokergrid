import { isJoker } from './cards';
import { HandRank } from './hands';
import { ScoreReport } from './scoring';
import type { GameState } from './state';

// ============================================================================
// Achievements — passive accomplishments earned during Free Play.
//
// Two tiers:
//   - 'easy'         : Free Play on Easy only.
//   - 'hard-extreme' : Free Play on Hard or Extreme only.
// Medium runs are deliberately ineligible — Medium is the "comfort" tier
// with no dedicated goals. Targets Up and Challenges have their own
// progress tracks (see ResultScreen.tsx, which only counts Free Play
// runs toward achievements).
//
// Every achievement has:
//   - id: stable string saved into stats.achievementsDone
//   - tier: gates which difficulty the run must be on
//   - name / description: shown on the AchievementsScreen and the result-
//     screen "earned" callout. The Achievements page renders the tier as
//     a section header, so descriptions DON'T repeat the difficulty.
//   - conditionMet: same shape as Challenge.conditionMet
//   - scoreTarget: the minimum total for the run.
// ============================================================================

export type AchievementTier = 'easy' | 'hard-extreme';

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
  | 'easy-soloist';

export interface Achievement {
  id: AchievementId;
  tier: AchievementTier;
  name: string;
  description: string;
  scoreTarget: number;
  conditionMet: (state: GameState, report: ScoreReport) => boolean;
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
    conditionMet: state => !state.grid.some(c => c !== null && isJoker(c)),
  },

  // ---------- Hard / Extreme tier ----------
  {
    id: 'dynamite',
    tier: 'hard-extreme',
    name: 'Dynamite',
    description: 'Score 500+ with at least one row or column worth 300+.',
    scoreTarget: 500,
    conditionMet: (_state, report) => report.lines.some(l => l.total >= 300),
  },
  {
    id: 'line-only',
    tier: 'hard-extreme',
    name: 'Line Only',
    description: 'Score 500+ holding no end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: state =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.gridEffect),
  },
  {
    id: 'grid-only',
    tier: 'hard-extreme',
    name: 'Grid Only',
    description: 'Score 500+ holding only end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: state =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.lineEffect),
  },
  {
    id: 'balanced',
    tier: 'hard-extreme',
    name: 'Balanced',
    description: 'Score 500+ without any single row or column worth 100+.',
    scoreTarget: 500,
    conditionMet: (_state, report) => report.lines.every(l => l.total < 100),
  },
  {
    id: 'jokerless',
    tier: 'hard-extreme',
    name: 'Jokerless',
    description: 'Score 500+ with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: state => !state.grid.some(c => c !== null && isJoker(c)),
  },
  {
    id: 'no-swap',
    tier: 'hard-extreme',
    name: 'No Swap',
    description: 'Score 500+ without swapping out a bonus card at the cap.',
    scoreTarget: 500,
    conditionMet: state => !state.swappedBonus,
  },
  {
    id: 'high-hands',
    tier: 'hard-extreme',
    name: 'High Hands',
    description:
      'Score 500+ with every scoring line a Three of a Kind or higher (High Card lines don\'t count against).',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => l.hand !== 'PAIR' && l.hand !== 'TWO_PAIR'),
  },
  {
    id: 'low-hands',
    tier: 'hard-extreme',
    name: 'Low Hands',
    description: 'Score 500+ with no line scoring higher than Three of a Kind.',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => !l.hand || LOW_OR_NONE.has(l.hand)),
  },
];

export const findAchievement = (id: AchievementId): Achievement | undefined =>
  ACHIEVEMENTS.find(a => a.id === id);

// Earned iff the run difficulty matches the achievement's tier, the run
// cleared the score bar, and the structural condition is satisfied.
// Medium runs never earn any achievement; Easy runs only earn Easy-tier
// achievements; Hard / Extreme runs only earn Hard / Extreme-tier ones.
export const achievementEarned = (
  ach: Achievement,
  state: GameState,
  report: ScoreReport
): boolean => {
  if (ach.tier === 'easy' && state.difficulty !== 'easy') return false;
  if (
    ach.tier === 'hard-extreme' &&
    state.difficulty !== 'hard' &&
    state.difficulty !== 'extreme'
  ) {
    return false;
  }
  if (report.total < ach.scoreTarget) return false;
  return ach.conditionMet(state, report);
};
