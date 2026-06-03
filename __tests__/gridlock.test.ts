import { seededRng } from '../src/game/deck';
import { findChallenge } from '../src/game/challenges';
import { GameState, newGame } from '../src/game/state';

// Gridlock challenge — newGame with randomGridFill = 15. Hard
// difficulty matches what App.tsx uses for every challenge.
const gridlock = (seed: number): GameState =>
  newGame(
    'hard',
    seededRng(seed),
    findChallenge('gridlock').scoreTarget,
    undefined,
    false,
    false,
    [],
    [],
    [],
    false,
    false,
    [],
    undefined,
    15
  );

describe('Gridlock challenge', () => {
  it('seeds 15 cards across random distinct grid positions', () => {
    const s = gridlock(1);
    const filled = s.grid.filter(c => c !== null);
    // 15 from the random fill. drawNext may have auto-placed
    // additional jokers from the remaining deck before settling on
    // a drawn standard card, so allow >= 15 (always exactly 15
    // initial + 0 or more joker drains).
    expect(filled.length).toBeGreaterThanOrEqual(15);
    // The center slot (12) being non-null by default in a standard
    // newGame is NOT guaranteed here — the random fill might leave
    // it empty.
  });

  it('different seeds produce different positions', () => {
    const a = gridlock(1);
    const b = gridlock(2);
    const filledA = a.grid
      .map((c, i) => (c !== null ? i : -1))
      .filter(i => i >= 0);
    const filledB = b.grid
      .map((c, i) => (c !== null ? i : -1))
      .filter(i => i >= 0);
    // Some overlap is fine, but the position sets shouldn't be
    // identical for two different seeds.
    expect(filledA.sort().join(',')).not.toEqual(filledB.sort().join(','));
  });

  it('the player can still draw and play normally', () => {
    const s = gridlock(7);
    // drawNext leaves us in awaiting-action with a drawn card.
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.drawn).not.toBeNull();
  });

  it('target is 500', () => {
    expect(findChallenge('gridlock').scoreTarget).toBe(500);
  });
});
