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

const suitBonus = (suit: Suit, label: string): Modifier => ({
  id: `${suit.toLowerCase()}-1_5x`,
  label,
  description: `${suit} hands score 1.5×`,
  effect: line => (lineSuit(line) === suit && line.hand ? { multiplierBoost: 0.5 } : {}),
});

export const STARTER_MODIFIERS: Modifier[] = [
  suitBonus('H', '♥ Bonus'),
  suitBonus('S', '♠ Bonus'),
  suitBonus('C', '♣ Bonus'),
  suitBonus('D', '♦ Bonus'),
  {
    id: 'pair-2x',
    label: 'Pair Power',
    description: 'Pairs score 2× base',
    effect: line => (line.hand === 'PAIR' ? { multiplierBoost: 1.0 } : {}),
  },
  {
    id: 'straight-plus-50',
    label: 'Straight Bonus',
    description: 'Each Straight +50',
    effect: line => (line.hand === 'STRAIGHT' ? { flatAdd: 50 } : {}),
  },
  {
    id: 'flush-plus-40',
    label: 'Flush Bonus',
    description: 'Each Flush +40',
    effect: line => (line.hand === 'FLUSH' ? { flatAdd: 40 } : {}),
  },
  {
    id: 'row-3-2x',
    label: 'Row 3 Double',
    description: 'Row 3 scores 2×',
    effect: line =>
      line.kind === 'row' && line.index === 2 && line.hand ? { multiplierBoost: 1.0 } : {},
  },
  {
    id: 'col-3-2x',
    label: 'Column 3 Double',
    description: 'Column 3 scores 2×',
    effect: line =>
      line.kind === 'col' && line.index === 2 && line.hand ? { multiplierBoost: 1.0 } : {},
  },
  {
    id: 'five-of-a-kind-plus-100',
    label: 'Joker Magic',
    description: 'Five of a Kind +100',
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
