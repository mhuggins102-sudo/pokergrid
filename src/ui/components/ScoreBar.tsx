import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  deckCount: number;
  trashCount: number;
  bonusDeckCount: number;
  target: number;
  difficulty: string;
  liveScore?: number;
  onInfoPress?: () => void;
}

// A single readout cell. When `value` changes, the value text briefly scales
// up + glows — like a flipclock tick.
const Cell = ({
  label,
  value,
  highlight,
  glowColor,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  glowColor?: string;
}) => {
  const { settings } = useSettings();
  const scale = useSharedValue(1);
  const valueRef = useRef(value);

  useEffect(() => {
    if (valueRef.current === value) return;
    valueRef.current = value;
    if (settings.reduceMotion) return;
    scale.value = withSequence(
      withTiming(1.15, { duration: 80 }),
      withTiming(1, { duration: 160 })
    );
  }, [value, scale, settings.reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Animated.Text
        style={[
          styles.cellValue,
          highlight && styles.cellValueHi,
          glowColor && { color: glowColor, textShadowColor: glowColor },
          animStyle,
        ]}
      >
        {value}
      </Animated.Text>
    </View>
  );
};

export const ScoreBar = ({
  deckCount,
  trashCount,
  bonusDeckCount,
  target,
  difficulty,
  liveScore,
  onInfoPress,
}: Props) => {
  const scoreHit = liveScore !== undefined && liveScore >= target;
  return (
    <View style={styles.bar}>
      <Cell label="Deck" value={`${deckCount}`} />
      <Cell label="Trash" value={`${trashCount}`} />
      <Cell label="Bonus" value={`${bonusDeckCount}`} />
      <Cell label={`Tgt · ${difficulty}`} value={`${target}`} />
      {liveScore !== undefined && (
        <Cell
          label="Score"
          value={`${liveScore}`}
          highlight={scoreHit}
          glowColor={scoreHit ? colors.success : undefined}
        />
      )}
      {onInfoPress && (
        <Pressable onPress={onInfoPress} style={styles.infoBtn} hitSlop={10}>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineSoft,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cell: { flex: 1, alignItems: 'center' },
  cellLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textLow,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cellValue: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: colors.textHi,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 1,
    textShadowColor: colors.textHi,
    textShadowRadius: 1,
  },
  cellValueHi: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 8,
  },
  infoBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    ...glow(colors.accent, 6, 0.3),
  },
  infoIcon: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});
