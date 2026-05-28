/**
 * Bot simulation — runs N games per difficulty with a simple bot and
 * reports the score distribution + A/S/SS tier rates.
 *
 * OPT-IN: this test is skipped unless SIMULATE=1 is set in the
 * environment. Default `npm test` ignores it because 800 games would
 * inflate the suite runtime for no day-to-day benefit.
 *
 * Run it:
 *
 *     SIMULATE=1 npm test -- --testPathPattern botSimulation
 *
 * Tweak run size or which difficulties to sample:
 *
 *     SIM_N=500 SIMULATE=1 npm test -- --testPathPattern botSimulation
 *
 * Bot strategy (intentionally simple, not optimal):
 *   - Use ♣ Bonus when below the cap and the bonus deck has cards;
 *     keep the first offered card. At cap, swap into hand slot 0.
 *   - For every other drawn card, look at where it would land (next
 *     spiral slot) and score it against the row + column it joins:
 *       +rank-match for each line card sharing rank (pair / trips)
 *       +suit-match for each line card sharing suit (flush)
 *     If the placement contributes nothing AND discards are legal,
 *     discard. Otherwise place.
 *   - Never spend ♥ / ♠ / ♦ — those perks are situational and using
 *     them without a smarter heuristic usually hurts more than helps.
 *
 * This bot's scores set a competence FLOOR. Skilled human play
 * should beat these numbers because humans pick perk timing and
 * bonus cards intentionally. The bot's main value is comparing
 * difficulty modes against a fixed strategy — Easy vs Hard
 * differences here reflect the rules alone, not skill.
 */
import {
  Action,
  GameState,
  newGame,
  step,
} from '../src/game/state';
import { Card, isJoker } from '../src/game/cards';
import { BONUS_HAND_LIMIT } from '../src/game/bonusCards';
import { GRID_SIZE, nextSpiralSlot } from '../src/game/grid';
import { scoreGrid } from '../src/game/scoring';
import {
  Difficulty,
  TARGET_BY_DIFFICULTY,
} from '../src/game/rules';

const SHOULD_RUN = process.env.SIMULATE === '1';
const N_GAMES = parseInt(process.env.SIM_N ?? '200', 10);
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

// Cheap "is this placement worth it?" heuristic. Looks at the next
// spiral slot's row + column and counts rank / suit matches with the
// drawn card across both lines. Returns 0 when the card contributes
// to neither line — a strong "discard if allowed" signal.
const placementValue = (drawn: Card, grid: (Card | null)[]): number => {
  if (isJoker(drawn)) return Infinity; // jokers auto-place; placeholder.
  const next = nextSpiralSlot(grid);
  if (next === null) return 0; // grid full
  const row = Math.floor(next / GRID_SIZE);
  const col = next % GRID_SIZE;
  const others: Card[] = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    const card = grid[row * GRID_SIZE + c];
    if (card !== null) others.push(card);
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r === row) continue; // already counted via the row sweep
    const card = grid[r * GRID_SIZE + col];
    if (card !== null) others.push(card);
  }
  let score = 0;
  for (const c of others) {
    if (isJoker(c)) continue; // joker can match anything; ignore for ranking
    if (c.rank === drawn.rank) score += 5; // pair / trips / quads progression
    if (c.suit === drawn.suit) score += 2; // flush progression
  }
  return score;
};

// Pick the bot's next Action for the current state.
const pickAction = (s: GameState): Action => {
  switch (s.phase.kind) {
    case 'awaiting-action': {
      // drawNext auto-places jokers, so s.drawn is always a standard
      // card here (or null if game ended — handled by the caller).
      const drawn = s.drawn;
      if (drawn && !isJoker(drawn) && drawn.suit === 'C') {
        // Use ♣ Bonus when below cap and the deck has cards. Skipping
        // these on Hard / Extreme would needlessly forfeit the bonus
        // card meta-game.
        const canDraw = s.bonusDeck.length > 0;
        const belowCap = s.bonusCards.length < BONUS_HAND_LIMIT;
        if (canDraw && belowCap) return { type: 'BEGIN_SUIT_ACTION' };
      }
      if (drawn && !isJoker(drawn) && !s.noDiscards) {
        // Skip cards that don't contribute to the line they'd land in,
        // BUT only if we can still afford to refill the grid. Each
        // unfilled slot at game end costs -50 net (–25 to its row and
        // –25 to its column), which crushes the score if we discard
        // ourselves into a half-empty grid.
        const emptySlots = s.grid.filter(c => c === null).length;
        const headroom = s.deck.length - emptySlots;
        // Need at least 2 extra cards in the deck on top of refilling
        // the grid, so a discard now still leaves room for one more
        // bad draw down the line.
        const canAffordDiscard = headroom >= 2;
        if (canAffordDiscard && placementValue(drawn, s.grid) === 0) {
          return { type: 'DISCARD_NONE' };
        }
      }
      return { type: 'PLACE' };
    }
    case 'bonus-card-resolving': {
      // Always keep the FIRST drawn bonus card. A smarter bot would
      // rank by category fit but the goal here is a competence floor.
      if (s.bonusCards.length < BONUS_HAND_LIMIT) {
        return { type: 'BONUS_KEEP', idx: 0 };
      }
      return { type: 'BONUS_SELECT_NEW', idx: 0 };
    }
    case 'bonus-card-replacing':
      return { type: 'BONUS_REPLACE', oldIdx: 0 };
    case 'awaiting-target-hop':
    case 'awaiting-target-slide-source':
    case 'awaiting-target-slide-dest':
    case 'awaiting-target-destroy':
      // We never start these phases (bot avoids ♥ / ♠ / ♦), but if
      // a future Short Circuit run lands here we cancel out gracefully.
      return { type: 'CANCEL_ACTION' };
    case 'game-over':
      throw new Error('pickAction called on game-over state');
  }
};

// Run one game to completion, returning the final scored total.
const runOneGame = (difficulty: Difficulty): number => {
  let s = newGame(difficulty);
  // Guard against infinite loops in case a future change makes the
  // bot unable to make progress.
  const MAX_STEPS = 500;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (s.phase.kind === 'game-over') break;
    s = step(s, pickAction(s));
  }
  if (s.phase.kind !== 'game-over') {
    throw new Error(`bot stuck after ${MAX_STEPS} steps (difficulty=${difficulty})`);
  }
  const report = scoreGrid(s.grid, s.bonusCards, {
    deckRemaining: s.deck.length,
    discards: s.discards,
    perkSpent: s.perkSpent,
  });
  return report.total;
};

interface Stats {
  difficulty: Difficulty;
  target: number;
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
  // Tier mix — fraction of runs hitting each band, per the rules in
  // TierBreakdownModal (SS ≥ 1.6×, S ≥ 1.3×, A ≥ 1.0×).
  pctSS: number;
  pctS: number;
  pctA: number;
  pctWin: number; // A or better
}

const summarize = (difficulty: Difficulty, scores: number[]): Stats => {
  const target = TARGET_BY_DIFFICULTY[difficulty];
  const sorted = [...scores].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const pctAtLeast = (mul: number) =>
    scores.filter(s => s >= target * mul).length / scores.length;
  return {
    difficulty,
    target,
    n: scores.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 10) / 10,
    median: pct(0.5),
    p25: pct(0.25),
    p75: pct(0.75),
    p95: pct(0.95),
    pctSS: pctAtLeast(1.6),
    pctS: pctAtLeast(1.3) - pctAtLeast(1.6),
    pctA: pctAtLeast(1.0) - pctAtLeast(1.3),
    pctWin: pctAtLeast(1.0),
  };
};

const formatPct = (p: number) => `${(p * 100).toFixed(1)}%`;

const reportStats = (s: Stats): string => {
  const lines = [
    `--- ${s.difficulty.toUpperCase()} (target ${s.target}, n=${s.n}) ---`,
    `  min / max     : ${s.min} / ${s.max}`,
    `  mean / median : ${s.mean} / ${s.median}`,
    `  p25 / p75 / p95: ${s.p25} / ${s.p75} / ${s.p95}`,
    `  win rate (A+) : ${formatPct(s.pctWin)}`,
    `  A  (1.0–1.3×) : ${formatPct(s.pctA)}`,
    `  S  (1.3–1.6×) : ${formatPct(s.pctS)}`,
    `  SS (≥1.6×)    : ${formatPct(s.pctSS)}`,
  ];
  return lines.join('\n');
};

(SHOULD_RUN ? describe : describe.skip)('bot simulation', () => {
  test(
    `${N_GAMES} games per difficulty`,
    () => {
      const allStats: Stats[] = [];
      for (const difficulty of DIFFICULTIES) {
        const scores: number[] = [];
        for (let i = 0; i < N_GAMES; i++) {
          scores.push(runOneGame(difficulty));
        }
        const stats = summarize(difficulty, scores);
        allStats.push(stats);
        console.log(reportStats(stats));
      }
      // Sanity: every difficulty produced N_GAMES scores.
      for (const s of allStats) {
        expect(s.n).toBe(N_GAMES);
      }
    },
    // Generous timeout — 800 games at ~5ms each is ~4s, but jest
    // adds overhead and Hard / Extreme runs are longer.
    120_000
  );
});
