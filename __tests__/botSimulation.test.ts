/**
 * Bot simulation — runs N games per difficulty with a 1-step
 * lookahead bot and reports the score distribution + tier rates.
 *
 * OPT-IN: skipped unless SIMULATE=1 is set. Default `npm test`
 * ignores it because the runs add seconds to the suite for no
 * day-to-day benefit.
 *
 *   SIMULATE=1 npm test -- --testPathPattern botSimulation
 *   SIM_N=500 SIMULATE=1 npm test -- --testPathPattern botSimulation
 *
 * Bot strategy — 1-step greedy lookahead:
 *   On every awaiting-action turn the bot enumerates every legal
 *   alternative (place / discard / suit-perk if available) and
 *   simulates the resulting grid. scoreGrid (with
 *   ignoreIncompletePenalty so partial lines don't dominate the
 *   ranking) is the evaluator. The action whose simulated grid
 *   scores highest wins.
 *
 *     ♥ Swap   — iterate validHopSwaps, simulate every swap,
 *                pick the highest-scoring rearrangement.
 *     ♠ Slide  — iterate validSlideSources × slideDestinationsFrom,
 *                simulate each via executeSlide, pick the best.
 *     ♦ Destroy — iterate destroyableSlots, simulate removing each,
 *                 pick the destroy whose post-grid scores highest.
 *                 Gated by deck headroom — destroying late-game
 *                 leaves an empty slot we can't refill.
 *     ♣ Bonus  — always taken when below cap and the bonus deck
 *                has cards. The +1 bonus card is more or less a
 *                free multiplier; we don't try to estimate its
 *                future EV.
 *
 *   On the perk-resolution phases (awaiting-target-*), the bot
 *   re-runs the same per-action search to choose the actual target.
 *   Bonus pick phases keep the simple "take the first card / replace
 *   the first held card" rule — picking the BEST bonus card requires
 *   Shapley analysis against the whole deck, well outside the scope
 *   of a baseline bot.
 *
 *   Discards are still gated by deck headroom (don't strand the grid).
 */
import {
  Action,
  GameState,
  newGame,
  step,
} from '../src/game/state';
import { Card, isJoker } from '../src/game/cards';
import { BONUS_HAND_LIMIT } from '../src/game/bonusCards';
import {
  destroyableSlots,
  executeSlide,
  slideDestinationsFrom,
  validHopSwaps,
  validSlideSources,
} from '../src/game/actions';
import { Direction, Grid, placeAtSpiralNext } from '../src/game/grid';
import { scoreGrid } from '../src/game/scoring';
import {
  Difficulty,
  TARGET_BY_DIFFICULTY,
} from '../src/game/rules';

const SHOULD_RUN = process.env.SIMULATE === '1';
const N_GAMES = parseInt(process.env.SIM_N ?? '200', 10);
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

// Compute the score of a hypothetical grid given the rest of the
// run's context (bonus cards, deck remaining, etc.) — the evaluator
// the lookahead bot ranks candidate actions with. ignoreIncomplete
// is set so partial lines score 0 instead of −25; otherwise every
// non-place action would look terrible mid-game just for leaving the
// grid less full, even when the perk produces a real hand.
const evalGrid = (g: Grid, s: GameState): number =>
  scoreGrid(g, s.bonusCards, {
    deckRemaining: s.deck.length,
    ignoreIncompletePenalty: true,
    discards: s.discards,
    perkSpent: s.perkSpent,
  }).total;

// For each candidate perk, return the best (score, target) the perk
// can produce. Used both to RANK perks against place/discard AND to
// later resolve the target once the awaiting-target-* phase begins.

const bestHop = (s: GameState): { score: number; i: number; j: number } | null => {
  const pairs = validHopSwaps(s.grid);
  if (pairs.length === 0) return null;
  let best = { score: -Infinity, i: -1, j: -1 };
  for (const [i, j] of pairs) {
    const g = s.grid.slice();
    [g[i], g[j]] = [g[j], g[i]];
    const sc = evalGrid(g, s);
    if (sc > best.score) best = { score: sc, i, j };
  }
  return best.i < 0 ? null : best;
};

const bestSlide = (
  s: GameState
): { score: number; from: number; direction: Direction; distance: number } | null => {
  const sources = validSlideSources(s.grid);
  if (sources.length === 0) return null;
  let best = { score: -Infinity, from: -1, direction: 'up' as Direction, distance: 0 };
  for (const from of sources) {
    for (const move of slideDestinationsFrom(s.grid, from)) {
      const g = executeSlide(s.grid, move.from, move.direction, move.distance);
      const sc = evalGrid(g, s);
      if (sc > best.score) {
        best = { score: sc, from: move.from, direction: move.direction, distance: move.distance };
      }
    }
  }
  return best.from < 0 ? null : best;
};

const bestDestroy = (s: GameState): { score: number; slot: number } | null => {
  const slots = destroyableSlots(s.grid);
  if (slots.length === 0) return null;
  let best = { score: -Infinity, slot: -1 };
  for (const slot of slots) {
    const g = s.grid.slice();
    g[slot] = null;
    const sc = evalGrid(g, s);
    if (sc > best.score) best = { score: sc, slot };
  }
  return best.slot < 0 ? null : best;
};

// How many cards are still in the deck minus how many empty slots we
// have to fill. ≥ 0 means we can refill the grid even after this
// turn. Used as a safety floor for actions that leave slots empty
// (discard, destroy) so we don't strand ourselves into a -50/line
// penalty hellscape.
const deckHeadroom = (s: GameState): number => {
  const empty = s.grid.filter(c => c === null).length;
  return s.deck.length - empty;
};

// Pick the action whose 1-step-ahead score is highest. The action
// returned is always something the reducer will accept from the
// current phase — we re-enter pickAction on the next state to
// resolve any follow-up phases (target selection, bonus picks).
const pickAction = (s: GameState): Action => {
  switch (s.phase.kind) {
    case 'awaiting-action': {
      const drawn = s.drawn;
      if (!drawn || isJoker(drawn)) return { type: 'PLACE' };

      // ♣ → take the bonus draw if we can. Free upgrade in expectation;
      // not worth simulating against place because the bonus card's
      // future value comes from compounding into later scoring.
      if (
        drawn.suit === 'C' &&
        s.bonusDeck.length > 0 &&
        s.bonusCards.length < BONUS_HAND_LIMIT
      ) {
        return { type: 'BEGIN_SUIT_ACTION' };
      }

      // Candidate scores. PLACE is always legal.
      const placedGrid = placeAtSpiralNext(s.grid, drawn);
      const placeScore = evalGrid(placedGrid, s);

      let bestAction: Action = { type: 'PLACE' };
      let bestScore = placeScore;

      // DISCARD — only when discards are legal AND we won't strand
      // the grid. Threshold of headroom ≥ 2 leaves room for one more
      // "bad draw" without flipping a slot into the empty-line
      // penalty zone.
      if (!s.noDiscards && deckHeadroom(s) >= 2) {
        const discardScore = evalGrid(s.grid, s);
        if (discardScore > bestScore) {
          bestAction = { type: 'DISCARD_NONE' };
          bestScore = discardScore;
        }
      }

      // Suit perks — evaluate the BEST outcome of the matching perk.
      // We only need to evaluate the perk for the drawn suit, since
      // the player can only spend the drawn card's perk this turn.
      if (drawn.suit === 'H') {
        const hop = bestHop(s);
        if (hop && hop.score > bestScore) {
          bestAction = { type: 'BEGIN_SUIT_ACTION' };
          bestScore = hop.score;
        }
      } else if (drawn.suit === 'S') {
        const slide = bestSlide(s);
        if (slide && slide.score > bestScore) {
          bestAction = { type: 'BEGIN_SUIT_ACTION' };
          bestScore = slide.score;
        }
      } else if (drawn.suit === 'D') {
        // Destroying leaves a slot empty — only consider when we can
        // refill (headroom ≥ 1) so a winning destroy doesn't get
        // wiped out by an end-of-game incomplete-line penalty.
        if (deckHeadroom(s) >= 1) {
          const destroy = bestDestroy(s);
          if (destroy && destroy.score > bestScore) {
            bestAction = { type: 'BEGIN_SUIT_ACTION' };
            bestScore = destroy.score;
          }
        }
      }

      return bestAction;
    }
    case 'awaiting-target-hop': {
      // Re-evaluate from the post-BEGIN state. State is the same
      // grid as when we picked BEGIN, so the chosen pair is stable.
      const hop = bestHop(s);
      if (!hop) return { type: 'CANCEL_ACTION' };
      return { type: 'RESOLVE_HOP', i: hop.i, j: hop.j };
    }
    case 'awaiting-target-slide-source': {
      const slide = bestSlide(s);
      if (!slide) return { type: 'CANCEL_ACTION' };
      return { type: 'SLIDE_SELECT_SOURCE', slot: slide.from };
    }
    case 'awaiting-target-slide-dest': {
      // The selected source is in phase.source; re-search the best
      // destination from there. We don't store the planned direction
      // in state, so re-deriving is the easiest path.
      const from = s.phase.source;
      const moves = slideDestinationsFrom(s.grid, from);
      if (moves.length === 0) return { type: 'CANCEL_ACTION' };
      let best = moves[0];
      let bestScore = -Infinity;
      for (const m of moves) {
        const g = executeSlide(s.grid, m.from, m.direction, m.distance);
        const sc = evalGrid(g, s);
        if (sc > bestScore) { best = m; bestScore = sc; }
      }
      return {
        type: 'RESOLVE_SLIDE',
        from: best.from,
        direction: best.direction,
        distance: best.distance,
      };
    }
    case 'awaiting-target-destroy': {
      const destroy = bestDestroy(s);
      if (!destroy) return { type: 'CANCEL_ACTION' };
      return { type: 'RESOLVE_DESTROY', slot: destroy.slot };
    }
    case 'bonus-card-resolving': {
      // Pick whichever drawn card lifts the live score most if added
      // to the hand. Below cap → BONUS_KEEP; at cap → SELECT_NEW so
      // the bonus-card-replacing phase runs next.
      const drawn = s.phase.drawn;
      let bestIdx = 0;
      let bestSc = -Infinity;
      for (let i = 0; i < drawn.length; i++) {
        const hypothetical = [...s.bonusCards, drawn[i]];
        const sc = evalGrid(s.grid, { ...s, bonusCards: hypothetical });
        if (sc > bestSc) { bestSc = sc; bestIdx = i; }
      }
      if (s.bonusCards.length < BONUS_HAND_LIMIT) {
        return { type: 'BONUS_KEEP', idx: bestIdx };
      }
      return { type: 'BONUS_SELECT_NEW', idx: bestIdx };
    }
    case 'bonus-card-replacing': {
      // Replace the held card that contributes LEAST. Try each
      // index, score the hand with the new card swapped in.
      const newCard = s.phase.drawn[s.phase.pickedNew];
      let bestIdx = 0;
      let bestSc = -Infinity;
      for (let i = 0; i < s.bonusCards.length; i++) {
        const hand = s.bonusCards.slice();
        hand[i] = newCard;
        const sc = evalGrid(s.grid, { ...s, bonusCards: hand });
        if (sc > bestSc) { bestSc = sc; bestIdx = i; }
      }
      return { type: 'BONUS_REPLACE', oldIdx: bestIdx };
    }
    case 'game-over':
      throw new Error('pickAction called on game-over state');
  }
};

const runOneGame = (difficulty: Difficulty): number => {
  let s = newGame(difficulty);
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
  pctSS: number;
  pctS: number;
  pctA: number;
  pctWin: number;
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
      for (const s of allStats) {
        expect(s.n).toBe(N_GAMES);
      }
    },
    300_000
  );
});
