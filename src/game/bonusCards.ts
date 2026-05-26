import { Card, isJoker, Suit } from './cards';
import {
  BORDER_SLOTS,
  CORNER_SLOTS,
  Grid,
  INNER_SLOTS,
  LineKind,
} from './grid';
import { evaluateLine, HandRank } from './hands';

export interface LineContext {
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
  hand: HandRank | null;
}

export interface LineEffect {
  // Multipliers compose multiplicatively across cards. Omitted/1.0 = no effect.
  multiplier?: number;
  // Flats add to the per-line total after the multiplier.
  flatAdd?: number;
}

export interface GridSnapshot {
  grid: Grid;
  // Cards remaining in the playing-card deck at scoring time.
  deckRemaining: number;
  // Playing cards taken out of play without using a perk: ditched via the
  // Discard button or destroyed by a ♦. "Trash Joker" looks here.
  discards: readonly Card[];
  // Playing cards spent on a suit perk — the drawn ♥/♠/♦/♣ that triggered
  // a Hop / Slide / Destroy / Bonus. Burnout / Frugal look here.
  perkSpent: readonly Card[];
  // Per-line summaries (kind, index, hand). Computed once by the scorer and
  // passed in so grid-effect cards (e.g. "No Flushes") can inspect what
  // hands appeared on the board without re-evaluating.
  lines: readonly LineContext[];
}

export interface GridEffect {
  // Multiplicative contribution to the final-total multiplier (1.0 = no effect).
  totalMultiplier?: number;
  totalFlatAdd?: number;
}

export interface BonusCard {
  id: string;
  name: string;
  description: string;
  // Display fields for the in-game chip. `title` goes on line 1, `mult` on
  // line 2. `mult` includes "(each)" when the card can trigger on multiple
  // lines (per-line cards) or on multiple grid conditions (grid cards).
  title: string;
  mult: string;
  // Per-line effect — called once per scored line. Receives the card itself
  // as the second argument so the closure can read `card.multValue` and
  // therefore pick up power-ups without re-running the constructor.
  lineEffect?: (line: LineContext, card: BonusCard) => LineEffect;
  // Grid-level effect — called once when computing the final total.
  gridEffect?: (snap: GridSnapshot, card: BonusCard) => GridEffect;
  // When true, scoreGrid skips the -25 incomplete-line penalty entirely.
  // Used by Patience.
  negatesIncompletePenalty?: boolean;
  // Numeric value of the card's multiplier. For static-effect cards
  // (Pair ×4) this is what lineEffect / gridEffect returns directly; for
  // compound-effect cards (suit density's ×1.1 per matching card,
  // Speedrun's ×1.05 per remaining deck card) it's the per-unit base
  // before exponentiation. Power-ups scale this value and the effect
  // functions read it via the `card` parameter, so the same constructors
  // produce both original and boosted variants.
  multValue?: number;
  // The original multValue before any power-ups. Preserved through
  // power-up wrapping so the detail modal can show "was X / now Y".
  baseMultValue?: number;
  // Count of power-ups applied. 0 / undefined = original.
  powerLevel?: number;
}

// Helpers
const standardCards = (line: LineContext) =>
  line.cards.filter((c): c is Exclude<Card, { kind: 'joker' }> => c !== null && !isJoker(c));

export const lineSuit = (line: LineContext): Suit | null => {
  const std = standardCards(line);
  if (std.length === 0) return null;
  const s = std[0].suit;
  return std.every(c => c.suit === s) ? s : null;
};

// Constructor base values — explicit multipliers (no longer additive boosts).
// Each card returns its actual multiplier; the aggregator multiplies them.

// ---------- Bonus card constructors ----------

const HAND_NAME: Record<HandRank, string> = {
  HIGH_CARD: 'High Card',
  PAIR: 'Pair',
  TWO_PAIR: 'Two Pair',
  THREE_OF_A_KIND: 'Three of a Kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  FULL_HOUSE: 'Full House',
  FOUR_OF_A_KIND: 'Four of a Kind',
  STRAIGHT_FLUSH: 'Straight Flush',
  FIVE_OF_A_KIND: 'Five of a Kind',
  ROYAL_FLUSH: 'Royal Flush',
};

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', S: '♠', D: '♦', C: '♣' };

const handBoost = (hand: HandRank, multiplier: number): BonusCard => {
  const m = multiplier.toString().replace(/\.0$/, '');
  const title = HAND_NAME[hand];
  const mult = `×${m} (each)`;
  return {
    id: `hand-${hand.toLowerCase()}-x${m}`,
    name: `${title} ${mult}`,
    title,
    mult,
    description: `Lines scoring ${title}.`,
    multValue: multiplier,
    baseMultValue: multiplier,
    lineEffect: (line, card) =>
      line.hand === hand ? { multiplier: card.multValue ?? multiplier } : {},
  };
};

const rowBoost = (rowIdx: number, multiplier: number): BonusCard => {
  const m = multiplier.toString().replace(/\.0$/, '');
  const title = `Row ${rowIdx + 1}`;
  const mult = `×${m}`;
  return {
    id: `row-${rowIdx + 1}-x${m}`,
    name: `${title} ${mult}`,
    title,
    mult,
    description: `${title}'s score.`,
    multValue: multiplier,
    baseMultValue: multiplier,
    lineEffect: (line, card) =>
      line.kind === 'row' && line.index === rowIdx && line.hand
        ? { multiplier: card.multValue ?? multiplier }
        : {},
  };
};

const colBoost = (colIdx: number, multiplier: number): BonusCard => {
  const m = multiplier.toString().replace(/\.0$/, '');
  const title = `Col ${colIdx + 1}`;
  const mult = `×${m}`;
  return {
    id: `col-${colIdx + 1}-x${m}`,
    name: `${title} ${mult}`,
    title,
    mult,
    description: `Column ${colIdx + 1}'s score.`,
    multValue: multiplier,
    baseMultValue: multiplier,
    lineEffect: (line, card) =>
      line.kind === 'col' && line.index === colIdx && line.hand
        ? { multiplier: card.multValue ?? multiplier }
        : {},
  };
};

// Per-suit-in-line: multiplies the line by 1.1 for each card of `suit` in it.
// A 'double' supercharge counts as 2 cards of its suit (per the user's
// "6 card flush could help with the ×1.1 multiplier for that suit"); wild
// supercharges don't contribute to density — they're flexible for flush
// evaluation only.
const suitDensity = (suit: Suit): BonusCard => ({
  id: `suit-density-${suit.toLowerCase()}`,
  name: `${SUIT_GLYPH[suit]} Density ×1.1 (each)`,
  title: `${SUIT_GLYPH[suit]} Density`,
  mult: '×1.1 (each)',
  description: `Each ${SUIT_GLYPH[suit]} in the line.`,
  multValue: 1.1,
  baseMultValue: 1.1,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const n = standardCards(line).reduce((acc, c) => {
      if (c.suit !== suit) return acc;
      return acc + (c.supercharge === 'double' ? 2 : 1);
    }, 0);
    const base = card.multValue ?? 1.1;
    return n > 0 ? { multiplier: Math.pow(base, n) } : {};
  },
});

// ---------- Per-line novel ----------

const rainbowLine: BonusCard = {
  id: 'rainbow-line-x2',
  name: 'Rainbow ×2 (each)',
  title: 'Rainbow',
  mult: '×2 (each)',
  description: 'Lines with 4+ distinct suits.',
  multValue: 2,
  baseMultValue: 2,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const suits = new Set(standardCards(line).map(c => c.suit));
    return suits.size >= 4 ? { multiplier: card.multValue ?? 2 } : {};
  },
};

const jokerLine: BonusCard = {
  id: 'joker-line-x1_5',
  name: 'Joker Line ×1.5 (each)',
  title: 'Joker Line',
  mult: '×1.5 (each)',
  description: 'The joker\'s row and column.',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const hasJoker = line.cards.some(c => c !== null && isJoker(c));
    return hasJoker ? { multiplier: card.multValue ?? 1.5 } : {};
  },
};

const outerEdge: BonusCard = {
  id: 'outer-edge-x1_25',
  name: 'Outer Edge ×1.25 (each)',
  title: 'Outer Edge',
  mult: '×1.25 (each)',
  description: 'The 4 outer rows and columns (R1, R5, C1, C5).',
  multValue: 1.25,
  baseMultValue: 1.25,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const onEdge =
      (line.kind === 'row' && (line.index === 0 || line.index === 4)) ||
      (line.kind === 'col' && (line.index === 0 || line.index === 4));
    return onEdge ? { multiplier: card.multValue ?? 1.25 } : {};
  },
};

const royalTouch: BonusCard = {
  id: 'royal-touch-x1_5',
  name: 'Royal Touch ×1.5 (each)',
  title: 'Royal Touch',
  mult: '×1.5 (each)',
  description: 'Lines containing an Ace.',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const hasAce = standardCards(line).some(c => c.rank === 'A');
    return hasAce ? { multiplier: card.multValue ?? 1.5 } : {};
  },
};

const spiralCore: BonusCard = {
  id: 'spiral-core-x1_5',
  name: 'Spiral Core ×1.5 (each)',
  title: 'Spiral Core',
  mult: '×1.5 (each)',
  description: 'The center row and center column (R3, C3).',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const onCore =
      (line.kind === 'row' && line.index === 2) ||
      (line.kind === 'col' && line.index === 2);
    return onCore ? { multiplier: card.multValue ?? 1.5 } : {};
  },
};

// ---------- Grid-level achievements ----------

const isFace = (c: Card): boolean =>
  !isJoker(c) && (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K');

const cleanBorder: BonusCard = {
  id: 'clean-border-x1_5',
  name: 'Clean Border ×1.5',
  title: 'Clean Border',
  mult: '×1.5',
  description: 'No face cards on the 16 border slots.',
  multValue: 1.5,
  baseMultValue: 1.5,
  gridEffect: ({ grid }, card) => {
    const anyFace = BORDER_SLOTS.some(i => {
      const c = grid[i];
      return c !== null && isFace(c);
    });
    return anyFace ? {} : { totalMultiplier: card.multValue ?? 1.5 };
  },
};

const monochromeBorder: BonusCard = {
  id: 'monochrome-border-x2',
  name: 'Monochrome Border ×2',
  title: 'Monochrome Border',
  mult: '×2',
  description: 'All border cards are the same color (red or black).',
  multValue: 2,
  baseMultValue: 2,
  gridEffect: ({ grid }, card) => {
    // Wild cards are suit-flexible so they don't count against the color
    // check (they can be either red or black for evaluation purposes).
    // Jokers and empty slots are also excluded — only the filled,
    // non-wild standard cards on the border have to share a color.
    const cards = BORDER_SLOTS.map(i => grid[i]).filter(
      (c): c is Card =>
        c !== null && !isJoker(c) && c.supercharge !== 'wild'
    );
    if (cards.length === 0) return {};
    const isRed = (c: Card) => !isJoker(c) && (c.suit === 'H' || c.suit === 'D');
    const allRed = cards.every(isRed);
    const allBlack = cards.every(c => !isRed(c));
    return allRed || allBlack ? { totalMultiplier: card.multValue ?? 2 } : {};
  },
};

const rainbowCorners: BonusCard = {
  id: 'rainbow-corners-x1_25',
  name: 'Rainbow Corners ×1.25',
  title: 'Rainbow Corners',
  mult: '×1.25',
  description: 'The 4 corners are 4 distinct suits.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ grid }, card) => {
    const cards = CORNER_SLOTS.map(i => grid[i]);
    // Empty corners block the achievement — we need all four filled.
    if (cards.some(c => c === null)) return {};
    // Both the joker and wild-supercharged cards are suit-flexible:
    // they can fill any missing suit. The achievement triggers iff
    // the non-flexible corners have distinct suits among themselves
    // (no duplicates), since the remaining flex cards can always be
    // assigned the missing suits.
    const nonFlexSuits: Suit[] = [];
    let flexCount = 0;
    for (const c of cards) {
      if (c === null) continue;
      if (isJoker(c) || c.supercharge === 'wild') {
        flexCount += 1;
      } else {
        nonFlexSuits.push(c.suit);
      }
    }
    const noDupes = new Set(nonFlexSuits).size === nonFlexSuits.length;
    return noDupes && nonFlexSuits.length + flexCount === 4
      ? { totalMultiplier: card.multValue ?? 1.25 }
      : {};
  },
};

const cozyJoker: BonusCard = {
  id: 'cozy-joker-x1_15',
  name: 'Cozy Joker ×1.15',
  title: 'Cozy Joker',
  mult: '×1.15',
  description: 'Joker placed in the inner 3×3.',
  multValue: 1.15,
  baseMultValue: 1.15,
  gridEffect: ({ grid }, card) => {
    const inInner = INNER_SLOTS.some(i => {
      const c = grid[i];
      return c !== null && isJoker(c);
    });
    return inInner ? { totalMultiplier: card.multValue ?? 1.15 } : {};
  },
};

// Compounds 1.05 per playing card remaining in the deck at game end. Effective
// multiplier is 1.05^deckRemaining, so 10 left ≈ 1.63×, 20 ≈ 2.65×.
const deckBank: BonusCard = {
  id: 'deck-bank-x1_05',
  name: 'Speedrun ×1.05 (each)',
  title: 'Speedrun',
  mult: '×1.05 (each)',
  description: 'Each playing card still in the deck at game end.',
  multValue: 1.05,
  baseMultValue: 1.05,
  gridEffect: ({ deckRemaining }, card) => {
    const base = card.multValue ?? 1.05;
    return {
      totalMultiplier: deckRemaining > 0 ? Math.pow(base, deckRemaining) : 1,
    };
  },
};

const noFlushes: BonusCard = {
  id: 'no-flushes-x1_25',
  name: 'No Flushes ×1.25',
  title: 'No Flushes',
  mult: '×1.25',
  description: 'No line scores a flush of any kind.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ lines }, card) => {
    const anyFlush = lines.some(l =>
      l.hand === 'FLUSH' || l.hand === 'STRAIGHT_FLUSH' || l.hand === 'ROYAL_FLUSH'
    );
    return anyFlush ? {} : { totalMultiplier: card.multValue ?? 1.25 };
  },
};

const noStraights: BonusCard = {
  id: 'no-straights-x1_25',
  name: 'No Straights ×1.25',
  title: 'No Straights',
  mult: '×1.25',
  description: 'No line scores a straight of any kind.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ lines }, card) => {
    const anyStraight = lines.some(l =>
      l.hand === 'STRAIGHT' || l.hand === 'STRAIGHT_FLUSH' || l.hand === 'ROYAL_FLUSH'
    );
    return anyStraight ? {} : { totalMultiplier: card.multValue ?? 1.25 };
  },
};

const trashJoker: BonusCard = {
  id: 'trash-joker-x1_25',
  name: 'Trash Joker ×1.25',
  title: 'Trash Joker',
  mult: '×1.25',
  description: 'The joker was destroyed during the run.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ discards }, card) => {
    const jokerOut = discards.some(c => isJoker(c));
    return jokerOut ? { totalMultiplier: card.multValue ?? 1.25 } : {};
  },
};

// ---- Spatial / pattern bonuses ----------------------------------------------

// Main and anti diagonals each multiply the final total by 1.25 when the 5
// cards on that diagonal score a Straight or any higher hand (Flush, Full
// House, Four of a Kind, Straight Flush, Royal Flush). Both diagonals can
// trigger simultaneously → 1.25 × 1.25 = 1.5625.
const STRAIGHT_OR_HIGHER: Set<HandRank> = new Set<HandRank>([
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
  'ROYAL_FLUSH',
  'FIVE_OF_A_KIND',
]);
const isStraightOrBetter = (cards: (Card | null)[]): boolean => {
  const h = evaluateLine(cards);
  return h !== null && STRAIGHT_OR_HIGHER.has(h);
};

const diagonalRun: BonusCard = {
  id: 'diagonal-run-x1_25',
  name: 'Diagonal ×1.25 (each)',
  title: 'Diagonal',
  mult: '×1.25 (each)',
  description: 'Each grid diagonal that forms a Straight or higher.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ grid }, card) => {
    const m = card.multValue ?? 1.25;
    const main = [grid[0], grid[6], grid[12], grid[18], grid[24]];
    const anti = [grid[4], grid[8], grid[12], grid[16], grid[20]];
    let mult = 1;
    if (isStraightOrBetter(main)) mult *= m;
    if (isStraightOrBetter(anti)) mult *= m;
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

// Mirror-symmetric scoring: R1 and R5 share a hand type → ×1.2, and again
// C1 and C5 share one → ×1.2. Both at once = ×1.44. High Card is excluded
// since matching "nothing" shouldn't pay out.
const symmetricFrame: BonusCard = {
  id: 'symmetric-frame-x1_2',
  name: 'Symmetric Frame ×1.2 (each)',
  title: 'Symmetric Frame',
  mult: '×1.2 (each)',
  description: 'R1/R5 or C1/C5 sharing a hand type (High Card doesn\'t count).',
  multValue: 1.2,
  baseMultValue: 1.2,
  gridEffect: ({ lines }, card) => {
    const m = card.multValue ?? 1.2;
    const handAt = (kind: 'row' | 'col', idx: number): HandRank | null =>
      lines.find(l => l.kind === kind && l.index === idx)?.hand ?? null;
    const matches = (a: HandRank | null, b: HandRank | null): boolean =>
      a !== null && a !== 'HIGH_CARD' && a === b;
    let mult = 1;
    if (matches(handAt('row', 0), handAt('row', 4))) mult *= m;
    if (matches(handAt('col', 0), handAt('col', 4))) mult *= m;
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

// Patience cancels the -25 incomplete-line penalty entirely. Doesn't add a
// multiplier; its value is the penalties it prevents. scoreGrid reads the
// `negatesIncompletePenalty` flag directly.
const patience: BonusCard = {
  id: 'patience-no-penalty',
  name: 'Patience',
  title: 'Patience',
  mult: '(no negative points)',
  description: 'Removes the -25 penalty for incomplete rows or columns at game end.',
  negatesIncompletePenalty: true,
};

// Perk-volume tells: how many suit perks did you spend across the run?
// (Counts the ♥/♠/♦/♣ used to trigger a Hop / Slide / Destroy / Bonus.
//  Plain Discards and destroyed targets DON'T count here — only perks.)
const burnout: BonusCard = {
  id: 'burnout-x1_3',
  name: 'Burnout ×1.3',
  title: 'Burnout',
  mult: '×1.3',
  description: '18+ suit perks spent across the run.',
  multValue: 1.3,
  baseMultValue: 1.3,
  gridEffect: ({ perkSpent }, card) =>
    perkSpent.length >= 18 ? { totalMultiplier: card.multValue ?? 1.3 } : {},
};

const frugal: BonusCard = {
  id: 'frugal-x1_5',
  name: 'Frugal ×1.5',
  title: 'Frugal',
  mult: '×1.5',
  description: '12 or fewer suit perks spent across the run.',
  multValue: 1.5,
  baseMultValue: 1.5,
  gridEffect: ({ perkSpent }, card) =>
    perkSpent.length <= 12 ? { totalMultiplier: card.multValue ?? 1.5 } : {},
};

// ---------- The pool ----------

export const BONUS_DECK_POOL: BonusCard[] = [
  // Hand-type (8) — Pair-through-Three of a Kind are big multipliers; the
  // higher-ranked hands are capped at ×1.5 so they don't trivially explode.
  handBoost('PAIR', 4),
  handBoost('TWO_PAIR', 3),
  handBoost('THREE_OF_A_KIND', 3),
  handBoost('STRAIGHT', 2),
  handBoost('FLUSH', 1.5),
  handBoost('FULL_HOUSE', 1.5),
  handBoost('FOUR_OF_A_KIND', 1.5),
  handBoost('STRAIGHT_FLUSH', 1.5),

  // Rows + Cols (10) — literal ×2
  rowBoost(0, 2),
  rowBoost(1, 2),
  rowBoost(2, 2),
  rowBoost(3, 2),
  rowBoost(4, 2),
  colBoost(0, 2),
  colBoost(1, 2),
  colBoost(2, 2),
  colBoost(3, 2),
  colBoost(4, 2),

  // Suit-density (4)
  suitDensity('H'),
  suitDensity('S'),
  suitDensity('D'),
  suitDensity('C'),

  // Per-line conditional (5)
  rainbowLine,
  jokerLine,
  royalTouch,
  spiralCore,
  outerEdge,

  // Grid-wide (12)
  cleanBorder,
  monochromeBorder,
  rainbowCorners,
  cozyJoker,
  deckBank,
  noFlushes,
  noStraights,
  trashJoker,
  diagonalRun,
  symmetricFrame,
  burnout,
  frugal,
  patience,
];

export const BONUS_HAND_LIMIT = 3;

// ---------- Effect aggregation ----------

export const applyLineEffects = (
  line: LineContext,
  cards: readonly BonusCard[]
): { multiplier: number; flat: number } => {
  let mult = 1;
  let flat = 0;
  for (const bc of cards) {
    if (!bc.lineEffect) continue;
    const e = bc.lineEffect(line, bc);
    if (e.multiplier !== undefined && e.multiplier !== 0) mult *= e.multiplier;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier: mult, flat };
};

// Each card whose line-effect actually fires on this line, returned in the
// order it would be applied. Used by the LineDetailModal to show a step-by-
// step math breakdown.
export interface LineContributor {
  card: BonusCard;
  multiplier: number;
  flat: number;
}

export const lineContributors = (
  line: LineContext,
  cards: readonly BonusCard[]
): LineContributor[] => {
  const out: LineContributor[] = [];
  for (const bc of cards) {
    if (!bc.lineEffect) continue;
    const e = bc.lineEffect(line, bc);
    const mult = e.multiplier ?? 1;
    const flat = e.flatAdd ?? 0;
    if (mult !== 1 || flat !== 0) out.push({ card: bc, multiplier: mult, flat });
  }
  return out;
};

export const applyGridEffects = (
  snap: GridSnapshot,
  cards: readonly BonusCard[]
): { multiplier: number; flat: number } => {
  let mult = 1;
  let flat = 0;
  for (const bc of cards) {
    if (!bc.gridEffect) continue;
    const e = bc.gridEffect(snap, bc);
    if (e.totalMultiplier !== undefined && e.totalMultiplier !== 0) mult *= e.totalMultiplier;
    if (e.totalFlatAdd) flat += e.totalFlatAdd;
  }
  return { multiplier: mult, flat };
};

// ---------- Power-up ----------

// Round a multiplier to one decimal place — used everywhere a powered-up
// value is computed so chip text and scoring stay in lockstep.
const roundTenth = (n: number): number => Math.round(n * 10) / 10;

// Targets-Up reward: scale a held bonus card's multiplier by `factor`
// (default ×1.2) and round to the nearest tenth. Returns a NEW BonusCard
// — the original is untouched, so the same card can keep firing at its
// pre-boost value if it's already on the grid via another path.
//
// Cards without a multiplier (Patience) return unchanged: there's nothing
// numeric to scale. baseMultValue is set once on the first power-up so
// the detail modal can later show "was X / now Y".
//
// Stacking is composable — calling powerUpBonusCard on an already-powered
// card scales its current multValue, rounded once. The id gains a
// `-pwrN` suffix so the same card type can coexist with un-powered or
// differently-powered copies of itself in the bonus deck.
export const powerUpBonusCard = (
  card: BonusCard,
  factor: number = 1.2
): BonusCard => {
  if (card.multValue === undefined) return card;
  const newMultValue = roundTenth(card.multValue * factor);
  const newPowerLevel = (card.powerLevel ?? 0) + 1;
  // The `mult` chip text always contains a single "×N" segment for cards
  // that have a numeric multiplier; rewrite it to the scaled value.
  const newMultText = card.mult.replace(/×[\d.]+/, `×${newMultValue}`);
  const newName = card.name.replace(/×[\d.]+/, `×${newMultValue}`);
  // Strip any existing -pwrN suffix so repeated power-ups don't stack
  // "-pwr1-pwr2-pwr3" tails — replace with a single counter.
  const baseId = card.id.replace(/-pwr\d+$/, '');
  return {
    ...card,
    id: `${baseId}-pwr${newPowerLevel}`,
    name: newName,
    mult: newMultText,
    multValue: newMultValue,
    baseMultValue: card.baseMultValue ?? card.multValue,
    powerLevel: newPowerLevel,
  };
};

// ---------- Universal-effect detection (for scoring reference) ----------

// Probe cards used to detect "universal" line effects (cards whose effect is
// the same on every line). Chosen so that every suit appears a different
// number of times between A and B — that way per-suit-density cards yield
// different multipliers across probes and are correctly classified as
// conditional (not universal).
//
//        A: 2H 3H 5D 7S JC  → H:2 D:1 S:1 C:1
//        B: 4H 5H 6H 7C 8C  → H:3 D:0 S:0 C:2
const PROBE_CARDS_A: Card[] = [
  { kind: 'standard', rank: '2', suit: 'H' },
  { kind: 'standard', rank: '3', suit: 'H' },
  { kind: 'standard', rank: '5', suit: 'D' },
  { kind: 'standard', rank: '7', suit: 'S' },
  { kind: 'standard', rank: 'J', suit: 'C' },
];
const PROBE_CARDS_B: Card[] = [
  { kind: 'standard', rank: '4', suit: 'H' },
  { kind: 'standard', rank: '5', suit: 'H' },
  { kind: 'standard', rank: '6', suit: 'H' },
  { kind: 'standard', rank: '7', suit: 'C' },
  { kind: 'standard', rank: '8', suit: 'C' },
];

export const universalEffectFor = (
  bc: BonusCard,
  hand: HandRank
): LineEffect | null => {
  if (!bc.lineEffect) return null;
  // Variants cover edge AND non-edge line indices so cards keyed on
  // outer-edge position (Outer Edge, Spiral core, Row N, Col N) are
  // correctly classified as conditional rather than universal.
  const variants: LineContext[] = [
    { kind: 'row', index: 0, cards: PROBE_CARDS_A, hand },
    { kind: 'row', index: 2, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 0, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 4, cards: PROBE_CARDS_A, hand },
  ];
  const sig = (e: LineEffect) => `${e.multiplier ?? 1}|${e.flatAdd ?? 0}`;
  const results = variants.map(v => bc.lineEffect!(v, bc));
  const first = sig(results[0]);
  if (!results.every(r => sig(r) === first)) return null;
  const e = results[0];
  if ((e.multiplier === undefined || e.multiplier === 1) && !e.flatAdd) return null;
  return e;
};

export const universalEffectSum = (
  cards: readonly BonusCard[],
  hand: HandRank
): { multiplier: number; flat: number } => {
  let multiplier = 1;
  let flat = 0;
  for (const bc of cards) {
    const e = universalEffectFor(bc, hand);
    if (!e) continue;
    if (e.multiplier !== undefined && e.multiplier !== 0) multiplier *= e.multiplier;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier, flat };
};
