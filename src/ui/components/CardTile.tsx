import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card, isJoker, Suit } from '../../game/cards';
import { useSettings } from '../settings';
import { cardSize, colors, fonts, glow, radius, suitColor } from '../theme';

// 2-color palette — red for ♥/♦, pale-off-white for ♠/♣. Reads as a classic
// playing-card deck on the dark glass background.
const TWO_COLOR_SUIT: Record<Suit, string> = {
  H: '#ff5577',
  D: '#ff5577',
  S: '#d8dcea',
  C: '#d8dcea',
};

interface Props {
  card: Card | null;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const SIZES = {
  xs: { side: 24, rank: 13, pip: 7, pipCBA: 9, padding: 2 },
  sm: { side: cardSize.sm, rank: 18, pip: 9, pipCBA: 12, padding: 3 },
  md: { side: cardSize.md, rank: 32, pip: 13, pipCBA: 18, padding: 5 },
  lg: { side: cardSize.lg, rank: 44, pip: 16, pipCBA: 22, padding: 6 },
} as const;

const SUIT_GLYPH: Record<Suit, string> = {
  H: '♥',
  D: '♦',
  S: '♠',
  C: '♣',
};

const SUIT_LETTER: Record<Suit, string> = {
  H: 'H',
  D: 'D',
  S: 'S',
  C: 'C',
};

const cardGlowColor = (card: Card, twoColor: boolean): string => {
  if (isJoker(card)) return colors.joker;
  return twoColor ? TWO_COLOR_SUIT[card.suit] : suitColor(card.suit);
};

export const CardTile = ({ card, highlighted, dimmed, size = 'md', style }: Props) => {
  const { settings } = useSettings();
  const cba = settings.colorBlindAssist;
  const twoColor = settings.twoColorDeck;
  const dim = SIZES[size];
  const square: ViewStyle = { width: dim.side, height: dim.side };

  // Empty slot — extremely subtle: just a thin rounded outline.
  if (!card) {
    return (
      <View
        style={[
          styles.tile,
          square,
          {
            backgroundColor: 'transparent',
            borderColor: colors.outlineSoft,
            borderWidth: 1,
            borderStyle: 'dashed',
          },
          dimmed && styles.dimmed,
          highlighted && styles.emptyHighlighted,
          style,
        ]}
      />
    );
  }

  const glowColor = cardGlowColor(card, twoColor);

  // In color-blind-assist mode we:
  //  - render the rank in plain white (no suit-colored text);
  //  - bump the corner pip up so the SHAPE (♥♠♦♣) is the primary cue;
  //  - put a small letter (H/S/D/C) in the opposite corner as a redundancy
  //    signal — so users with any common color-vision difference can
  //    distinguish suits via shape AND text.
  // The card border still uses the suit color (for the neon look) but no
  // longer carries discriminative information.
  const rankColor = cba ? colors.textHi : glowColor;
  const pipColor = cba ? colors.textHi : glowColor;
  const pipSize = cba ? dim.pipCBA : dim.pip;

  const baseTile: ViewStyle = {
    ...styles.tile,
    ...square,
    backgroundColor: colors.bgGlass,
    borderColor: glowColor,
    borderWidth: 1.5,
    ...(highlighted ? glow(glowColor, 18, 0.95) : glow(glowColor, 8, 0.5)),
  };

  if (isJoker(card)) {
    return (
      <View
        style={[
          baseTile,
          dimmed && styles.dimmed,
          highlighted && styles.highlighted,
          style,
        ]}
      >
        <Text
          style={[
            styles.cornerTL,
            { color: pipColor, fontSize: pipSize, top: dim.padding, left: dim.padding + 1 },
          ]}
        >
          ✦
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontWeight: '800',
            // The star renders ~30% taller than the "JK" letters at the same
            // point size, so trim a bit to keep it roughly in the same visual
            // weight class as a standard card's rank glyph.
            fontSize: dim.rank * 0.95,
            color: rankColor,
            textShadowColor: glowColor,
            textShadowRadius: cba ? 2 : 8,
            lineHeight: dim.rank,
          }}
        >
          ★
        </Text>
        <Text
          style={[
            styles.cornerBR,
            { color: pipColor, fontSize: pipSize, bottom: dim.padding, right: dim.padding + 1 },
          ]}
        >
          ✦
        </Text>
      </View>
    );
  }

  // Standard card.
  // "10" is two characters and needs to be slightly smaller to fit nicely.
  const isWide = card.rank === '10';
  const rankSize = isWide ? dim.rank * 0.74 : dim.rank;

  return (
    <View
      style={[
        baseTile,
        dimmed && styles.dimmed,
        highlighted && styles.highlighted,
        style,
      ]}
    >
      <Text
        style={[
          styles.cornerTL,
          { color: pipColor, fontSize: pipSize, top: dim.padding, left: dim.padding + 1 },
        ]}
      >
        {SUIT_GLYPH[card.suit]}
      </Text>
      <Text
        style={{
          fontFamily: fonts.mono,
          color: rankColor,
          fontSize: rankSize,
          fontWeight: '800',
          letterSpacing: -1,
          lineHeight: rankSize * 1.05,
          textShadowColor: glowColor,
          textShadowRadius: cba ? 2 : 5,
        }}
      >
        {card.rank}
      </Text>
      {cba && size !== 'xs' ? (
        // Suit letter top-right; pip glyph bottom-right.
        <>
          <Text
            style={[
              styles.cornerTR,
              {
                color: colors.textMid,
                fontSize: dim.pip,
                top: dim.padding,
                right: dim.padding + 1,
                fontFamily: fonts.mono,
              },
            ]}
          >
            {SUIT_LETTER[card.suit]}
          </Text>
          <Text
            style={[
              styles.cornerBR,
              { color: pipColor, fontSize: pipSize, bottom: dim.padding, right: dim.padding + 1 },
            ]}
          >
            {SUIT_GLYPH[card.suit]}
          </Text>
        </>
      ) : (
        <Text
          style={[
            styles.cornerBR,
            { color: pipColor, fontSize: pipSize, bottom: dim.padding, right: dim.padding + 1 },
          ]}
        >
          {SUIT_GLYPH[card.suit]}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cornerTL: {
    position: 'absolute',
    fontWeight: '800',
  },
  cornerTR: {
    position: 'absolute',
    fontWeight: '800',
    letterSpacing: 1,
  },
  cornerBR: {
    position: 'absolute',
    fontWeight: '800',
  },
  dimmed: { opacity: 0.4 },
  highlighted: {
    borderWidth: 2,
  },
  emptyHighlighted: {
    borderColor: colors.selectGlow,
    borderStyle: 'solid',
    borderWidth: 1.5,
  },
});
