import { isJoker } from './cards';
import { HandRank } from './hands';
import { ScoreReport } from './scoring';
import type { GameState } from './state';

// ============================================================================
// Achievements — passive accomplishments earned by playing on Hard or Extreme.
//
// These started life as "Challenges" the player would explicitly start, but
// only Short Deck actually changes how a run is played; the rest just check
// the final state of a normal run. Pulling them out into Achievements lets
// the player chase them through their regular Hard / Extreme grind rather
// than having to launch a dedicated mode.
//
// Every achievement has:
//   - id: stable string saved into stats.achievementsDone
//   - name / description: shown on the AchievementsScreen and the result-
//     screen "earned" callout
//   - conditionMet: same shape as Challenge.conditionMet
//   - scoreTarget: the minimum total. 500 across the board for now.
// ============================================================================

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
  | 'high-hands';

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  scoreTarget: number;
  conditionMet: (state: GameState, report: ScoreReport) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'dynamite',
    name: 'Dynamite',
    description:
      'Score 500+ on Hard or Extreme with at least one row or column worth 300+.',
    scoreTarget: 500,
    conditionMet: (_state, report) => report.lines.some(l => l.total >= 300),
  },
  {
    id: 'line-only',
    name: 'Line Only',
    description:
      'Score 500+ on Hard or Extreme holding no end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: state =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.gridEffect),
  },
  {
    id: 'grid-only',
    name: 'Grid Only',
    description:
      'Score 500+ on Hard or Extreme holding only end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: state =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.lineEffect),
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'Score 500+ on Hard or Extreme without any single row or column worth 100+.',
    scoreTarget: 500,
    conditionMet: (_state, report) => report.lines.every(l => l.total < 100),
  },
  {
    id: 'jokerless',
    name: 'Jokerless',
    description:
      'Score 500+ on Hard or Extreme with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: state => !state.grid.some(c => c !== null && isJoker(c)),
  },
  {
    id: 'no-swap',
    name: 'No Swap',
    description:
      'Score 500+ on Hard or Extreme without swapping out a bonus card at the cap.',
    scoreTarget: 500,
    conditionMet: state => !state.swappedBonus,
  },
  {
    id: 'high-hands',
    name: 'High Hands',
    description:
      'Score 500+ on Hard or Extreme with every scoring line a Three of a Kind or higher (High Card lines don\'t count against).',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => l.hand !== 'PAIR' && l.hand !== 'TWO_PAIR'),
  },
  {
    id: 'low-hands',
    name: 'Low Hands',
    description:
      'Score 500+ on Hard or Extreme with no line scoring higher than Three of a Kind.',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => !l.hand || LOW_OR_NONE.has(l.hand)),
  },
];

export const findAchievement = (id: AchievementId): Achievement | undefined =>
  ACHIEVEMENTS.find(a => a.id === id);

// Earned iff the run finished on Hard or Extreme, met the score bar, and
// satisfied the structural condition. Easy / Medium runs never earn an
// achievement even if they happen to clear the score target.
export const achievementEarned = (
  ach: Achievement,
  state: GameState,
  report: ScoreReport
): boolean => {
  if (state.difficulty !== 'hard' && state.difficulty !== 'extreme') return false;
  if (report.total < ach.scoreTarget) return false;
  return ach.conditionMet(state, report);
};
