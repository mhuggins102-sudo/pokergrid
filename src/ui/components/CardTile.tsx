import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card, isJoker, Suit } from '../../game/cards';
import { cardSize, colors, fonts, glow, radius, suitColor } from '../theme';

interface Props {
  card: Card | null;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const SIZES = {
  xs: { side: 24, rank: 13, pip: 7, padding: 2 },
  sm: { side: cardSize.sm, rank: 18, pip: 9, padding: 3 },
  md: { side: cardSize.md, rank: 28, pip: 11, padding: 4 },
  lg: { side: cardSize.lg, rank: 44, pip: 16, padding: 6 },
} as const;

const SUIT_GLYPH: Record<Suit, string> = {
  H: '♥',
  D: '♦',
  S: '♠',
  C: '♣',
};

const cardGlowColor = (card: Card): string =>
  isJoker(card) ? colors.joker : suitColor(card.suit);

export const CardTile = ({ card, highlighted, dimmed, size = 'md', style }: Props) => {
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

  const glowColor = cardGlowColor(card);
  // The card body itself is a near-black glass panel with a thin neon border
  // and an outer glow tinted by the suit.
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
            { color: glowColor, fontSize: dim.pip, top: dim.padding, left: dim.padding + 1 },
          ]}
        >
          ✦
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontWeight: '800',
            fontSize: dim.rank * 0.72,
            color: glowColor,
            letterSpacing: 1,
            textShadowColor: glowColor,
            textShadowRadius: 6,
          }}
        >
          JK
        </Text>
        <Text
          style={[
            styles.cornerBR,
            { color: glowColor, fontSize: dim.pip, bottom: dim.padding, right: dim.padding + 1 },
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
          { color: glowColor, fontSize: dim.pip, top: dim.padding, left: dim.padding + 1 },
        ]}
      >
        {SUIT_GLYPH[card.suit]}
      </Text>
      <Text
        style={{
          fontFamily: fonts.mono,
          color: glowColor,
          fontSize: rankSize,
          fontWeight: '800',
          letterSpacing: -1,
          lineHeight: rankSize * 1.05,
          textShadowColor: glowColor,
          textShadowRadius: 5,
        }}
      >
        {card.rank}
      </Text>
      <Text
        style={[
          styles.cornerBR,
          { color: glowColor, fontSize: dim.pip, bottom: dim.padding, right: dim.padding + 1 },
        ]}
      >
        {SUIT_GLYPH[card.suit]}
      </Text>
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
