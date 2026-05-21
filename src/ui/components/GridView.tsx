import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../game/cards';
import { GRID_SIZE, LineKind } from '../../game/grid';
import { CardTile } from './CardTile';

interface Props {
  grid: (Card | null)[];
  highlight?: Set<number>;
  selected?: number | null;
  nextSlotHint?: number | null;
  onSlotPress?: (idx: number) => void;
  onLinePress?: (kind: LineKind, index: number) => void;
}

export const GridView = ({
  grid,
  highlight,
  selected,
  nextSlotHint,
  onSlotPress,
  onLinePress,
}: Props) => {
  return (
    <View style={styles.outer}>
      {/* Top column labels (1-5) */}
      <View style={styles.colHeaderRow}>
        <View style={styles.cornerCell} />
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <Pressable
            key={c}
            style={styles.colHeader}
            onPress={onLinePress ? () => onLinePress('col', c) : undefined}
          >
            <Text style={styles.headerText}>C{c + 1}</Text>
          </Pressable>
        ))}
      </View>

      {Array.from({ length: GRID_SIZE }, (_, r) => (
        <View key={r} style={styles.row}>
          <Pressable
            style={styles.rowHeader}
            onPress={onLinePress ? () => onLinePress('row', r) : undefined}
          >
            <Text style={styles.headerText}>R{r + 1}</Text>
          </Pressable>

          {Array.from({ length: GRID_SIZE }, (_, c) => {
            const idx = r * GRID_SIZE + c;
            const isHighlighted = highlight?.has(idx) || selected === idx;
            const isNext = nextSlotHint === idx && grid[idx] === null;
            return (
              <Pressable
                key={idx}
                style={styles.slot}
                onPress={onSlotPress ? () => onSlotPress(idx) : undefined}
              >
                <CardTile card={grid[idx]} highlighted={isHighlighted} size="md" />
                {isNext && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>→</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { alignItems: 'center', paddingVertical: 4 },
  colHeaderRow: { flexDirection: 'row' },
  row: { flexDirection: 'row' },
  cornerCell: { width: 18, height: 18 },
  colHeader: {
    width: 60,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHeader: {
    width: 18,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: '#9aa0b2',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  slot: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  nextBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#3680ff',
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
});
