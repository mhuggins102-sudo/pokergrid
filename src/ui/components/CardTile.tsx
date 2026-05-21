import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Card, cardLabel, isJoker } from '../../game/cards';

interface Props {
  card: Card | null;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const SIZES = {
  sm: { width: 36, height: 50, font: 12 },
  md: { width: 52, height: 72, font: 18 },
  lg: { width: 80, height: 110, font: 28 },
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
  if (!card) {
    return (
      <View
        style={[
          styles.tile,
          { width: dim.width, height: dim.height, backgroundColor: '#e7e7ec', borderColor: '#cfd0d6' },
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
          {
            width: dim.width,
            height: dim.height,
            backgroundColor: '#fff7d6',
            borderColor: '#caa44a',
          },
          dimmed && styles.dimmed,
          highlighted && styles.highlighted,
          style,
        ]}
      >
        <Text style={{ fontWeight: '700', fontSize: dim.font * 0.6, color: '#8a6d1a' }}>JK</Text>
        <Text style={{ fontSize: dim.font, color: '#caa44a' }}>★</Text>
      </View>
    );
  }
  const color = isRed(card) ? '#c4252a' : '#1d1d22';
  return (
    <View
      style={[
        styles.tile,
        { width: dim.width, height: dim.height },
        dimmed && styles.dimmed,
        highlighted && styles.highlighted,
        style,
      ]}
    >
      <Text style={{ color, fontWeight: '700', fontSize: dim.font }}>{card.rank}</Text>
      <Text style={{ color, fontSize: dim.font }}>{SUIT_GLYPH[card.suit]}</Text>
      <Text style={{ position: 'absolute', bottom: 4, right: 6, color, fontSize: dim.font * 0.6 }}>
        {cardLabel(card)}
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
  },
  dimmed: { opacity: 0.35 },
  highlighted: {
    borderColor: '#3680ff',
    borderWidth: 2,
    shadowColor: '#3680ff',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
  },
});
