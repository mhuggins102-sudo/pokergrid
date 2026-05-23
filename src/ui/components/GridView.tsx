import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../game/cards';
import { GRID_SIZE, LineKind, SPIRAL_POSITION } from '../../game/grid';
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
      {/* Top column labels */}
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
            const isEmpty = grid[idx] === null;
            const positionNum = SPIRAL_POSITION[idx];
            return (
              <Pressable
                key={idx}
                style={styles.slot}
                onPress={onSlotPress ? () => onSlotPress(idx) : undefined}
              >
                <CardTile card={grid[idx]} highlighted={isHighlighted} size="md" />
                {isEmpty && (
                  <Text
                    style={[
                      styles.posNum,
                      isNext && styles.posNumNext,
                    ]}
                    pointerEvents="none"
                  >
                    {positionNum}
                  </Text>
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
  posNum: {
    position: 'absolute',
    color: '#6c707d',
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.35,
  },
  posNumNext: {
    color: '#3680ff',
    opacity: 1,
    fontSize: 18,
  },
});
