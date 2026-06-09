import { Card, isJoker, Rank, Suit } from './cards';
import {
  CORNER_SLOTS,
  Grid,
  INNER_SLOTS,
  LineKind,
} from './grid';
import { evaluateLine, HAND_TIER, HandRank } from './hands';

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
  // therefore pick up power-ups without re-running the constructor. The
  // optional third arg (`allLines`) is the full set of LineContexts for
  // the grid being scored — provided by applyLineEffects whenever the
  // caller has it on hand. Cross-line cards (Lowhand) use it to compare
  // the current line against the rest of the board; single-line cards
  // (the vast majority) ignore the argument and run as before.
  lineEffect?: (
    line: LineContext,
    card: BonusCard,
    allLines?: readonly LineContext[]
  ) => LineEffect;
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
  // One-time-use action cards (Three Tricks challenge). When set, the
  // card has no scoring effect — tapping it activates a grid-targeting
  // flow and the card is marked `used` on commit. These live in the
  // regular bonus-card slots but render with a distinct (green) border
  // to set them apart from in-game (yellow) and end-game (purple)
  // multipliers.
  specialKind?:
    | 'power-swap'
    | 'doubler'
    | 'wildcard'
    | 'mega-destroy'
    | 'side-slide'
    | 'jump'
    | 'shuffle'
    | 'plus-minus'
    | 'revive'
    | 'rewind';
  // True after a one-time-use card has been activated. The card stays
  // in the hand (occupying its slot) but is rendered dimmed and no
  // longer accepts activation. Keeping the spent card around — rather
  // than dropping it — sets up future modes where regular bonus cards
  // can also be consumed and the spent slot still blocks ♣ from
  // drawing a fresh card into that position.
  used?: boolean;
  // Marks an "empty" placeholder card used by the Mixed Bag challenge
  // to keep slot positions stable while a slot is still unfilled. A
  // placeholder has no effects, can't be activated, and renders as a
  // dimmed "draw to fill" prompt in the matching category tone.
  placeholderKind?: 'special' | 'in-game' | 'end-game';
}

// Three "Three Tricks" challenge special cards. Each one is a single-use
// action triggered by tapping the chip; none of them participate in
// scoring (no lineEffect / gridEffect). They live in the regular bonus
// hand slots so the strip layout is unchanged.
export const POWER_SWAP_CARD: BonusCard = {
  id: 'special-power-swap',
  name: 'Power Swap',
  title: 'Power Swap',
  mult: 'one-time',
  description:
    'Pick any two cards on the grid and swap them. No row / column restriction. Consumed on use.',
  specialKind: 'power-swap',
};

export const DOUBLER_CARD: BonusCard = {
  id: 'special-doubler',
  name: 'The Doubler',
  title: 'The Doubler',
  mult: 'one-time',
  description:
    'Pick a card on the grid and turn it into a "double" — it counts as two of the same rank for pair-class hands and adds +1 to per-suit density. Consumed on use.',
  specialKind: 'doubler',
};

export const WILDCARD_CARD: BonusCard = {
  id: 'special-wildcard',
  name: 'Wildcard',
  title: 'Wildcard',
  mult: 'one-time',
  description:
    "Pick a card on the grid and turn it into a wild — its suit becomes flexible for flush / straight-flush evaluation. Rank is unchanged. Consumed on use.",
  specialKind: 'wildcard',
};

export const MEGA_DESTROY_CARD: BonusCard = {
  id: 'special-mega-destroy',
  name: 'Mega Destroy',
  title: 'Mega Destroy',
  mult: 'one-time',
  description:
    'Destroy up to 5 cards on the grid in one shot. Tap each card you want to remove, then confirm. Consumed on use.',
  specialKind: 'mega-destroy',
};

// Slip & Slide (was Side Slide). The id keeps the original
// `special-side-slide` value so existing save data still resolves it.
// The display title is the new name; mechanics now allow a multi-step
// path in any combination of cardinal directions, not just one
// perpendicular slide.
export const SIDE_SLIDE_CARD: BonusCard = {
  id: 'special-side-slide',
  name: 'Slip & Slide',
  title: 'Slip & Slide',
  mult: 'one-time',
  description:
    'Pick a row or column of 2+ adjacent cards, then move them as a unit along a path of single-cell hops. The path can change direction (e.g. 2 up + 1 left) as long as each step is legal. Consumed on use.',
  specialKind: 'side-slide',
};

export const JUMP_JUMP_CARD: BonusCard = {
  id: 'special-jump-jump',
  name: 'Jump, Jump',
  title: 'Jump, Jump',
  mult: 'one-time',
  description:
    'Pick a card on the grid, then tap any empty slot to move the card there. Consumed on use.',
  specialKind: 'jump',
};

export const SHUFFLE_CARD: BonusCard = {
  id: 'special-shuffle',
  name: 'Shuffle',
  title: 'Shuffle',
  mult: 'one-time',
  description:
    'Pick 3 to 5 cards on the grid. The cards are pulled, shuffled, and dropped back into the same slots — a card may end up where it started. Consumed on use.',
  specialKind: 'shuffle',
};

export const PLUS_MINUS_CARD: BonusCard = {
  id: 'special-plus-minus',
  name: 'Plus/Minus',
  title: 'Plus/Minus',
  mult: 'one-time',
  description:
    "Pick a card on the grid and bump its rank up or down by 1. Aces wrap to either Kings (−1) or 2s (+1). Joker can't be picked. Consumed on use.",
  specialKind: 'plus-minus',
};

export const REVIVE_CARD: BonusCard = {
  id: 'special-revive',
  name: 'Revive',
  title: 'Revive',
  mult: 'one-time',
  description:
    'Pick any card from the discard pile and place it on the grid. The card lands in the next spiral slot. Consumed on use.',
  specialKind: 'revive',
};

export const REWIND_CARD: BonusCard = {
  id: 'special-rewind',
  name: 'Rewind',
  title: 'Rewind',
  mult: 'one-time',
  description:
    'Pick 3 to 5 cards from the grid. They are removed and shuffled back into the playing deck for later. The currently drawn card is unaffected and still must be placed. Consumed on use.',
  specialKind: 'rewind',
};

// Pool of every one-time action card. Used by the Three Tricks challenge
// (samples 3 at random) and by any future variant that wants to roll
// against the special deck.
export const SPECIAL_DECK_POOL: BonusCard[] = [
  POWER_SWAP_CARD,
  DOUBLER_CARD,
  WILDCARD_CARD,
  MEGA_DESTROY_CARD,
  SIDE_SLIDE_CARD,
  JUMP_JUMP_CARD,
  SHUFFLE_CARD,
  PLUS_MINUS_CARD,
  REVIVE_CARD,
  REWIND_CARD,
];

export const isSpecialCard = (c: BonusCard): boolean =>
  c.specialKind !== undefined;

// Slot category — used by the Mixed Bag challenge to lock each of the
// three bonus hand slots to a different family. The label below maps a
// SlotKind to the chip tone (green / yellow / purple) the player sees.
export type SlotKind = 'special' | 'in-game' | 'end-game';

// Does this card belong in a slot of the given kind?
//   'special'  → one-time action cards (green chips).
//   'in-game'  → per-line scoring cards (yellow chips).
//   'end-game' → grid / deck-management cards (purple chips).
export const cardMatchesSlot = (
  card: BonusCard,
  kind: SlotKind
): boolean => {
  if (isSpecialCard(card)) return kind === 'special';
  if (card.lineEffect) return kind === 'in-game';
  if (card.gridEffect) return kind === 'end-game';
  return false;
};

// Placeholder card shown in an empty categorized slot. Holds no effects;
// the BonusCardStrip detects it via `placeholderKind` and renders a
// dimmed "draw to fill" prompt in the matching tone. Players never see
// these in non-categorized modes.
export const slotPlaceholder = (kind: SlotKind): BonusCard => ({
  id: `placeholder-${kind}`,
  name: '(empty)',
  title:
    kind === 'special' ? 'Green slot'
    : kind === 'in-game' ? 'Yellow slot'
    : 'Purple slot',
  mult: 'empty',
  description: `Empty slot. Draw a ♣ Bonus and pick this slot to fill it with a ${
    kind === 'special' ? 'one-time action'
    : kind === 'in-game' ? 'per-line scoring'
    : 'grid / deck-management'
  } card.`,
  placeholderKind: kind,
});

export const isPlaceholder = (c: BonusCard): boolean =>
  c.placeholderKind !== undefined;

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
// Per the Targets Up spec, supercharges DON'T scale the count here:
//  - A 'wild' supercharge contributes nothing — wild's flexibility is
//    for flush evaluation, not for boosting per-suit density bonuses.
//  - A 'double' supercharge counts as ONE physical card of its suit
//    (its 2× effect is for rank-count hand evaluation, not for
//    density which is a per-physical-card tally).
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
      if (c.supercharge === 'wild') return acc;
      if (c.suit !== suit) return acc;
      return acc + 1;
    }, 0);
    const base = card.multValue ?? 1.1;
    return n > 0 ? { multiplier: Math.pow(base, n) } : {};
  },
});

// Blackjack-style pip value of a single card. 2–10 = face, J/Q/K = 10,
// A is 1 or 11 depending on aceHigh. Used by Highball / Lowball /
// Blackjack to score lines by total pip value rather than poker rank.
const blackjackValue = (
  c: Exclude<Card, { kind: 'joker' }>,
  aceHigh: boolean
): number => {
  switch (c.rank) {
    case 'A': return aceHigh ? 11 : 1;
    case 'J':
    case 'Q':
    case 'K':
    case '10':
      return 10;
    default:
      return parseInt(c.rank, 10);
  }
};

// Sum the line's standard cards as blackjack pip values. Jokers
// contribute 0 (they're excluded). The same physical Ace on the board
// can take value 1 on one line and 11 on another — every bonus card
// calls this fresh per line with its own aceHigh setting.
const lineBlackjackTotal = (line: LineContext, aceHigh: boolean): number =>
  standardCards(line).reduce((sum, c) => sum + blackjackValue(c, aceHigh), 0);

// Real blackjack: any ace can count as 1 OR 11 independently. We accept
// the line if ANY assignment of the n aces in the line sums to exactly
// 21. Iterate k = 0..n (number of aces taken as 11).
const lineCanBlackjack = (line: LineContext): boolean => {
  const std = standardCards(line);
  const aces = std.filter(c => c.rank === 'A').length;
  const nonAceSum = std
    .filter(c => c.rank !== 'A')
    .reduce((s, c) => s + blackjackValue(c, false), 0);
  for (let k = 0; k <= aces; k++) {
    if (nonAceSum + k * 11 + (aces - k) * 1 === 21) return true;
  }
  return false;
};

// ---------- Per-line novel ----------

// IDs intentionally keep their legacy "×2 / ×1_5" tags — the values
// have been retuned over time but the IDs are persisted in save data
// (run state, daily-play snapshots) and changing them would orphan
// existing entries on load. Display multipliers are the source of
// truth for the player; IDs are an internal identifier.
const rainbowLine: BonusCard = {
  id: 'rainbow-line-x2',
  name: 'Rainbow ×1.25 (each)',
  title: 'Rainbow',
  mult: '×1.25 (each)',
  description: 'Lines with 4+ distinct suits.',
  multValue: 1.25,
  baseMultValue: 1.25,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    // Jokers and wild-supercharged cards are suit-flexible — each
    // one can stand in for whichever suit is still missing from the
    // line. Counted separately and added to the distinct-standard-
    // suits tally so the line scores as 4+ distinct whenever flex
    // cards can fill the gaps. Wilds lose their original suit when
    // supercharged, so they behave like jokers here (their
    // suit-flex is the whole point of the supercharge).
    let flexible = 0;
    const distinctSuits = new Set<Suit>();
    for (const c of line.cards) {
      if (c === null) continue;
      if (isJoker(c) || c.supercharge === 'wild') {
        flexible += 1;
      } else {
        distinctSuits.add(c.suit);
      }
    }
    return distinctSuits.size + flexible >= 4
      ? { multiplier: card.multValue ?? 1.25 }
      : {};
  },
};

const jokerLine: BonusCard = {
  id: 'joker-line-x1_5',
  name: 'Joker Line ×1.25 (each)',
  title: 'Joker Line',
  mult: '×1.25 (each)',
  description: 'The joker\'s row and column.',
  multValue: 1.25,
  baseMultValue: 1.25,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    const hasJoker = line.cards.some(c => c !== null && isJoker(c));
    return hasJoker ? { multiplier: card.multValue ?? 1.25 } : {};
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

const highball: BonusCard = {
  id: 'highball-x1_5',
  name: 'Highball ×1.5 (each)',
  title: 'Highball',
  mult: '×1.5 (each)',
  description: 'Lines totalling 45+ (A=11, face=10).',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    return lineBlackjackTotal(line, true) >= 45
      ? { multiplier: card.multValue ?? 1.5 }
      : {};
  },
};

const lowball: BonusCard = {
  id: 'lowball-x1_5',
  name: 'Lowball ×1.5 (each)',
  title: 'Lowball',
  mult: '×1.5 (each)',
  description: 'Lines totalling 20 or less (A=1, face=10).',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    return lineBlackjackTotal(line, false) <= 20
      ? { multiplier: card.multValue ?? 1.5 }
      : {};
  },
};

const blackjack: BonusCard = {
  id: 'blackjack-x2',
  name: 'Blackjack ×2 (each)',
  title: 'Blackjack',
  mult: '×2 (each)',
  description: 'Lines totalling exactly 21 (each A is 1 or 11).',
  multValue: 2,
  baseMultValue: 2,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    return lineCanBlackjack(line) ? { multiplier: card.multValue ?? 2 } : {};
  },
};

// Lowhand — boosts the line(s) tied for the lowest scoring hand on
// the board. "Scoring" excludes HIGH_CARD lines (they pay 0 base, so
// tripling 0 is a no-op and bunching with them would be misleading
// in the per-line breakdown). Ties all fire — if two lines share the
// minimum hand rank, both get the ×3 multiplier.
const lowhand: BonusCard = {
  id: 'lowhand-x3',
  name: 'Lowhand ×3 (each)',
  title: 'Lowhand',
  mult: '×3 (each)',
  description: 'Lines tying the lowest hand rank on the board (Pair+).',
  multValue: 3,
  baseMultValue: 3,
  lineEffect: (line, card, allLines) => {
    if (!line.hand || line.hand === 'HIGH_CARD') return {};
    // No allLines context → universalEffectFor probe path. Return
    // empty so the card is correctly classified as conditional
    // (depends on what else is on the board) rather than universal.
    if (!allLines) return {};
    let minTier = Infinity;
    for (const l of allLines) {
      if (l.hand && l.hand !== 'HIGH_CARD') {
        const t = HAND_TIER[l.hand];
        if (t < minTier) minTier = t;
      }
    }
    if (minTier === Infinity) return {};
    return HAND_TIER[line.hand] === minTier
      ? { multiplier: card.multValue ?? 3 }
      : {};
  },
};

// High Kicker — fires on Pair / 2 Pair / 3-of-a-kind / 4-of-a-kind
// lines whose non-pairing card is J, Q, K, or A. Full House is in
// the "set type" family per the spec but can never have a kicker (5
// cards consumed by the 3 + 2 sets), so it's listed but never
// triggers.
//
// Joker handling is approximate: rank counts are computed off the
// standard cards only, and any standard card whose rank appears once
// is treated as a kicker candidate. In joker-pairing scenarios this
// can both miss true kickers (if the joker pairs with what looks
// like a singleton) and accept them generously. The simpler reading
// is closer to how a player thinks about the line at a glance.
const SET_TYPE_HANDS = new Set<HandRank>([
  'PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
]);
const HIGH_KICKER_RANKS = new Set<Rank>(['J', 'Q', 'K', 'A']);

const highKicker: BonusCard = {
  id: 'high-kicker-x1_5',
  name: 'High Kicker ×1.5 (each)',
  title: 'High Kicker',
  mult: '×1.5 (each)',
  description: 'Pair / 2 Pair / 3 or 4 of a Kind with a J / Q / K / A kicker.',
  multValue: 1.5,
  baseMultValue: 1.5,
  lineEffect: (line, card) => {
    if (!line.hand) return {};
    if (!SET_TYPE_HANDS.has(line.hand)) return {};
    // Full House consumes every slot into the 3+2 — no kicker is
    // possible, so it never qualifies regardless of the cards
    // shown.
    if (line.hand === 'FULL_HOUSE') return {};
    const std = standardCards(line);
    const counts = new Map<Rank, number>();
    for (const c of std) {
      const inc = c.supercharge === 'double' ? 2 : 1;
      counts.set(c.rank, (counts.get(c.rank) ?? 0) + inc);
    }
    // Any standard card whose rank only appears once is treated as
    // a kicker candidate. If at least one of them is J / Q / K / A
    // the card fires.
    const hasHighKicker = std.some(
      c => (counts.get(c.rank) ?? 0) === 1 && HIGH_KICKER_RANKS.has(c.rank)
    );
    return hasHighKicker ? { multiplier: card.multValue ?? 1.5 } : {};
  },
};

// Crossroads — was "Spiral Core". The id stays on the legacy tag so
// LINE_LOCATION_IDS, daily-play snapshots, and any in-flight saved
// states keep matching; the player-facing display copy is the only
// thing that's changed.
const crossroads: BonusCard = {
  id: 'spiral-core-x1_5',
  name: 'Crossroads ×1.5 (each)',
  title: 'Crossroads',
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

// Each of the four grid edges as a 5-slot index list. Corner slots
// intentionally appear in two edges — a corner card contributes to BOTH
// the row edge and the column edge it sits on, so per-edge bonus cards
// (Clean Border, Monochrome Border) can double-count them.
const BORDER_EDGES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],        // top row (R1)
  [20, 21, 22, 23, 24],   // bottom row (R5)
  [0, 5, 10, 15, 20],     // left column (C1)
  [4, 9, 14, 19, 24],     // right column (C5)
];

const cleanBorder: BonusCard = {
  id: 'clean-border-x1_5',
  name: 'Clean Border ×1.15 (each)',
  title: 'Clean Border',
  mult: '×1.15 (each)',
  description:
    'Each grid edge (top / bottom / left / right) that is fully filled and contains no face cards. Stacks up to ×1.15⁴.',
  multValue: 1.15,
  baseMultValue: 1.15,
  gridEffect: ({ grid }, card) => {
    const m = card.multValue ?? 1.15;
    let mult = 1;
    for (const edge of BORDER_EDGES) {
      // Edge must be fully filled — partials don't count.
      if (edge.some(i => grid[i] === null)) continue;
      const hasFace = edge.some(i => {
        const c = grid[i];
        return c !== null && isFace(c);
      });
      if (!hasFace) mult *= m;
    }
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

const monochromeBorder: BonusCard = {
  id: 'monochrome-border-x1_75',
  name: 'Monochrome Border ×1.1 (each)',
  title: 'Monochrome Border',
  mult: '×1.1 (each)',
  description:
    'Each grid edge (top / bottom / left / right) that is fully filled with cards of the same color (red or black). Stacks up to ×1.1⁴.',
  multValue: 1.1,
  baseMultValue: 1.1,
  gridEffect: ({ grid }, card) => {
    const m = card.multValue ?? 1.1;
    let mult = 1;
    for (const edge of BORDER_EDGES) {
      // Edge must be fully filled — partials don't count.
      if (edge.some(i => grid[i] === null)) continue;
      // Wilds and jokers are suit-flexible: they don't conflict with
      // either color. Pull them out, then check that every remaining
      // non-flex card on the edge shares a color.
      const cards = edge
        .map(i => grid[i])
        .filter(
          (c): c is Exclude<Card, { kind: 'joker' }> =>
            c !== null && !isJoker(c) && c.supercharge !== 'wild'
        );
      if (cards.length === 0) continue;
      const allRed = cards.every(c => c.suit === 'H' || c.suit === 'D');
      const allBlack = cards.every(c => c.suit === 'S' || c.suit === 'C');
      if (allRed || allBlack) mult *= m;
    }
    return mult > 1 ? { totalMultiplier: mult } : {};
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
    // they can fill whichever suit is missing. The achievement
    // triggers iff the non-flexible corners have distinct suits
    // among themselves (no duplicates), since the remaining flex
    // cards can always be assigned the missing suits.
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

// On Easy (2 jokers) Cozy Joker can multi-trigger — each joker in the
// inner 3×3 raises the multiplier by its base value, exponentially.
// In 1-joker decks the math collapses to a single trigger (×1.15).
const cozyJoker: BonusCard = {
  id: 'cozy-joker-x1_15',
  name: 'Cozy Joker ×1.15 (each)',
  title: 'Cozy Joker',
  mult: '×1.15 (each)',
  description: 'Each joker placed in the inner 3×3.',
  multValue: 1.15,
  baseMultValue: 1.15,
  gridEffect: ({ grid }, card) => {
    const innerJokers = INNER_SLOTS.reduce(
      (n, i) => n + ((grid[i] !== null && isJoker(grid[i]!)) ? 1 : 0),
      0
    );
    const base = card.multValue ?? 1.15;
    return innerJokers > 0
      ? { totalMultiplier: Math.pow(base, innerJokers) }
      : {};
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

// Balance — every line scores Pair or better. Incomplete or HIGH_CARD
// lines block the achievement.
const balance: BonusCard = {
  id: 'balance-x1_25',
  name: 'Balance ×1.25',
  title: 'Balance',
  mult: '×1.25',
  description: 'Every line scores Pair or better.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ lines }, card) => {
    const everyLineScores = lines.every(
      l => l.hand !== null && l.hand !== 'HIGH_CARD'
    );
    return everyLineScores ? { totalMultiplier: card.multValue ?? 1.25 } : {};
  },
};

// Diversity — at least 6 distinct scoring hand types appear across
// the 10 lines. There are exactly 10 scoring hand types in the game
// (PAIR through ROYAL_FLUSH), so this is "more than half the catalog
// in one grid".
const SCORING_HAND_TYPES = new Set<HandRank>([
  'PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
  'FIVE_OF_A_KIND',
  'ROYAL_FLUSH',
]);

const diversity: BonusCard = {
  id: 'diversity-x1_25',
  name: 'Diversity ×1.25',
  title: 'Diversity',
  mult: '×1.25',
  description: 'Board contains 6+ distinct scoring hand types.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ lines }, card) => {
    const seen = new Set<HandRank>();
    for (const l of lines) {
      if (l.hand && SCORING_HAND_TYPES.has(l.hand)) seen.add(l.hand);
    }
    return seen.size >= 6 ? { totalMultiplier: card.multValue ?? 1.25 } : {};
  },
};

// On Easy (2 jokers) Trash Joker multi-triggers — every joker that
// ended up in the discard pile compounds the multiplier. Collapses to
// a single trigger when there's only one joker in the deck.
const trashJoker: BonusCard = {
  id: 'trash-joker-x1_25',
  name: 'Trash Joker ×1.25 (each)',
  title: 'Trash Joker',
  mult: '×1.25 (each)',
  description: 'Each joker destroyed during the run.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ discards }, card) => {
    const jokersOut = discards.filter(c => isJoker(c)).length;
    const base = card.multValue ?? 1.25;
    return jokersOut > 0
      ? { totalMultiplier: Math.pow(base, jokersOut) }
      : {};
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
  id: 'symmetric-frame-x1_25',
  name: 'Symmetric Frame ×1.25 (each)',
  title: 'Symmetric Frame',
  mult: '×1.25 (each)',
  description: 'R1/R5 or C1/C5 sharing a hand type. The line must be full to count.',
  multValue: 1.25,
  baseMultValue: 1.25,
  gridEffect: ({ lines }, card) => {
    const m = card.multValue ?? 1.25;
    const handAt = (kind: 'row' | 'col', idx: number): HandRank | null =>
      lines.find(l => l.kind === kind && l.index === idx)?.hand ?? null;
    // Both lines must be fully scored (hand !== null means the row/column
    // had all 5 slots filled at game end) and share the same hand rank.
    // High Card now qualifies — the line must be FULL, but the rank can
    // be anything from High Card up.
    const matches = (a: HandRank | null, b: HandRank | null): boolean =>
      a !== null && a === b;
    let mult = 1;
    if (matches(handAt('row', 0), handAt('row', 4))) mult *= m;
    if (matches(handAt('col', 0), handAt('col', 4))) mult *= m;
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

// Patience cancels the -25 incomplete-line penalty (negatesIncompletePenalty
// flag, read directly by scoreGrid). The multValue tracks the NET points
// added per incomplete row/column on top of that cancellation — 0 at base
// (just the cancel), +5 at power 1, +10 at power 2, etc. The gridEffect
// turns that into a totalFlatAdd at scoring time. powerUpBonusCard
// special-cases this card so each Targets-Up upgrade bumps multValue by
// 5 additively rather than multiplying by 1.2 — the +5 / +10 steps
// don't compose cleanly with the usual ×1.2 factor.
const patience: BonusCard = {
  id: 'patience-no-penalty',
  name: 'Patience',
  title: 'Patience',
  mult: '(no penalty)',
  description: 'Removes the -25 penalty for incomplete rows or columns at game end.',
  multValue: 0,
  baseMultValue: 0,
  negatesIncompletePenalty: true,
  gridEffect: ({ lines }, card) => {
    const bonus = card.multValue ?? 0;
    if (bonus === 0) return {};
    // A line with `hand: null` is incomplete (fewer than 5 cards) per
    // evaluateLine — that's the same set scoreGrid would have penalized.
    const incompleteCount = lines.filter(l => l.hand === null).length;
    return incompleteCount > 0
      ? { totalFlatAdd: bonus * incompleteCount }
      : {};
  },
};

// Perk-volume tells: how many suit perks did you spend across the run?
// (Counts the ♥/♠/♦/♣ used to trigger a Hop / Slide / Destroy / Bonus.
//  Plain Discards and destroyed targets DON'T count here — only perks.)
const burnout: BonusCard = {
  // ID kept on the old "x1_25" tag so saves with the card in hand still
  // resolve to this definition — the multiplier in the title is just
  // display text.
  id: 'burnout-x1_25',
  name: 'Burnout ×1.5',
  title: 'Burnout',
  mult: '×1.5',
  description: '20+ suit perks spent across the run.',
  multValue: 1.5,
  baseMultValue: 1.5,
  gridEffect: ({ perkSpent }, card) =>
    perkSpent.length >= 20 ? { totalMultiplier: card.multValue ?? 1.5 } : {},
};

const frugal: BonusCard = {
  id: 'frugal-x1_5',
  name: 'Frugal ×1.5',
  title: 'Frugal',
  mult: '×1.5',
  description: '14 or fewer suit perks spent across the run.',
  multValue: 1.5,
  baseMultValue: 1.5,
  gridEffect: ({ perkSpent }, card) =>
    perkSpent.length <= 14 ? { totalMultiplier: card.multValue ?? 1.5 } : {},
};

// Spotlight enforces an exclusivity rule on the bonus hand: it can't
// share the hand with any other bonus card. The hand-mutation
// helpers in state.ts call enforceSpotlight() whenever a bonus card
// is added (keep / replace / starter), so this card never actually
// reaches scoring time alongside other bonus cards. The grid effect
// is therefore an unconditional multiplier — if it's still in hand
// at game end, it earned it.
export const SPOTLIGHT_ID = 'spotlight-x1_5';

const spotlight: BonusCard = {
  id: SPOTLIGHT_ID,
  name: 'Spotlight ×1.5',
  title: 'Spotlight',
  mult: '×1.5',
  description:
    '×1.5 at game end. Discards your other bonus cards when picked up; discards itself if you later take another bonus card.',
  multValue: 1.5,
  baseMultValue: 1.5,
  gridEffect: (_snap, card) => ({ totalMultiplier: card.multValue ?? 1.5 }),
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

  // Rows + Cols (12) — five row boosts, five col boosts, plus
  // Crossroads (center row + col) and Outer Edge (R1/R5/C1/C5) which
  // target specific lines without conditional logic on the cards in
  // them.
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
  crossroads,
  outerEdge,

  // Suit-density (4)
  suitDensity('H'),
  suitDensity('S'),
  suitDensity('D'),
  suitDensity('C'),

  // Per-line conditional (8) — fire on lines whose CARDS meet a rule
  rainbowLine,
  jokerLine,
  royalTouch,
  highball,
  lowball,
  blackjack,
  lowhand,
  highKicker,

  // Grid-wide (14)
  cleanBorder,
  monochromeBorder,
  rainbowCorners,
  cozyJoker,
  deckBank,
  noFlushes,
  noStraights,
  balance,
  diversity,
  trashJoker,
  diagonalRun,
  symmetricFrame,
  burnout,
  frugal,
  spotlight,
  patience,
];

export const BONUS_HAND_LIMIT = 3;

// ---------- Effect aggregation ----------

export const applyLineEffects = (
  line: LineContext,
  cards: readonly BonusCard[],
  allLines?: readonly LineContext[]
): { multiplier: number; flat: number } => {
  let mult = 1;
  let flat = 0;
  for (const bc of cards) {
    if (!bc.lineEffect) continue;
    const e = bc.lineEffect(line, bc, allLines);
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
  cards: readonly BonusCard[],
  allLines?: readonly LineContext[]
): LineContributor[] => {
  const out: LineContributor[] = [];
  for (const bc of cards) {
    if (!bc.lineEffect) continue;
    const e = bc.lineEffect(line, bc, allLines);
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
  // Patience tracks NET points added per blank line (0 base, +5 each
  // upgrade). It can't ride the standard ×1.2 ramp because +5 / +10
  // steps don't compose cleanly with multiplication — additive +5 per
  // power-up keeps the math exact and matches the design intent.
  const isPatience = card.id.startsWith('patience-');
  const newMultValue = isPatience
    ? card.multValue + 5
    : roundTenth(card.multValue * factor);
  const newPowerLevel = (card.powerLevel ?? 0) + 1;
  // Patience's chip text doesn't have a "×N" segment to rewrite —
  // generate fresh copy that reflects the net bonus per blank line.
  // Every other card has a "×N" pattern in both `mult` and `name`.
  const newMultText = isPatience
    ? `(+${newMultValue} each)`
    : card.mult.replace(/×[\d.]+/, `×${newMultValue}`);
  const newName = isPatience
    ? `Patience +${newMultValue}`
    : card.name.replace(/×[\d.]+/, `×${newMultValue}`);
  const newDescription = isPatience
    ? `Removes the -25 penalty AND adds +${newMultValue} for each incomplete row or column at game end.`
    : card.description;
  // Strip any existing -pwrN suffix so repeated power-ups don't stack
  // "-pwr1-pwr2-pwr3" tails — replace with a single counter.
  const baseId = card.id.replace(/-pwr\d+$/, '');
  return {
    ...card,
    id: `${baseId}-pwr${newPowerLevel}`,
    name: newName,
    mult: newMultText,
    description: newDescription,
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
  // outer-edge position (Outer Edge, Crossroads, Row N, Col N) are
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

// Re-attach lineEffect / gridEffect / negatesIncompletePenalty after a
// JSON.parse roundtrip. The effect *functions* are stripped by
// JSON.stringify, so re-running scoring against a raw-parsed card
// returns 0 contributions for every bonus chip — that's the
// "bonus cards show a dash" bug on re-entered daily plays. The
// canonical card is looked up by base id in BONUS_DECK_POOL or
// SPECIAL_DECK_POOL, and power-ups are re-applied to match the
// saved powerLevel. Placeholders and unknown ids fall through
// unchanged so rendering doesn't crash.
//
// Runtime-mutable fields (`used` for one-time specials) are copied
// over the rehydrated card so a spent Doubler stays spent on reload.
export const hydrateBonusCard = (raw: BonusCard): BonusCard => {
  // Placeholders carry no logic in the first place — return as-is.
  if (raw.placeholderKind) return raw;

  const baseId = raw.id.replace(/-pwr\d+$/, '');
  const fromPool =
    BONUS_DECK_POOL.find(p => p.id === baseId) ??
    SPECIAL_DECK_POOL.find(p => p.id === baseId);
  if (!fromPool) {
    // Unknown id — nothing to rehydrate against. The chip still
    // renders from its display fields; scoring just won't see it.
    return raw;
  }

  let card = fromPool;
  const powerLevel = raw.powerLevel ?? 0;
  for (let i = 0; i < powerLevel; i++) {
    card = powerUpBonusCard(card);
  }

  // Preserve runtime-mutable state from the saved card.
  if (raw.used !== undefined) {
    card = { ...card, used: raw.used };
  }
  return card;
};

export const hydrateBonusCards = (cards: BonusCard[]): BonusCard[] =>
  cards.map(hydrateBonusCard);
