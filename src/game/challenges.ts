import { isJoker } from './cards';
import { Grid } from './grid';
import { ScoreReport } from './scoring';

// ============================================================================
// Challenge definitions.
//
// Each challenge has a target score AND a structural constraint on the final
// grid / score. They share the same in-game loop as Free Play; the difference
// is only in how we evaluate "won" at the end and how we present the goal.
// ============================================================================

export type ChallengeId = 'balanced' | 'dynamite' | 'jokerless';

export interface Challenge {
  id: ChallengeId;
  name: string;
  goal: string;
  // Total score that must be reached (in addition to the structural constraint).
  scoreTarget: number;
  // True if the structural condition is met by the final grid + report.
  conditionMet: (grid: Grid, report: ScoreReport) => boolean;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    goal: 'Score 500+ without any single row or column worth 100+.',
    scoreTarget: 500,
    conditionMet: (_grid, report) =>
      report.lines.every(l => l.total < 100),
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    goal: 'Score 500+ with at least one row or column worth 200+.',
    scoreTarget: 500,
    conditionMet: (_grid, report) =>
      report.lines.some(l => l.total >= 200),
  },
  {
    id: 'jokerless',
    name: 'Jokerless',
    goal: 'Score 500+ with no joker on the grid at game end.',
    scoreTarget: 500,
    conditionMet: (grid) =>
      !grid.some(c => c !== null && isJoker(c)),
  },
];

export const findChallenge = (id: ChallengeId): Challenge => {
  const c = CHALLENGES.find(x => x.id === id);
  if (!c) throw new Error(`Unknown challenge: ${id}`);
  return c;
};

export const challengeWon = (challenge: Challenge, grid: Grid, report: ScoreReport): boolean =>
  report.total >= challenge.scoreTarget && challenge.conditionMet(grid, report);

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
