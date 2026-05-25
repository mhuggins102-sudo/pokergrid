import { isJoker } from './cards';
import { Grid } from './grid';
import { HandRank } from './hands';
import { ScoreReport } from './scoring';
import type { GameState } from './state';

// Pair, Two Pair, and Three of a Kind — and anything that scored nothing
// (no hand). Used by the Low Hands challenge.
const LOW_OR_NONE: Set<HandRank> = new Set<HandRank>([
  'HIGH_CARD',
  'PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
]);

// ============================================================================
// Challenge definitions.
//
// Each challenge has a target score AND a structural constraint on the final
// run (grid + report + game-state history). They share the same in-game loop
// as Free Play; the difference is only in how we evaluate "won" at the end
// and how we present the goal. Some also override game-start parameters
// (e.g. deck size) via `deckLimit`.
// ============================================================================

export type ChallengeId =
  | 'balanced'
  | 'dynamite'
  | 'jokerless'
  | 'no-swap'
  | 'grid-only'
  | 'line-only'
  | 'short-deck'
  | 'low-hands';

export interface Challenge {
  id: ChallengeId;
  name: string;
  goal: string;
  // Total score that must be reached (in addition to the structural constraint).
  scoreTarget: number;
  // True if the structural condition is met by the final state + report.
  conditionMet: (state: GameState, report: ScoreReport) => boolean;
  // Optional: override the deck size at game start. Used by short-deck.
  deckLimit?: number;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    goal: 'Score 500+ without any single row or column worth 100+.',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => l.total < 100),
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    goal: 'Score 500+ with at least one row or column worth 300+.',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.some(l => l.total >= 300),
  },
  {
    id: 'jokerless',
    name: 'Jokerless',
    goal: 'Score 500+ with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: (state) =>
      !state.grid.some(c => c !== null && isJoker(c)),
  },
  {
    id: 'no-swap',
    name: 'No Swap',
    goal: 'Score 500+ without swapping out a bonus card at the cap.',
    scoreTarget: 500,
    conditionMet: (state) => !state.swappedBonus,
  },
  {
    id: 'grid-only',
    name: 'Grid Only',
    goal: 'Score 500+ holding only end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: (state) =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.lineEffect),
  },
  {
    id: 'line-only',
    name: 'Line Only',
    goal: 'Score 500+ holding no end-of-game multiplier bonus cards.',
    scoreTarget: 500,
    conditionMet: (state) =>
      state.bonusCards.length > 0 &&
      state.bonusCards.every(c => !c.gridEffect),
  },
  {
    id: 'short-deck',
    name: 'Short Deck',
    goal: 'Score 500+ with a 45-card deck (8 cards held out at random).',
    scoreTarget: 500,
    deckLimit: 45,
    conditionMet: () => true,
  },
  {
    id: 'low-hands',
    name: 'Low Hands',
    goal: 'Score 500+ with no line scoring higher than Three of a Kind.',
    scoreTarget: 500,
    conditionMet: (_state, report) =>
      report.lines.every(l => !l.hand || LOW_OR_NONE.has(l.hand)),
  },
];

export const findChallenge = (id: ChallengeId): Challenge => {
  const c = CHALLENGES.find(x => x.id === id);
  if (!c) throw new Error(`Unknown challenge: ${id}`);
  return c;
};

export const challengeWon = (
  challenge: Challenge,
  state: GameState,
  report: ScoreReport
): boolean =>
  report.total >= challenge.scoreTarget && challenge.conditionMet(state, report);

// ============================================================================
// Targets Up — Levels mode.
//
// Start at Level 1 (target 300). On a win, level += 1 and target += 50.
// On a loss, the run is over; the final result is the number of consecutive
// wins (= level - 1).
// ============================================================================

export const TARGETS_UP_BASE = 300;
export const TARGETS_UP_STEP = 50;

export const targetForLevel = (level: number): number =>
  TARGETS_UP_BASE + (level - 1) * TARGETS_UP_STEP;
