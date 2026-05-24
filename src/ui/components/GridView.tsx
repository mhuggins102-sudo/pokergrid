import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Card } from '../../game/cards';
import { GRID_SIZE, LineKind, SPIRAL_POSITION } from '../../game/grid';
import { useSettings } from '../settings';
import { cardSize, colors, fonts, glow, gridCellSize, radius, spacing } from '../theme';
import { CardTile } from './CardTile';

interface Props {
  grid: (Card | null)[];
  highlight?: Set<number>;
  // Slots whose card is currently being animated by the overlay; we render
  // them as empty here so the moving overlay card is the only thing visible.
  hiddenSlots?: Set<number>;
  selected?: number | null;
  nextSlotHint?: number | null;
  onSlotPress?: (idx: number) => void;
  onLinePress?: (kind: LineKind, index: number) => void;
  // Render with smaller cells + sm cards. Used by ResultScreen to keep the
  // whole results page visible without scrolling.
  compact?: boolean;
}

const FULL_CELL = gridCellSize;
const COMPACT_CELL = cardSize.sm + 4;
const HEADER = 20;

// Subtle infinite pulse on the next-fill cell so the user's eye is drawn to it.
const NextPulse = ({ size }: { size: number }) => {
  const { settings } = useSettings();
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    if (settings.reduceMotion) {
      opacity.value = 0.55;
      return;
    }
    opacity.value = withRepeat(withTiming(0.95, { duration: 900 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [settings.reduceMotion, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.nextPulse,
        { width: size, height: size, borderRadius: radius.md },
        style,
      ]}
    />
  );
};

export const GridView = ({
  grid,
  highlight,
  hiddenSlots,
  selected,
  nextSlotHint,
  onSlotPress,
  onLinePress,
  compact,
}: Props) => {
  const CELL = compact ? COMPACT_CELL : FULL_CELL;
  const cardSizeKey = compact ? 'sm' : 'md';
  return (
    <View style={styles.outer}>
      <View style={styles.colHeaderRow}>
        <View style={[styles.cornerCell, { width: HEADER }]} />
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <Pressable
            key={c}
            style={[styles.colHeader, { width: CELL }]}
            onPress={onLinePress ? () => onLinePress('col', c) : undefined}
          >
            <Text style={styles.headerText}>C{c + 1}</Text>
          </Pressable>
        ))}
      </View>

      {Array.from({ length: GRID_SIZE }, (_, r) => (
        <View key={r} style={styles.row}>
          <Pressable
            style={[styles.rowHeader, { height: CELL, width: HEADER }]}
            onPress={onLinePress ? () => onLinePress('row', r) : undefined}
          >
            <Text style={styles.headerText}>R{r + 1}</Text>
          </Pressable>

          {Array.from({ length: GRID_SIZE }, (_, c) => {
            const idx = r * GRID_SIZE + c;
            const isHidden = hiddenSlots?.has(idx) ?? false;
            const cardHere = isHidden ? null : grid[idx];
            const isHighlighted = highlight?.has(idx) || selected === idx;
            const isNext = nextSlotHint === idx && cardHere === null;
            const isEmpty = cardHere === null;
            const positionNum = SPIRAL_POSITION[idx];

            return (
              <Pressable
                key={idx}
                style={[styles.slot, { width: CELL, height: CELL }]}
                onPress={onSlotPress ? () => onSlotPress(idx) : undefined}
              >
                <View style={styles.slotInner}>
                  <CardTile card={cardHere} highlighted={isHighlighted} size={cardSizeKey} />
                  {isEmpty && (
                    <Text
                      style={[
                        styles.posNum,
                        compact && styles.posNumCompact,
                        isNext && styles.posNumNext,
                      ]}
                      pointerEvents="none"
                    >
                      {positionNum}
                    </Text>
                  )}
                  {isNext && <NextPulse size={CELL} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { alignItems: 'center', paddingVertical: spacing.xs },
  colHeaderRow: { flexDirection: 'row' },
  row: { flexDirection: 'row' },
  cornerCell: { height: HEADER },
  colHeader: {
    height: HEADER,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  rowHeader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  posNum: {
    position: 'absolute',
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.4,
  },
  posNumCompact: { fontSize: 11 },
  posNumNext: {
    color: colors.accent,
    opacity: 1,
    fontSize: 17,
    textShadowColor: colors.accent,
    textShadowRadius: 6,
  },
  nextPulse: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.accent,
    ...glow(colors.accent, 8, 0.6),
  },
});
