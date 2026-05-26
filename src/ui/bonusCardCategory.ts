import { BonusCard } from '../game/bonusCards';
import { Suit } from '../game/cards';
import { colors } from './theme';

// Each bonus card belongs to one of five categories based on its id prefix.
// This metadata is the single source of truth used by the in-game strip,
// the detail modal, and the How-to-Play catalog so the three displays look
// like the same card system rather than three separate UIs.

export type BonusCategory = 'hand' | 'line' | 'suit' | 'conditional' | 'grid';

const CONDITIONAL_IDS = new Set([
  'outer-edge-x1_25',
  'rainbow-line-x2',
  'joker-line-x1_5',
  'royal-touch-x1_5',
  'spiral-core-x1_5',
]);

export const categoryOf = (card: BonusCard): BonusCategory => {
  if (card.id.startsWith('hand-')) return 'hand';
  if (card.id.startsWith('row-') || card.id.startsWith('col-')) return 'line';
  if (card.id.startsWith('suit-density-')) return 'suit';
  if (CONDITIONAL_IDS.has(card.id)) return 'conditional';
  return 'grid';
};

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', S: '♠', D: '♦', C: '♣' };

const SUIT_COLOR: Record<Suit, string> = {
  H: colors.suitH,
  S: colors.suitS,
  D: colors.suitD,
  C: colors.suitC,
};

// Suit-density cards override the generic category icon and color with the
// actual suit they track. e.g. the ♥-density card gets a magenta ♥ glyph.
const suitOf = (card: BonusCard): Suit | null => {
  if (!card.id.startsWith('suit-density-')) return null;
  const tail = card.id.slice('suit-density-'.length).toUpperCase();
  return ['H', 'S', 'D', 'C'].includes(tail) ? (tail as Suit) : null;
};

const CATEGORY_ICON: Record<BonusCategory, string> = {
  hand: '≡',      // hand type — stack of three lines = a poker hand
  line: '⊞',      // row / column — grid axis
  suit: '◆',      // suit density — overridden below per actual suit
  conditional: '✦', // per-line conditional — spark
  grid: '▦',      // grid achievement — full-board pattern
};

const CATEGORY_COLOR: Record<BonusCategory, string> = {
  hand: colors.warn,        // amber — the historical "bonus card" color
  line: colors.accent,      // cyan
  suit: colors.textMid,     // overridden below
  conditional: colors.suitD, // gold
  grid: colors.joker,       // violet
};

export const CATEGORY_LABEL: Record<BonusCategory, string> = {
  hand: 'Hand-type bonus',
  line: 'Row / Column bonus',
  suit: 'Per-suit density',
  conditional: 'Per-line conditional',
  grid: 'Grid achievement',
};

export interface CategoryStyle {
  icon: string;
  color: string;
  label: string;
}

export const styleFor = (card: BonusCard): CategoryStyle => {
  const cat = categoryOf(card);
  const suit = suitOf(card);
  if (suit) {
    return {
      icon: SUIT_GLYPH[suit],
      color: SUIT_COLOR[suit],
      label: CATEGORY_LABEL.suit,
    };
  }
  return {
    icon: CATEGORY_ICON[cat],
    color: CATEGORY_COLOR[cat],
    label: CATEGORY_LABEL[cat],
  };
};
