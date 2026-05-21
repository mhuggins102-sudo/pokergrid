import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  deckCount: number;
  discardCount: number;
  target: number;
  difficulty: string;
  liveScore?: number;
}

export const ScoreBar = ({ deckCount, discardCount, target, difficulty, liveScore }: Props) => (
  <View style={styles.bar}>
    <View style={styles.cell}>
      <Text style={styles.label}>Deck</Text>
      <Text style={styles.value}>{deckCount}</Text>
    </View>
    <View style={styles.cell}>
      <Text style={styles.label}>Discard</Text>
      <Text style={styles.value}>{discardCount}</Text>
    </View>
    <View style={styles.cell}>
      <Text style={styles.label}>Target ({difficulty})</Text>
      <Text style={styles.value}>{target}</Text>
    </View>
    {liveScore !== undefined && (
      <View style={styles.cell}>
        <Text style={styles.label}>Score</Text>
        <Text style={[styles.value, liveScore >= target && styles.win]}>{liveScore}</Text>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#1d2331',
  },
  cell: { alignItems: 'center' },
  label: { color: '#9aa0b2', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#f4f5f9', fontWeight: '700', fontSize: 18, marginTop: 2 },
  win: { color: '#7cdca0' },
});
