import { Platform } from 'react-native';
import type { Suit } from '../game/cards';

// ============================================================================
// PokerGrid — Neon Arcade theme
//
// Near-black background, cards as glassy panels with a soft per-suit glow,
// monospace digital-style numerals, electric pip colors. The palette is loud
// at the focal points (the drawn card, the next-fill cell, win banners) and
// otherwise quiet so the game stays readable.
// ============================================================================

export const colors = {
  // Background layers — three steps of black/blue depth.
  bgBase: '#06070d',
  bgPanel: '#0d111c',
  bgRaised: '#151b2c',
  bgGlass: 'rgba(20, 26, 44, 0.78)',

  // Outlines.
  outlineSoft: 'rgba(120, 140, 200, 0.10)',
  outline: 'rgba(140, 165, 220, 0.20)',
  outlineStrong: 'rgba(170, 195, 240, 0.35)',

  // Text.
  textHi: '#e9ecff',
  textMid: '#a8b0d6',
  textLow: '#646b8c',
  textInverse: '#0a0b13',

  // Suit colors — high-saturation electric tones.
  suitH: '#ff4d8b', // magenta-pink
  suitS: '#6bd6ff', // cyan
  suitD: '#ffd24a', // gold-amber
  suitC: '#5cff9a', // lime-green
  joker: '#d18bff', // violet (will rainbow-shimmer via animation)

  // Accent / UI signals.
  accent: '#6bd6ff', // primary action — cyan
  warn: '#ffb74a',
  danger: '#ff6464',
  success: '#5cff9a',

  // Highlighting / selection states.
  highlight: 'rgba(107, 214, 255, 0.18)',
  selectGlow: '#6bd6ff',
} as const;

export const suitColor = (s: Suit): string => {
  switch (s) {
    case 'H': return colors.suitH;
    case 'S': return colors.suitS;
    case 'D': return colors.suitD;
    case 'C': return colors.suitC;
  }
};

// Glow helpers — used as elevation + suit-color halo.
export const glow = (color: string, radius = 14, opacity = 0.65) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: Math.max(2, Math.round(radius / 2)),
});

// Typography.
//
// We avoid bundling custom font files for now and rely on the platform's
// monospace face — it nails the digital readout vibe without the build/perf
// cost. Numerals come from the same family so rank, score, and counters all
// have the same beat.
export const fonts = {
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
  }) as string,
  sans: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
  }) as string,
};

export const text = {
  hero: { fontFamily: fonts.mono, fontSize: 36, fontWeight: '800' as const, letterSpacing: 2, color: colors.textHi },
  title: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '700' as const, letterSpacing: 1.5, color: colors.textHi },
  section: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '700' as const, letterSpacing: 2, color: colors.textMid, textTransform: 'uppercase' as const },
  body: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMid, lineHeight: 18 },
  bodyHi: { fontFamily: fonts.sans, fontSize: 13, color: colors.textHi, lineHeight: 18 },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, fontWeight: '700' as const, color: colors.textMid, textTransform: 'uppercase' as const },
  value: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700' as const, letterSpacing: 1, color: colors.textHi },
  rankXl: { fontFamily: fonts.mono, fontSize: 28, fontWeight: '800' as const, letterSpacing: -1 },
  rankLg: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '800' as const, letterSpacing: -1 },
  rankMd: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '800' as const, letterSpacing: -1 },
  rankSm: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '800' as const, letterSpacing: -1 },
} as const;

// Spacing scale (4-pt grid).
export const spacing = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  xl: 16,
  pill: 999,
} as const;

// Card geometry. We pick sizes that fit a 5x5 grid on a 360–430-wide phone
// with breathing room for axis labels.
export const cardSize = {
  sm: 40,
  md: 56,
  lg: 88,
} as const;

// Easing / durations for Reanimated.
export const motion = {
  quick: 140,
  base: 220,
  slow: 360,
  spring: { damping: 18, stiffness: 200, mass: 0.7 } as const,
  springSnappy: { damping: 14, stiffness: 260, mass: 0.6 } as const,
} as const;
