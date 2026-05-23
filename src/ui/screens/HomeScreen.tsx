import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Difficulty, TARGET_BY_DIFFICULTY } from '../../game/rules';
import { NeonButton } from '../components/NeonButton';
import { useSettings } from '../settings';
import { useStats } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onStart: (d: Difficulty) => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

const NeonTitle = () => {
  const { settings } = useSettings();
  const pulse = useSharedValue(0.7);
  useEffect(() => {
    if (settings.reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [settings.reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({
    textShadowRadius: 4 + pulse.value * 14,
    opacity: 0.85 + pulse.value * 0.15,
  }));
  return (
    <Animated.Text style={[styles.title, style]}>POKERGRID</Animated.Text>
  );
};

export const HomeScreen = ({
  onStart,
  onOpenStats,
  onOpenSettings,
  onOpenTutorial,
}: Props) => {
  const [diff, setDiff] = React.useState<Difficulty>('medium');
  const { stats } = useStats();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.subtitle}>5×5 poker solitaire</Text>
        <NeonTitle />
      </View>

      <Text style={styles.sectionLabel}>Difficulty</Text>
      <View style={styles.diffRow}>
        {DIFFS.map(d => {
          const selected = d === diff;
          return (
            <Pressable
              key={d}
              style={[styles.diffCell, selected && styles.diffCellSel]}
              onPress={() => setDiff(d)}
            >
              <Text style={[styles.diffName, selected && styles.diffNameSel]}>{d}</Text>
              <Text style={[styles.diffTarget, selected && styles.diffTargetSel]}>
                target {TARGET_BY_DIFFICULTY[d]}
              </Text>
              {stats.best[d] !== null && (
                <Text style={[styles.diffBest, selected && styles.diffBestSel]}>
                  best {stats.best[d]}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.startWrap}>
        <NeonButton
          label={`Start · target ${TARGET_BY_DIFFICULTY[diff]}`}
          size="lg"
          onPress={() => onStart(diff)}
        />
      </View>

      <View style={styles.streakRow}>
        {stats.wins > 0 && (
          <Text style={styles.streakText}>
            {stats.wins} win{stats.wins !== 1 ? 's' : ''}
            {stats.streak > 1 ? ` · streak ${stats.streak}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.navRow}>
        <NeonButton label="How to Play" variant="primary" size="sm" onPress={onOpenTutorial} />
        <NeonButton label="Stats" variant="secondary" size="sm" onPress={onOpenStats} />
        <NeonButton label="Settings" variant="secondary" size="sm" onPress={onOpenSettings} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  subtitle: {
    color: colors.suitH,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textShadowColor: colors.suitH,
    textShadowRadius: 6,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 5,
    textShadowColor: colors.accent,
  },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  diffRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  diffCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
  },
  diffCellSel: {
    borderColor: colors.accent,
    borderWidth: 2,
    ...glow(colors.accent, 12, 0.6),
  },
  diffName: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    color: colors.textMid,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  diffNameSel: {
    color: colors.accent,
    textShadowColor: colors.accent,
    textShadowRadius: 4,
  },
  diffTarget: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textLow,
    marginTop: 4,
  },
  diffTargetSel: { color: colors.textMid },
  diffBest: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textLow,
    marginTop: 2,
    letterSpacing: 1,
  },
  diffBestSel: { color: colors.success, textShadowColor: colors.success, textShadowRadius: 3 },
  startWrap: { marginTop: spacing.lg, alignItems: 'stretch' },
  streakRow: { alignItems: 'center', marginTop: spacing.md, height: 18 },
  streakText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.warn,
    letterSpacing: 1.5,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
});
