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
  // Drag-target preview: slots that show as the destination of an
  // in-flight drag — chain landing slots for a ♠ slide, or the partner
  // slot for a ♥ swap. Rendered as a green outline overlay on top of
  // the existing slot content so the player sees the landing in real
  // time without committing yet.
  ghostSlots?: Set<number>;
  // Multi-select danger overlay — Mega Destroy uses this to mark
  // slots the player has tapped but not yet confirmed. Rendered as
  // a red outline on top of the cell.
  dangerSlots?: Set<number>;
  // Multi-select "picked" overlay — Side Slide uses this to mark
  // cards the player has added to the chain. Rendered as a green
  // outline to distinguish from destruction (danger) selections.
  pickedSlots?: Set<number>;
  // Dim card overlays — Slip & Slide preview uses this to render the
  // actual chain cards at their PREVIEW destinations so the player
  // can see exactly where each picked card will land before
  // committing.
  ghostCards?: { slot: number; card: Card }[];
  onSlotPress?: (idx: number) => void;
  onLinePress?: (kind: LineKind, index: number) => void;
  // Render with smaller cells + sm cards. Used by ResultScreen to keep the
  // whole results page visible without scrolling.
  compact?: boolean;
  // First-game hint plumbing: when supplied, the grid writes each cell's
  // Pressable into this array by slot index so the parent can
  // measureInWindow a specific cell (e.g. the joker's tile).
  cellRefs?: React.MutableRefObject<(View | null)[]>;
  // First-game hint plumbing: per-line-header refs so a hint can
  // anchor on a specific R-N or C-N label (used by the line-value
  // hint to point at a completed line). Indexed by row/col index 0–4.
  lineHeaderRefs?: React.MutableRefObject<{
    row: (View | null)[];
    col: (View | null)[];
  }>;
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
  ghostSlots,
  dangerSlots,
  pickedSlots,
  ghostCards,
  onSlotPress,
  onLinePress,
  compact,
  cellRefs,
  lineHeaderRefs,
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
            ref={el => {
              if (lineHeaderRefs) lineHeaderRefs.current.col[c] = el;
            }}
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
            ref={el => {
              if (lineHeaderRefs) lineHeaderRefs.current.row[r] = el;
            }}
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

            const isGhost = ghostSlots?.has(idx) ?? false;
            const isDanger = dangerSlots?.has(idx) ?? false;
            const isPicked = pickedSlots?.has(idx) ?? false;
            const ghostCard = ghostCards?.find(g => g.slot === idx)?.card ?? null;
            return (
              <Pressable
                key={idx}
                style={[styles.slot, { width: CELL, height: CELL }]}
                onPress={onSlotPress ? () => onSlotPress(idx) : undefined}
                ref={el => {
                  if (cellRefs) cellRefs.current[idx] = el;
                }}
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
                  {isNext && <NextPulse size={compact ? cardSize.sm : cardSize.md} />}
                  {isGhost && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.dragGhost,
                        {
                          width: compact ? cardSize.sm : cardSize.md,
                          height: compact ? cardSize.sm : cardSize.md,
                        },
                      ]}
                    />
                  )}
                  {isDanger && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.dangerOverlay,
                        {
                          width: compact ? cardSize.sm : cardSize.md,
                          height: compact ? cardSize.sm : cardSize.md,
                        },
                      ]}
                    />
                  )}
                  {isPicked && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.pickedOverlay,
                        {
                          width: compact ? cardSize.sm : cardSize.md,
                          height: compact ? cardSize.sm : cardSize.md,
                        },
                      ]}
                    />
                  )}
                  {ghostCard && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.ghostCardWrap,
                        {
                          width: compact ? cardSize.sm : cardSize.md,
                          height: compact ? cardSize.sm : cardSize.md,
                        },
                      ]}
                    >
                      <CardTile card={ghostCard} dimmed size={cardSizeKey} />
                    </View>
                  )}
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
  // Drag-target preview: a thick success-green outline marking where the
  // in-flight drag will land if released right now — chain landing slots
  // for a ♠ slide, or the partner card for a ♥ swap. Sits on top of any
  // existing card art so it remains visible over filled slots.
  dragGhost: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: 'rgba(92, 255, 154, 0.10)',
    ...glow(colors.success, 8, 0.65),
  },
  // Mega Destroy: "picked but not yet committed" tint — same shape as
  // dragGhost but rendered in danger red so the player can see at a
  // glance which cards will be destroyed when they Confirm.
  dangerOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 100, 100, 0.18)',
    ...glow(colors.danger, 8, 0.7),
  },
  // Side Slide chain pick: "you've added this to the moving group"
  // tint. Green so the chain reads as "selected for movement", not
  // "marked for destruction" like the Mega Destroy variant.
  pickedOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.success,
    borderRadius: radius.md,
    backgroundColor: 'rgba(92, 255, 154, 0.15)',
    ...glow(colors.success, 8, 0.7),
  },
  // Slip & Slide preview — render the actual chain card at its
  // previewed destination, dimmed so the player can tell it apart
  // from the live grid contents.
  ghostCardWrap: {
    position: 'absolute',
    opacity: 0.55,
  },
});
