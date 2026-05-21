import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card, isJoker } from '../../game/cards';

interface Props {
  card: Card | null;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const SIZES = {
  xs: { side: 20, rank: 7, suit: 10, cornerRank: 7 },
  sm: { side: 32, rank: 11, suit: 15, cornerRank: 8 },
  md: { side: 56, rank: 17, suit: 22, cornerRank: 10 },
  lg: { side: 80, rank: 22, suit: 32, cornerRank: 12 },
};

const SUIT_GLYPH: Record<string, string> = {
  H: '♥',
  D: '♦',
  S: '♠',
  C: '♣',
};

const isRed = (card: Card): boolean =>
  !isJoker(card) && (card.suit === 'H' || card.suit === 'D');

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
        <Text style={{ fontWeight: '800', fontSize: dim.rank, color: '#8a6d1a' }}>JK</Text>
        <Text style={{ fontSize: dim.suit * 0.75, color: '#caa44a' }}>★</Text>
      </View>
    );
  }

  const color = isRed(card) ? '#c4252a' : '#1d1d22';

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
      <Text
        style={[
          styles.cornerTL,
          { color, fontSize: dim.cornerRank },
        ]}
      >
        {card.rank}
        {SUIT_GLYPH[card.suit]}
      </Text>
      <Text style={{ color, fontSize: dim.suit, lineHeight: dim.suit * 1.1 }}>
        {SUIT_GLYPH[card.suit]}
      </Text>
      <Text
        style={[
          styles.cornerBR,
          { color, fontSize: dim.cornerRank },
        ]}
      >
        {card.rank}
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
    left: 3,
    fontWeight: '700',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 2,
    right: 3,
    fontWeight: '700',
  },
  dimmed: { opacity: 0.35 },
  highlighted: {
    borderColor: '#3680ff',
    borderWidth: 2,
  },
});
