import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card, isJoker, Suit } from '../../game/cards';

// Standard 4-color deck: spades black, hearts red, diamonds blue, clubs green.
const SUIT_COLOR: Record<Suit, string> = {
  S: '#1d1d22',
  H: '#c4252a',
  D: '#1b6fc7',
  C: '#1f8a3d',
};

interface Props {
  card: Card | null;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const SIZES = {
  xs: { side: 20, rank: 12, suit: 7 },
  sm: { side: 32, rank: 18, suit: 9 },
  md: { side: 56, rank: 28, suit: 12 },
  lg: { side: 80, rank: 40, suit: 16 },
};

const SUIT_GLYPH: Record<string, string> = {
  H: '♥',
  D: '♦',
  S: '♠',
  C: '♣',
};

const cardColor = (card: Card): string =>
  isJoker(card) ? '#8a6d1a' : SUIT_COLOR[card.suit];

export const CardTile = ({ card, highlighted, dimmed, size = 'md', style }: Props) => {
  const dim = SIZES[size];
  const square: ViewStyle = { width: dim.side, height: dim.side };

  if (!card) {
    return (
      <View
        style={[
          styles.tile,
          square,
          { backgroundColor: '#e7e7ec', borderColor: '#cfd0d6' },
          dimmed && styles.dimmed,
          highlighted && styles.highlighted,
          style,
        ]}
      />
    );
  }

  if (isJoker(card)) {
    return (
      <View
        style={[
          styles.tile,
          square,
          { backgroundColor: '#fff7d6', borderColor: '#caa44a' },
          dimmed && styles.dimmed,
          highlighted && styles.highlighted,
          style,
        ]}
      >
        <Text
          style={[
            styles.cornerTL,
            { color: '#caa44a', fontSize: dim.suit },
          ]}
        >
          ★
        </Text>
        <Text
          style={{
            fontWeight: '800',
            fontSize: dim.rank * 0.75,
            color: '#8a6d1a',
            lineHeight: dim.rank * 0.85,
          }}
        >
          JK
        </Text>
        <Text
          style={[
            styles.cornerBR,
            { color: '#caa44a', fontSize: dim.suit },
          ]}
        >
          ★
        </Text>
      </View>
    );
  }

  const color = cardColor(card);
  // "10" is two characters and needs to be slightly smaller to fit nicely.
  const isWide = card.rank === '10';
  const rankSize = isWide ? dim.rank * 0.78 : dim.rank;

  return (
    <View
      style={[
        styles.tile,
        square,
        dimmed && styles.dimmed,
        highlighted && styles.highlighted,
        style,
      ]}
    >
      <Text style={[styles.cornerTL, { color, fontSize: dim.suit }]}>
        {SUIT_GLYPH[card.suit]}
      </Text>
      <Text
        style={{
          color,
          fontSize: rankSize,
          fontWeight: '700',
          lineHeight: rankSize * 1.05,
        }}
      >
        {card.rank}
      </Text>
      <Text style={[styles.cornerBR, { color, fontSize: dim.suit }]}>
        {SUIT_GLYPH[card.suit]}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d4d6df',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cornerTL: {
    position: 'absolute',
    top: 2,
    left: 4,
    fontWeight: '700',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    fontWeight: '700',
  },
  dimmed: { opacity: 0.35 },
  highlighted: {
    borderColor: '#3680ff',
    borderWidth: 2,
  },
});
