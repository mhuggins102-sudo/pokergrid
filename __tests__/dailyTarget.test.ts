import { dailyTargetFor } from '../src/game/daily/recipe';

describe('dailyTargetFor', () => {
  describe('no twist — base difficulty target', () => {
    it.each([
      ['easy', 400],
      ['medium', 450],
      ['hard', 500],
      ['extreme', 450],
    ])('%s → %s', (difficulty, expected) => {
      expect(dailyTargetFor(difficulty as 'easy')).toBe(expected);
    });
  });

  describe('scoring-active twists — base − 50', () => {
    const SCORING_TWISTS = [
      'short-circuit',
      'no-discards',
      'gridlock',
      'short-deck',
      'mixed-bag',
    ] as const;
    it.each([
      ['easy', 350],
      ['medium', 400],
      ['hard', 450],
    ])('%s with any scoring-active twist → %s', (difficulty, expected) => {
      for (const twist of SCORING_TWISTS) {
        expect(dailyTargetFor(difficulty as 'easy', twist)).toBe(expected);
      }
    });
  });

  describe('fixed-target twists', () => {
    it('poker-purist is 350 across all difficulties', () => {
      expect(dailyTargetFor('easy', 'poker-purist')).toBe(350);
      expect(dailyTargetFor('medium', 'poker-purist')).toBe(350);
      expect(dailyTargetFor('hard', 'poker-purist')).toBe(350);
    });

    it('three-tricks is 400 across all difficulties', () => {
      expect(dailyTargetFor('easy', 'three-tricks')).toBe(400);
      expect(dailyTargetFor('medium', 'three-tricks')).toBe(400);
      expect(dailyTargetFor('hard', 'three-tricks')).toBe(400);
    });
  });

  it('defensively handles extreme + twist even though the recipe never emits it', () => {
    // Extreme has empty twistEligibility so this shouldn't appear in
    // recipeFor output, but the formula still resolves sanely.
    expect(dailyTargetFor('extreme', 'no-discards')).toBe(400); // 450 − 50
    expect(dailyTargetFor('extreme', 'poker-purist')).toBe(350); // fixed
    expect(dailyTargetFor('extreme', 'three-tricks')).toBe(400); // fixed
  });
});
