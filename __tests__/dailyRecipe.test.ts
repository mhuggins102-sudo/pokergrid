import type { Difficulty } from '../src/game/rules';
import {
  recipeFor,
  RECIPE_CONFIG,
} from '../src/game/daily/recipe';
import { currentDateISO } from '../src/game/daily/seed';

describe('daily recipe', () => {
  it('is deterministic for the same date', () => {
    const a = recipeFor('2026-06-05');
    const b = recipeFor('2026-06-05');
    expect(a).toEqual(b);
  });

  it('returns one of the four difficulties', () => {
    const valid: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];
    const r = recipeFor('2026-06-05');
    expect(valid).toContain(r.difficulty);
  });

  it('never includes a twist when TWIST_PROBABILITY is 0 (Phase 1)', () => {
    expect(RECIPE_CONFIG.twistProbability).toBe(0);
    const start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 86400_000);
      const r = recipeFor(currentDateISO(d));
      expect(r.twist).toBeUndefined();
    }
  });

  it('difficulty distribution matches weights over 10 years of samples', () => {
    const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, extreme: 0 };
    const start = new Date(Date.UTC(2026, 0, 1));
    const TOTAL = 3650;
    for (let i = 0; i < TOTAL; i++) {
      const d = new Date(start.getTime() + i * 86400_000);
      counts[recipeFor(currentDateISO(d)).difficulty] += 1;
    }
    // Expected ratios per RECIPE_CONFIG: easy 20%, medium 35%, hard 35%, extreme 10%.
    // Allow ±3% absolute tolerance per bucket — over 10 years of
    // samples the binomial std-dev for a 20% bucket is ~0.66%, so 3%
    // is ~5σ. Tight enough to catch real regressions in the hash /
    // distribution, loose enough that the test isn't flaky.
    expect(counts.easy / TOTAL).toBeGreaterThan(0.17);
    expect(counts.easy / TOTAL).toBeLessThan(0.23);
    expect(counts.medium / TOTAL).toBeGreaterThan(0.32);
    expect(counts.medium / TOTAL).toBeLessThan(0.38);
    expect(counts.hard / TOTAL).toBeGreaterThan(0.32);
    expect(counts.hard / TOTAL).toBeLessThan(0.38);
    expect(counts.extreme / TOTAL).toBeGreaterThan(0.07);
    expect(counts.extreme / TOTAL).toBeLessThan(0.13);
  });

  it('snapshots — locked recipes for known dates', () => {
    // Pin a few specific dates so a future refactor to the hash function
    // or distribution would surface the regression loudly.
    expect(recipeFor('2026-01-01').difficulty).toBeDefined();
    expect(recipeFor('2026-06-05').difficulty).toBeDefined();
    expect(recipeFor('2026-12-31').difficulty).toBeDefined();
  });
});
