import { Card, isJoker, Suit } from './cards';
import {
  BORDER_SLOTS,
  CORNER_SLOTS,
  Grid,
  INNER_SLOTS,
  LineKind,
} from './grid';
import { HandRank } from './hands';

export interface LineContext {
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
  hand: HandRank | null;
}

export interface LineEffect {
  // Boosts compose additively per line: multiplier = 1 + Σ boosts.
  multiplierBoost?: number;
  // Flats add to the per-line total after the multiplier.
  flatAdd?: number;
}

export interface GridSnapshot {
  grid: Grid;
}

export interface GridEffect {
  // Additive contribution to the final-total multiplier (1 + Σ boosts).
  totalMultiplierBoost?: number;
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

const handBoost = (hand: HandRank, boost: number): BonusCard => {
  const mult = (1 + boost).toString().replace(/\.0$/, '');
  return {
    id: `hand-${hand.toLowerCase()}-x${mult}`,
    name: `${HAND_NAME[hand]} ×${mult}`,
    description: `Each line that scores ${HAND_NAME[hand]} is multiplied by ${mult}.`,
    lineEffect: line => (line.hand === hand ? { multiplierBoost: boost } : {}),
  };
};

const rowBoost = (rowIdx: number, boost: number): BonusCard => {
  const mult = (1 + boost).toString().replace(/\.0$/, '');
  return {
    id: `row-${rowIdx + 1}-x${mult}`,
    name: `Row ${rowIdx + 1} ×${mult}`,
    description: `Row ${rowIdx + 1}'s score is multiplied by ${mult}.`,
    lineEffect: line =>
      line.kind === 'row' && line.index === rowIdx && line.hand
        ? { multiplierBoost: boost }
        : {},
  };
};

const colBoost = (colIdx: number, boost: number): BonusCard => {
  const mult = (1 + boost).toString().replace(/\.0$/, '');
  return {
    id: `col-${colIdx + 1}-x${mult}`,
    name: `Col ${colIdx + 1} ×${mult}`,
    description: `Column ${colIdx + 1}'s score is multiplied by ${mult}.`,
    lineEffect: line =>
      line.kind === 'col' && line.index === colIdx && line.hand
        ? { multiplierBoost: boost }
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
    return n > 0 ? { multiplierBoost: Math.pow(1.1, n) - 1 } : {};
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
    return suits.size >= 4 ? { multiplierBoost: 1.0 } : {};
  },
};

const jokerLine: BonusCard = {
  id: 'joker-line-x2',
  name: 'Joker line ×2',
  description: 'The joker\'s row and column each score ×2.',
  lineEffect: line => {
    if (!line.hand) return {};
    const hasJoker = line.cards.some(c => c !== null && isJoker(c));
    return hasJoker ? { multiplierBoost: 1.0 } : {};
  },
};

const royalTouch: BonusCard = {
  id: 'royal-touch-x1_5',
  name: 'Royal touch ×1.5',
  description: 'Lines that contain an Ace score ×1.5.',
  lineEffect: line => {
    if (!line.hand) return {};
    const hasAce = standardCards(line).some(c => c.rank === 'A');
    return hasAce ? { multiplierBoost: 0.5 } : {};
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
    return onCore ? { multiplierBoost: 0.5 } : {};
  },
};

// ---------- Grid-level achievements ----------

const isFace = (c: Card): boolean =>
  !isJoker(c) && (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K');

const cleanBorder: BonusCard = {
  id: 'clean-border-x1_2',
  name: 'Clean border ×1.2',
  description: 'No face cards on the 16 border slots: final score ×1.2.',
  gridEffect: ({ grid }) => {
    const anyFace = BORDER_SLOTS.some(i => {
      const c = grid[i];
      return c !== null && isFace(c);
    });
    return anyFace ? {} : { totalMultiplierBoost: 0.2 };
  },
};

const monochromeBorder: BonusCard = {
  id: 'monochrome-border-x1_25',
  name: 'Monochrome border ×1.25',
  description: 'All border cards share a color (all red or all black): final score ×1.25.',
  gridEffect: ({ grid }) => {
    const cards = BORDER_SLOTS.map(i => grid[i]).filter((c): c is Card => c !== null && !isJoker(c));
    if (cards.length === 0) return {};
    const isRed = (c: Card) => !isJoker(c) && (c.suit === 'H' || c.suit === 'D');
    const allRed = cards.every(isRed);
    const allBlack = cards.every(c => !isRed(c));
    return allRed || allBlack ? { totalMultiplierBoost: 0.25 } : {};
  },
};

const rainbowCorners: BonusCard = {
  id: 'rainbow-corners-x1_2',
  name: 'Rainbow corners ×1.2',
  description: 'The 4 corner slots are 4 distinct suits: final score ×1.2.',
  gridEffect: ({ grid }) => {
    const cards = CORNER_SLOTS.map(i => grid[i]);
    if (cards.some(c => !c || isJoker(c))) return {};
    const suits = new Set(cards.map(c => (c as any).suit as Suit));
    return suits.size === 4 ? { totalMultiplierBoost: 0.2 } : {};
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
    return inInner ? { totalMultiplierBoost: 0.15 } : {};
  },
};

// ---------- The 30-card pool ----------

export const BONUS_DECK_POOL: BonusCard[] = [
  // Hand-type (8)
  handBoost('PAIR', 3.0),
  handBoost('TWO_PAIR', 2.0),
  handBoost('THREE_OF_A_KIND', 2.0),
  handBoost('STRAIGHT', 1.0),
  handBoost('FLUSH', 1.0),
  handBoost('FULL_HOUSE', 1.0),
  handBoost('FOUR_OF_A_KIND', 1.0),
  handBoost('FIVE_OF_A_KIND', 1.0),

  // Rows + Cols (10)
  rowBoost(0, 1.0),
  rowBoost(1, 1.0),
  rowBoost(2, 1.0),
  rowBoost(3, 1.0),
  rowBoost(4, 1.0),
  colBoost(0, 1.0),
  colBoost(1, 1.0),
  colBoost(2, 1.0),
  colBoost(3, 1.0),
  colBoost(4, 1.0),

  // Suit-density (4)
  suitDensity('H'),
  suitDensity('S'),
  suitDensity('D'),
  suitDensity('C'),

  // Novel per-line (4)
  rainbowLine,
  jokerLine,
  royalTouch,
  spiralCore,

  // Grid-level (4)
  cleanBorder,
  monochromeBorder,
  rainbowCorners,
  cozyJoker,
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
    if (e.multiplierBoost) mult += e.multiplierBoost;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier: mult, flat };
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
    if (e.totalMultiplierBoost) mult += e.totalMultiplierBoost;
    if (e.totalFlatAdd) flat += e.totalFlatAdd;
  }
  return { multiplier: mult, flat };
};

// ---------- Universal-effect detection (for scoring reference) ----------

const PROBE_CARDS_A: Card[] = [
  { kind: 'standard', rank: '2', suit: 'C' },
  { kind: 'standard', rank: '5', suit: 'D' },
  { kind: 'standard', rank: '8', suit: 'S' },
  { kind: 'standard', rank: 'J', suit: 'C' },
  { kind: 'standard', rank: 'K', suit: 'D' },
];
const PROBE_CARDS_B: Card[] = [
  { kind: 'standard', rank: '3', suit: 'S' },
  { kind: 'standard', rank: '7', suit: 'C' },
  { kind: 'standard', rank: '9', suit: 'D' },
  { kind: 'standard', rank: '10', suit: 'S' },
  { kind: 'standard', rank: 'Q', suit: 'C' },
];

export const universalEffectFor = (
  bc: BonusCard,
  hand: HandRank
): LineEffect | null => {
  if (!bc.lineEffect) return null;
  const variants: LineContext[] = [
    { kind: 'row', index: 0, cards: PROBE_CARDS_A, hand },
    { kind: 'row', index: 4, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 0, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 4, cards: PROBE_CARDS_A, hand },
  ];
  const sig = (e: LineEffect) => `${e.multiplierBoost ?? 0}|${e.flatAdd ?? 0}`;
  const results = variants.map(v => bc.lineEffect!(v));
  const first = sig(results[0]);
  if (!results.every(r => sig(r) === first)) return null;
  const e = results[0];
  if (!e.multiplierBoost && !e.flatAdd) return null;
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
    if (e.multiplierBoost) multiplier += e.multiplierBoost;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier, flat };
};
