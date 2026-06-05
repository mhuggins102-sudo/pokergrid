// Smoke test for the Daily Grid's load-bearing claim: every player
// who plays today's daily gets the same deck order, the same starter
// hand, the same joker positions. Failure here means the feature
// doesn't work, period.

import { seededRng } from '../src/game/deck';
import { seedForDate } from '../src/game/daily/seed';
import { recipeFor } from '../src/game/daily/recipe';
import { newGame } from '../src/game/state';

describe('daily determinism', () => {
  it('same dateISO produces identical initial GameState', () => {
    const dateISO = '2026-06-05';
    const recipe = recipeFor(dateISO);
    const stateA = newGame(recipe.difficulty, seededRng(seedForDate(dateISO)));
    const stateB = newGame(recipe.difficulty, seededRng(seedForDate(dateISO)));
    // Spot-check the visible "deck order" signals: deck contents +
    // grid (joker placement happens during draw, but the deck order
    // itself fully determines everything that follows).
    expect(stateA.deck).toEqual(stateB.deck);
    expect(stateA.grid).toEqual(stateB.grid);
    expect(stateA.bonusCards.map(c => c.id)).toEqual(
      stateB.bonusCards.map(c => c.id)
    );
    expect(stateA.target).toBe(stateB.target);
  });

  it('different dateISOs produce different deck orders', () => {
    const a = newGame('hard', seededRng(seedForDate('2026-06-05')));
    const b = newGame('hard', seededRng(seedForDate('2026-06-06')));
    // Same difficulty, different seed — deck order should diverge.
    // Very low chance these match by accident (52! permutations).
    expect(a.deck).not.toEqual(b.deck);
  });

  it('targets-up and challenges still use Math.random by default', () => {
    // Sanity: when rng is omitted, newGame should NOT crash and the
    // deck order is non-deterministic across calls. This guards
    // against accidentally making non-daily modes deterministic.
    const a = newGame('hard');
    const b = newGame('hard');
    // Two Math.random calls almost certainly produce different decks
    // (probability of full match is 1/52! ≈ 10^-68). If this is ever
    // flaky in practice we have bigger problems.
    expect(a.deck).not.toEqual(b.deck);
  });
});
