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
  // Per-line effect — called once per scored line.
  lineEffect?: (line: LineContext) => LineEffect;
  // Grid-level effect — called once when computing the final total.
  gridEffect?: (snap: GridSnapshot) => GridEffect;
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
  return {
    id: `hand-${hand.toLowerCase()}-x${m}`,
    name: `${HAND_NAME[hand]} ×${m}`,
    description: `Each line that scores ${HAND_NAME[hand]} is multiplied by ${m}.`,
    lineEffect: line => (line.hand === hand ? { multiplier } : {}),
  };
};

const rowBoost = (rowIdx: number, multiplier: number): BonusCard => {
  const m = multiplier.toString().replace(/\.0$/, '');
  return {
    id: `row-${rowIdx + 1}-x${m}`,
    name: `Row ${rowIdx + 1} ×${m}`,
    description: `Row ${rowIdx + 1}'s score is multiplied by ${m}.`,
    lineEffect: line =>
      line.kind === 'row' && line.index === rowIdx && line.hand
        ? { multiplier }
        : {},
  };
};

const colBoost = (colIdx: number, multiplier: number): BonusCard => {
  const m = multiplier.toString().replace(/\.0$/, '');
  return {
    id: `col-${colIdx + 1}-x${m}`,
    name: `Col ${colIdx + 1} ×${m}`,
    description: `Column ${colIdx + 1}'s score is multiplied by ${m}.`,
    lineEffect: line =>
      line.kind === 'col' && line.index === colIdx && line.hand
        ? { multiplier }
        : {},
  };
};

// Per-suit-in-line: multiplies the line by 1.1 for each card of `suit` in it.
const suitDensity = (suit: Suit): BonusCard => ({
  id: `suit-density-${suit.toLowerCase()}`,
  name: `×1.1 per ${SUIT_GLYPH[suit]}`,
  description: `Each ${SUIT_GLYPH[suit]} in a line multiplies that line by 1.1.`,
  lineEffect: line => {
    if (!line.hand) return {};
    const n = standardCards(line).filter(c => c.suit === suit).length;
    return n > 0 ? { multiplier: Math.pow(1.1, n) } : {};
  },
});

// ---------- Per-line novel ----------

const rainbowLine: BonusCard = {
  id: 'rainbow-line-x2',
  name: 'Rainbow ×2',
  description: 'Lines containing 4+ distinct suits score ×2.',
  lineEffect: line => {
    if (!line.hand) return {};
    const suits = new Set(standardCards(line).map(c => c.suit));
    return suits.size >= 4 ? { multiplier: 2 } : {};
  },
};

const jokerLine: BonusCard = {
  id: 'joker-line-x1_5',
  name: 'Joker line ×1.5',
  description: 'The joker\'s row and column each score ×1.5.',
  lineEffect: line => {
    if (!line.hand) return {};
    const hasJoker = line.cards.some(c => c !== null && isJoker(c));
    return hasJoker ? { multiplier: 1.5 } : {};
  },
};

const outerEdge: BonusCard = {
  id: 'outer-edge-x1_25',
  name: 'Outer Edge ×1.25',
  description: 'Row 1, Row 5, Col 1, and Col 5 each score ×1.25.',
  lineEffect: line => {
    if (!line.hand) return {};
    const onEdge =
      (line.kind === 'row' && (line.index === 0 || line.index === 4)) ||
      (line.kind === 'col' && (line.index === 0 || line.index === 4));
    return onEdge ? { multiplier: 1.25 } : {};
  },
};

const royalTouch: BonusCard = {
  id: 'royal-touch-x1_5',
  name: 'Royal touch ×1.5',
  description: 'Lines that contain an Ace score ×1.5.',
  lineEffect: line => {
    if (!line.hand) return {};
    const hasAce = standardCards(line).some(c => c.rank === 'A');
    return hasAce ? { multiplier: 1.5 } : {};
  },
};

const spiralCore: BonusCard = {
  id: 'spiral-core-x1_5',
  name: 'Spiral core ×1.5',
  description: 'Row 3 and Col 3 each score ×1.5.',
  lineEffect: line => {
    if (!line.hand) return {};
    const onCore =
      (line.kind === 'row' && line.index === 2) ||
      (line.kind === 'col' && line.index === 2);
    return onCore ? { multiplier: 1.5 } : {};
  },
};

// ---------- Grid-level achievements ----------

const isFace = (c: Card): boolean =>
  !isJoker(c) && (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K');

const cleanBorder: BonusCard = {
  id: 'clean-border-x1_5',
  name: 'Clean border ×1.5',
  description: 'No face cards on the 16 border slots: final score ×1.5.',
  gridEffect: ({ grid }) => {
    const anyFace = BORDER_SLOTS.some(i => {
      const c = grid[i];
      return c !== null && isFace(c);
    });
    return anyFace ? {} : { totalMultiplier: 1.5 };
  },
};

const monochromeBorder: BonusCard = {
  id: 'monochrome-border-x1_5',
  name: 'Monochrome border ×1.5',
  description: 'All border cards share a color (all red or all black): final score ×1.5.',
  gridEffect: ({ grid }) => {
    const cards = BORDER_SLOTS.map(i => grid[i]).filter((c): c is Card => c !== null && !isJoker(c));
    if (cards.length === 0) return {};
    const isRed = (c: Card) => !isJoker(c) && (c.suit === 'H' || c.suit === 'D');
    const allRed = cards.every(isRed);
    const allBlack = cards.every(c => !isRed(c));
    return allRed || allBlack ? { totalMultiplier: 1.5 } : {};
  },
};

const rainbowCorners: BonusCard = {
  id: 'rainbow-corners-x1_25',
  name: 'Rainbow corners ×1.25',
  description: 'The 4 corner slots are 4 distinct suits: final score ×1.25.',
  gridEffect: ({ grid }) => {
    const cards = CORNER_SLOTS.map(i => grid[i]);
    if (cards.some(c => !c || isJoker(c))) return {};
    const suits = new Set(cards.map(c => (c as any).suit as Suit));
    return suits.size === 4 ? { totalMultiplier: 1.25 } : {};
  },
};

const cozyJoker: BonusCard = {
  id: 'cozy-joker-x1_15',
  name: 'Cozy joker ×1.15',
  description: 'Joker placed in the inner 3×3: final score ×1.15.',
  gridEffect: ({ grid }) => {
    const inInner = INNER_SLOTS.some(i => {
      const c = grid[i];
      return c !== null && isJoker(c);
    });
    return inInner ? { totalMultiplier: 1.15 } : {};
  },
};

// Compounds 1.05 per playing card remaining in the deck at game end. Effective
// multiplier is 1.05^deckRemaining, so 10 left ≈ 1.63×, 20 ≈ 2.65×.
const deckBank: BonusCard = {
  id: 'deck-bank-x1_05',
  name: '×1.05 / deck card',
  description: 'Each playing card remaining in the deck at game end multiplies the final score by 1.05.',
  gridEffect: ({ deckRemaining }) => ({
    totalMultiplier: deckRemaining > 0 ? Math.pow(1.05, deckRemaining) : 1,
  }),
};

const noFlushes: BonusCard = {
  id: 'no-flushes-x1_25',
  name: 'No Flushes ×1.25',
  description: 'No line scores Flush, Straight Flush, or Royal Flush: final score ×1.25.',
  gridEffect: ({ lines }) => {
    const anyFlush = lines.some(l =>
      l.hand === 'FLUSH' || l.hand === 'STRAIGHT_FLUSH' || l.hand === 'ROYAL_FLUSH'
    );
    return anyFlush ? {} : { totalMultiplier: 1.25 };
  },
};

const noStraights: BonusCard = {
  id: 'no-straights-x1_25',
  name: 'No Straights ×1.25',
  description: 'No line scores Straight, Straight Flush, or Royal Flush: final score ×1.25.',
  gridEffect: ({ lines }) => {
    const anyStraight = lines.some(l =>
      l.hand === 'STRAIGHT' || l.hand === 'STRAIGHT_FLUSH' || l.hand === 'ROYAL_FLUSH'
    );
    return anyStraight ? {} : { totalMultiplier: 1.25 };
  },
};

const trashJoker: BonusCard = {
  id: 'trash-joker-x1_25',
  name: 'Trash Joker ×1.25',
  description: 'The joker was destroyed during the game: final score ×1.25.',
  gridEffect: ({ discards }) => {
    const jokerOut = discards.some(c => isJoker(c));
    return jokerOut ? { totalMultiplier: 1.25 } : {};
  },
};

// ---- Spatial / pattern bonuses ----------------------------------------------

// Main and anti diagonals each multiply the final total by 1.25 when the 5
// cards on that diagonal form a Straight (including Straight Flush / Royal
// Flush). Both diagonals can trigger simultaneously → 1.25 × 1.25 = 1.5625.
const isStraightLine = (cards: (Card | null)[]): boolean => {
  const h = evaluateLine(cards);
  return h === 'STRAIGHT' || h === 'STRAIGHT_FLUSH' || h === 'ROYAL_FLUSH';
};

const diagonalRun: BonusCard = {
  id: 'diagonal-run-x1_25',
  name: 'Diagonal ×1.25',
  description: 'Each grid diagonal that forms a Straight (or higher) multiplies the final score by 1.25. Both diagonals = ×1.5625.',
  gridEffect: ({ grid }) => {
    const main = [grid[0], grid[6], grid[12], grid[18], grid[24]];
    const anti = [grid[4], grid[8], grid[12], grid[16], grid[20]];
    let mult = 1;
    if (isStraightLine(main)) mult *= 1.25;
    if (isStraightLine(anti)) mult *= 1.25;
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

// Mirror-symmetric scoring: R1 and R5 share a hand type → ×1.2, and again
// C1 and C5 share one → ×1.2. Both at once = ×1.44. High Card is excluded
// since matching "nothing" shouldn't pay out.
const symmetricFrame: BonusCard = {
  id: 'symmetric-frame-x1_2',
  name: 'Symmetric Frame ×1.2',
  description: 'R1 and R5 sharing a hand type multiplies final score ×1.2; C1 and C5 sharing one multiplies it ×1.2 again. High Card doesn\'t count.',
  gridEffect: ({ lines }) => {
    const handAt = (kind: 'row' | 'col', idx: number): HandRank | null =>
      lines.find(l => l.kind === kind && l.index === idx)?.hand ?? null;
    const matches = (a: HandRank | null, b: HandRank | null): boolean =>
      a !== null && a !== 'HIGH_CARD' && a === b;
    let mult = 1;
    if (matches(handAt('row', 0), handAt('row', 4))) mult *= 1.2;
    if (matches(handAt('col', 0), handAt('col', 4))) mult *= 1.2;
    return mult > 1 ? { totalMultiplier: mult } : {};
  },
};

// Perk-volume tells: how many suit perks did you spend across the run?
// (Counts the ♥/♠/♦/♣ used to trigger a Hop / Slide / Destroy / Bonus.
//  Plain Discards and destroyed targets DON'T count here — only perks.)
const burnout: BonusCard = {
  id: 'burnout-x1_3',
  name: 'Burnout ×1.3',
  description: 'Spent 8 or more suit perks across the game: final score ×1.3.',
  gridEffect: ({ perkSpent }) =>
    perkSpent.length >= 8 ? { totalMultiplier: 1.3 } : {},
};

const frugal: BonusCard = {
  id: 'frugal-x1_3',
  name: 'Frugal ×1.3',
  description: 'Spent 4 or fewer suit perks across the game: final score ×1.3.',
  gridEffect: ({ perkSpent }) =>
    perkSpent.length <= 4 ? { totalMultiplier: 1.3 } : {},
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
    const e = bc.lineEffect(line);
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
    const e = bc.lineEffect(line);
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
    const e = bc.gridEffect(snap);
    if (e.totalMultiplier !== undefined && e.totalMultiplier !== 0) mult *= e.totalMultiplier;
    if (e.totalFlatAdd) flat += e.totalFlatAdd;
  }
  return { multiplier: mult, flat };
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
  const results = variants.map(v => bc.lineEffect!(v));
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
