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
  target: number;
  difficulty: string;
  liveScore?: number;
  onInfoPress?: () => void;
  onHomePress?: () => void;
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

const Tag = ({ label, value }: { label: string; value: string | number }) => (
  <View style={styles.tag}>
    <Text style={styles.tagLabel}>{label}</Text>
    <Text style={styles.tagValue}>{value}</Text>
  </View>
);

export const ScoreBar = ({
  deckCount,
  trashCount,
  target,
  difficulty,
  liveScore,
  onInfoPress,
  onHomePress,
}: Props) => {
  return (
    <View style={styles.bar}>
      <View style={styles.topRow}>
        {onHomePress && (
          <Pressable onPress={onHomePress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconText}>‹</Text>
          </Pressable>
        )}
        {liveScore !== undefined ? (
          <ScoreReadout score={liveScore} target={target} />
        ) : (
          <View style={styles.scoreBlock} />
        )}
        {onInfoPress && (
          <Pressable onPress={onInfoPress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconText}>ⓘ</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.tagsRow}>
        <Tag label="deck" value={deckCount} />
        <View style={styles.tagSep} />
        <Tag label="trash" value={trashCount} />
        <View style={styles.tagSep} />
        <Tag label="diff" value={difficulty} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineSoft,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
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
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  tagLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginRight: 4,
  },
  tagValue: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tagSep: {
    width: 1,
    height: 10,
    backgroundColor: colors.outlineSoft,
    marginHorizontal: spacing.xs,
  },
});
