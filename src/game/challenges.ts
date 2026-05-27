import { ScoreReport } from './scoring';
import type { GameState } from './state';

// ============================================================================
// Challenges — playable game variants. The other entries that used to live
// here are now Achievements (src/game/achievements.ts) — those check a
// final-state condition on a normal Hard / Extreme run so they're earned
// passively. Only the variants that actually MODIFY gameplay stay here:
//
//   - Short Deck: deck size capped at 45 (8 cards held out)
//   - No Discards: the Discard button is unavailable
//   - Short Circuit: the suit perk you get is randomized — you don't know
//     which of the four perks will fire until you commit
//   - Poker Purist: no bonus cards at all — no starter, no ♣ perk draws,
//     no in-game or end-game multipliers
// ============================================================================

export type ChallengeId =
  | 'short-deck'
  | 'no-discards'
  | 'short-circuit'
  | 'poker-purist';

export interface Challenge {
  id: ChallengeId;
  name: string;
  goal: string;
  // Total score that must be reached.
  scoreTarget: number;
  // True if the structural condition is met by the final state + report.
  conditionMet: (state: GameState, report: ScoreReport) => boolean;
  // Optional: override the deck size at game start. Used by short-deck.
  deckLimit?: number;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'short-deck',
    name: 'Short Deck',
    goal: 'Score 500+ with a 45-card deck (8 cards held out at random).',
    scoreTarget: 500,
    deckLimit: 45,
    conditionMet: () => true,
  },
  {
    id: 'no-discards',
    name: 'No Discards',
    goal: 'Score 500+ without using the Discard button — every drawn card must be placed or spent on a suit perk.',
    scoreTarget: 500,
    // The Discard button is hidden in this challenge and the DISCARD_NONE
    // action is rejected by the reducer, so reaching the score target is
    // the only structural requirement.
    conditionMet: () => true,
  },
  {
    id: 'short-circuit',
    name: 'Short Circuit',
    goal: "Score 500+ with random suit perks — you won't know which of ♥/♠/♦/♣'s effects you'll get until you commit to spending the card.",
    scoreTarget: 500,
    // The randomness is enforced at the reducer level (state.randomPerks
    // is true and handleBeginSuitAction picks a uniformly-random perk
    // from those currently available). Hitting the score target is the
    // only end-state check.
    conditionMet: () => true,
  },
  {
    id: 'poker-purist',
    name: 'Poker Purist',
    goal: 'Score 350+ with no bonus cards at all — no starter, no ♣ draws, no multipliers. Pure rows and columns scoring as 5-card poker hands.',
    scoreTarget: 350,
    // Enforced at newGame: bonusCards and bonusDeck are both empty,
    // which naturally disables ♣ (canDrawBonus returns false) and
    // hides the bonus card strip in the UI.
    conditionMet: () => true,
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
