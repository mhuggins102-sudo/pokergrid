import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../game/cards';
import { GRID_SIZE } from '../../game/grid';
import { CardTile } from './CardTile';

interface Props {
  grid: (Card | null)[];
  highlight?: Set<number>;
  onSlotPress?: (idx: number) => void;
  selected?: number | null;
}

export const GridView = ({ grid, highlight, onSlotPress, selected }: Props) => {
  return (
    <View style={styles.outer}>
      {Array.from({ length: GRID_SIZE }, (_, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: GRID_SIZE }, (_, c) => {
            const idx = r * GRID_SIZE + c;
            const isHighlighted = highlight?.has(idx) || selected === idx;
            return (
              <Pressable
                key={idx}
                style={styles.slot}
                onPress={onSlotPress ? () => onSlotPress(idx) : undefined}
              >
                <CardTile card={grid[idx]} highlighted={isHighlighted} size="md" />
                <Text style={styles.slotNum}>{idx + 1}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { alignItems: 'center', paddingVertical: 6 },
  row: { flexDirection: 'row' },
  slot: { padding: 3, alignItems: 'center' },
  slotNum: { fontSize: 9, color: '#9b9da6', marginTop: 1 },
});
