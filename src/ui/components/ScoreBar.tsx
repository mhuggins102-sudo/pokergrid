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
  target: number;
  liveScore?: number;
  onInfoPress?: () => void;
  onHomePress?: () => void;
  // Optional kicker shown above the score (e.g. "level 3", "balanced").
  kicker?: string;
}

// Live-score readout. Ticks softly on every change so the number feels alive.
const ScoreReadout = ({
  score,
  target,
}: {
  score: number;
  target: number;
}) => {
  const { settings } = useSettings();
  const scale = useSharedValue(1);
  const prev = useRef(score);

  useEffect(() => {
    if (prev.current === score) return;
    prev.current = score;
    if (settings.reduceMotion) return;
    scale.value = withSequence(
      withTiming(1.08, { duration: 90 }),
      withTiming(1, { duration: 180 })
    );
  }, [score, settings.reduceMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hit = score >= target;
  const accent = hit ? colors.success : colors.accent;

  return (
    <View style={styles.scoreBlock}>
      <Animated.View style={[styles.scoreLine, animStyle]}>
        <Text
          style={[
            styles.scoreValue,
            { color: accent, textShadowColor: accent },
          ]}
        >
          {score}
        </Text>
        <Text style={styles.scoreSep}>/</Text>
        <Text style={styles.scoreTarget}>{target}</Text>
      </Animated.View>
    </View>
  );
};

export const ScoreBar = ({
  target,
  liveScore,
  onInfoPress,
  onHomePress,
  kicker,
}: Props) => {
  return (
    <View style={styles.bar}>
      <View style={styles.topRow}>
        {onHomePress && (
          <Pressable onPress={onHomePress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconText}>‹</Text>
          </Pressable>
        )}
        <View style={styles.scoreBlock}>
          {kicker && <Text style={styles.kicker}>{kicker}</Text>}
          {liveScore !== undefined && (
            <ScoreReadout score={liveScore} target={target} />
          )}
        </View>
        {onInfoPress && (
          <Pressable onPress={onInfoPress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconText}>ⓘ</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineSoft,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    ...glow(colors.accent, 4, 0.22),
  },
  iconText: {
    color: colors.accent,
    fontSize: 16,
    fontFamily: fonts.mono,
    fontWeight: '800',
  },
  scoreBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontFamily: fonts.mono,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowRadius: 10,
  },
  scoreSep: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 18,
    marginHorizontal: 6,
    fontWeight: '500',
  },
  scoreTarget: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
