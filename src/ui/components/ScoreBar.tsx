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

export type UndoState = 'hidden' | 'available' | 'unavailable';

interface Props {
  target: number;
  liveScore?: number;
  onInfoPress?: () => void;
  onHomePress?: () => void;
  onUndoPress?: () => void;
  // Opens the tier-breakdown popup explaining what score earns A / S /
  // SS for the current target. Wired by GameScreen.
  onScorePress?: () => void;
  // 'hidden' = challenge mode (no undo at all). 'available' = pressable.
  // 'unavailable' = greyed out (no snapshots, or per-mode cap reached).
  undoState?: UndoState;
  // Optional kicker shown above the score (e.g. "level 3", "balanced").
  kicker?: string;
  // Endgame penalty preview: how many lines are still incomplete and the
  // total points they'll cost if left unfinished. The live score is
  // optimistic (it ignores the incomplete-line penalty), so this surfaces the
  // looming hit as the run nears its end. 0 / undefined hides the cue.
  openLines?: number;
  openPenalty?: number;
  // First-game hint plumbing — anchor for the scoring-info hint
  // that points at the ⓘ button next to the score readout.
  infoBtnRef?: React.Ref<View>;
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
  onUndoPress,
  onScorePress,
  undoState = 'hidden',
  kicker,
  openLines = 0,
  openPenalty = 0,
  infoBtnRef,
}: Props) => {
  const showUndo = undoState !== 'hidden';
  const undoActive = undoState === 'available';
  const showPenalty = openLines > 0 && openPenalty < 0;
  return (
    <View style={styles.bar}>
      <View style={styles.topRow}>
        {onHomePress && (
          <Pressable onPress={onHomePress} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.iconText}>‹</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onScorePress}
          disabled={!onScorePress}
          style={styles.scoreBlock}
          hitSlop={6}
        >
          {kicker && <Text style={styles.kicker}>{kicker}</Text>}
          {liveScore !== undefined && (
            <ScoreReadout score={liveScore} target={target} />
          )}
          {showPenalty && (
            <Text style={styles.penaltyNote}>
              {openLines} line{openLines === 1 ? '' : 's'} open · {openPenalty}
            </Text>
          )}
        </Pressable>
        {showUndo && (
          <Pressable
            onPress={undoActive ? onUndoPress : undefined}
            hitSlop={10}
            disabled={!undoActive}
            style={[
              styles.iconBtn,
              styles.undoBtnSpacer,
              !undoActive && styles.iconBtnDisabled,
            ]}
          >
            <Text style={[styles.iconText, !undoActive && styles.iconTextDisabled]}>↶</Text>
          </Pressable>
        )}
        {onInfoPress && (
          <Pressable
            ref={infoBtnRef}
            onPress={onInfoPress}
            hitSlop={10}
            style={styles.iconBtn}
          >
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
  // Pushes the undo icon left a bit so it doesn't sit shoulder-to-
  // shoulder with the score-breakdown ⓘ button. Only the undo gets
  // this gap; the other icons hug the row edges as before.
  undoBtnSpacer: { marginRight: spacing.sm },
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
  iconBtnDisabled: {
    borderColor: colors.outlineSoft,
    opacity: 0.4,
  },
  iconTextDisabled: {
    color: colors.textLow,
    textShadowRadius: 0,
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
    textShadowRadius: 5,
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
  penaltyNote: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
    textShadowColor: colors.warn,
    textShadowRadius: 2,
  },
});
