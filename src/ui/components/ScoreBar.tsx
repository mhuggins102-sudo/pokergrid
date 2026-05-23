import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  deckCount: number;
  trashCount: number;
  bonusDeckCount: number;
  target: number;
  difficulty: string;
  liveScore?: number;
  onInfoPress?: () => void;
}

export const ScoreBar = ({
  deckCount,
  trashCount,
  bonusDeckCount,
  target,
  difficulty,
  liveScore,
  onInfoPress,
}: Props) => (
  <View style={styles.bar}>
    <Cell label="Deck" value={`${deckCount}`} />
    <Cell label="Trash" value={`${trashCount}`} />
    <Cell label="Bonus" value={`${bonusDeckCount}`} />
    <Cell label={`Tgt (${difficulty})`} value={`${target}`} />
    {liveScore !== undefined && (
      <Cell label="Score" value={`${liveScore}`} highlight={liveScore >= target} />
    )}
    {onInfoPress && (
      <Pressable onPress={onInfoPress} style={styles.infoBtn} hitSlop={8}>
        <Text style={styles.infoIcon}>ⓘ</Text>
      </Pressable>
    )}
  </View>
);

const Cell = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <View style={styles.cell}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, highlight && styles.win]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#1d2331',
  },
  cell: { alignItems: 'center', flex: 1 },
  label: { color: '#9aa0b2', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: '#f4f5f9', fontWeight: '700', fontSize: 16, marginTop: 1 },
  win: { color: '#7cdca0' },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3c4456',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  infoIcon: { color: '#f4f5f9', fontSize: 16, fontWeight: '700' },
});
