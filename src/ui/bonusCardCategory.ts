import { BonusCard } from '../game/bonusCards';
import { Suit } from '../game/cards';
import { colors } from './theme';

// Each bonus card belongs to one of five categories based on its id prefix.
// Two visual signals are derived from the category:
//
//   - A "tone" (yellow or purple) that drives the chip's border,
//     title-text, and glow color. Yellow = pays out DURING the run
//     (hand-type, row/col, suit density, per-line conditional). Purple
//     = pays out at GAME END (grid achievements). This is the always-on
//     signal that tells the player when to expect the math to fire.
//
//   - A category glyph that's shown ONLY when the colorBlindAssist setting
//     is on, so colorblind players have a non-color cue and everyone else
//     gets a cleaner chip. Suit-density cards override the generic icon
//     with the actual suit glyph (♥/♠/♦/♣) in its native suit color.

export type BonusCategory = 'hand' | 'line' | 'suit' | 'conditional' | 'grid';

// Cards in the "Row / Column bonus" category that aren't row-N / col-N —
// they target specific lines by LOCATION rather than by conditional on the
// cards in them, so they group with the row/col boosts.
const LINE_LOCATION_IDS = new Set([
  'spiral-core-x1_5',
  'outer-edge-x1_25',
]);

const CONDITIONAL_IDS = new Set([
  'rainbow-line-x2',
  'joker-line-x1_5',
  'royal-touch-x1_5',
  'highball-x1_5',
  'lowball-x1_5',
  'blackjack-x2',
]);

export const categoryOf = (card: BonusCard): BonusCategory => {
  if (card.id.startsWith('hand-')) return 'hand';
  if (card.id.startsWith('row-') || card.id.startsWith('col-')) return 'line';
  if (LINE_LOCATION_IDS.has(card.id)) return 'line';
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

// In-game icons all share the warn tint; only grid achievements use the
// joker tint. Suit-density overrides this with the actual suit's color
// so colorblind players can still tell the four density cards apart.
const CATEGORY_ICON_COLOR: Record<BonusCategory, string> = {
  hand: colors.warn,
  line: colors.warn,
  suit: colors.warn,
  conditional: colors.warn,
  grid: colors.joker,
};

export const CATEGORY_LABEL: Record<BonusCategory, string> = {
  hand: 'Hand-type bonus',
  line: 'Row / Column bonus',
  suit: 'Per-suit density',
  conditional: 'Per-line conditional',
  grid: 'Grid achievement',
};

// Two tones: yellow = pays out during the run, purple = pays out at
// game end. Every in-game category shares yellow; only grid-achievement
// uses purple. Players read "what color is the chip?" → "when does it
// fire?" without needing to memorize each card.
type CategoryTone = 'yellow' | 'purple';

const TONE_OF: Record<BonusCategory, CategoryTone> = {
  hand: 'yellow',
  suit: 'yellow',
  conditional: 'yellow',
  line: 'yellow',
  grid: 'purple',
};

const TONE_COLOR: Record<CategoryTone, string> = {
  yellow: colors.warn,
  purple: colors.joker,
};

const withAlpha = (hex: string, alpha: number): string => {
  // Expect #rrggbb. Convert to rgba(...) so it composes with Animated styles.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export interface CategoryStyle {
  // Colorblind-assist glyph and its color. Callers should only render the
  // icon when settings.colorBlindAssist is on.
  icon: string;
  iconColor: string;
  // Always-on signals: chip / sheet border, title text, glow.
  borderColor: string;
  titleColor: string;
  // rgba(...) string for the fired-flash overlay on the in-game chip.
  flashColor: string;
  label: string;
}

export const styleFor = (card: BonusCard): CategoryStyle => {
  const cat = categoryOf(card);
  const suit = suitOf(card);
  const tone = TONE_OF[cat];
  const toneColor = TONE_COLOR[tone];
  return {
    icon: suit ? SUIT_GLYPH[suit] : CATEGORY_ICON[cat],
    iconColor: suit ? SUIT_COLOR[suit] : CATEGORY_ICON_COLOR[cat],
    borderColor: toneColor,
    titleColor: toneColor,
    flashColor: withAlpha(toneColor, 0.55),
    label: CATEGORY_LABEL[cat],
  };
};
