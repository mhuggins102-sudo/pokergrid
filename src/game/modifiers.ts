import { Card, isJoker, Suit } from './cards';
import { LineKind } from './grid';
import { HandRank } from './hands';

export interface LineContext {
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
  hand: HandRank | null;
}

export interface ModifierEffect {
  multiplierBoost?: number; // additive: 0.5 means multiplier += 0.5
  flatAdd?: number;
}

export interface Modifier {
  id: string;
  label: string;
  description: string;
  effect: (line: LineContext) => ModifierEffect;
}

// A line's effective suit is the suit shared by all non-joker cards in it (joker
// is wild). Returns null if no consistent suit exists.
export const lineSuit = (line: LineContext): Suit | null => {
  const standards = line.cards.filter(c => c !== null && !isJoker(c)) as Exclude<Card, { kind: 'joker' }>[];
  if (standards.length === 0) return null;
  const s = standards[0].suit;
  return standards.every(c => c.suit === s) ? s : null;
};

export const applyModifiers = (
  line: LineContext,
  modifiers: readonly Modifier[]
): { multiplier: number; flat: number } => {
  let mult = 1;
  let flat = 0;
  for (const m of modifiers) {
    const e = m.effect(line);
    if (e.multiplierBoost) mult += e.multiplierBoost;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier: mult, flat };
};

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', S: '♠', C: '♣', D: '♦' };

const suitBonus = (suit: Suit): Modifier => ({
  id: `${suit.toLowerCase()}-1_5x`,
  label: `${SUIT_GLYPH[suit]} Bonus`,
  description: `${SUIT_GLYPH[suit]} hands ×1.5`,
  effect: line => (lineSuit(line) === suit && line.hand ? { multiplierBoost: 0.5 } : {}),
});

export const STARTER_MODIFIERS: Modifier[] = [
  suitBonus('H'),
  suitBonus('S'),
  suitBonus('C'),
  suitBonus('D'),
  {
    id: 'pair-2x',
    label: 'Pair Power',
    description: 'Pair ×2',
    effect: line => (line.hand === 'PAIR' ? { multiplierBoost: 1.0 } : {}),
  },
  {
    id: 'straight-plus-50',
    label: 'Straight Bonus',
    description: 'Straight +50',
    effect: line => (line.hand === 'STRAIGHT' ? { flatAdd: 50 } : {}),
  },
  {
    id: 'flush-plus-40',
    label: 'Flush Bonus',
    description: 'Flush +40',
    effect: line => (line.hand === 'FLUSH' ? { flatAdd: 40 } : {}),
  },
  {
    id: 'row-3-2x',
    label: 'Row 3 Double',
    description: 'Row 3 ×2',
    effect: line =>
      line.kind === 'row' && line.index === 2 && line.hand ? { multiplierBoost: 1.0 } : {},
  },
  {
    id: 'col-3-2x',
    label: 'Column 3 Double',
    description: 'Col 3 ×2',
    effect: line =>
      line.kind === 'col' && line.index === 2 && line.hand ? { multiplierBoost: 1.0 } : {},
  },
  {
    id: 'five-of-a-kind-plus-100',
    label: 'Joker Magic',
    description: '5 of a Kind +100',
    effect: line => (line.hand === 'FIVE_OF_A_KIND' ? { flatAdd: 100 } : {}),
  },
];

export const drawRandomModifiers = (
  count: number,
  rng: () => number = Math.random
): Modifier[] => {
  const pool = [...STARTER_MODIFIERS];
  const picks: Modifier[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
};

// Detect modifiers whose effect depends only on `line.hand` so the scoring
// reference can apply them universally. Probes the effect across several
// varied positions and card compositions; if the result is consistent and
// non-empty, the modifier is universal for that hand. Position-conditional
// modifiers (e.g. "Row 3 2×") and card-conditional ones (e.g. "♥ hands 1.5×")
// return null and are intentionally excluded from the reference table.
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
  m: Modifier,
  hand: HandRank
): ModifierEffect | null => {
  const variants: LineContext[] = [
    { kind: 'row', index: 0, cards: PROBE_CARDS_A, hand },
    { kind: 'row', index: 4, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 0, cards: PROBE_CARDS_B, hand },
    { kind: 'col', index: 4, cards: PROBE_CARDS_A, hand },
  ];
  const sig = (e: ModifierEffect) =>
    `${e.multiplierBoost ?? 0}|${e.flatAdd ?? 0}`;
  const results = variants.map(v => m.effect(v));
  const first = sig(results[0]);
  if (!results.every(r => sig(r) === first)) return null;
  const e = results[0];
  if (!e.multiplierBoost && !e.flatAdd) return null;
  return e;
};

export const universalEffectSum = (
  modifiers: readonly Modifier[],
  hand: HandRank
): { multiplier: number; flat: number } => {
  let multiplier = 1;
  let flat = 0;
  for (const m of modifiers) {
    const e = universalEffectFor(m, hand);
    if (!e) continue;
    if (e.multiplierBoost) multiplier += e.multiplierBoost;
    if (e.flatAdd) flat += e.flatAdd;
  }
  return { multiplier, flat };
};
