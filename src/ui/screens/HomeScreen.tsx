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
import { colors, fonts, glow, radius, spacing, text } from '../theme';

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
        <NeonButton label="Stats" variant="secondary" size="sm" onPress={onOpenStats} />
        <NeonButton label="Settings" variant="secondary" size="sm" onPress={onOpenSettings} />
        <NeonButton label="How to play" variant="secondary" size="sm" onPress={onOpenTutorial} />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>The Game</Text>
      <Text style={styles.copy}>
        Drawn cards fill the grid in a spiral starting at the center. Each turn, place the card,
        trash it, or use its suit perk.
      </Text>

      <View style={styles.perksBlock}>
        <Perk symbol="♥" color={colors.suitH} name="Swap"
              desc="Swap any two cards that share a row or column." />
        <Perk symbol="♠" color={colors.suitS} name="Slide"
              desc="Push a card; the connected chain in front of it slides any distance up to a wall or blocker." />
        <Perk symbol="♦" color={colors.suitD} name="Destroy"
              desc="Trash any one card on the grid (even the joker)." />
        <Perk symbol="♣" color={colors.suitC} name="Bonus"
              desc="Draw two bonus cards and keep one. Hold up to 3; at the cap you must swap one out." />
      </View>

      <Text style={styles.copy}>
        Bonus multipliers stack multiplicatively. Cards spent on a perk go to trash. The joker is
        auto-placed and is a wild in its row and column. At game end, score the 5 rows + 5 columns
        and beat your target. Incomplete lines cost 25 points each.
      </Text>
    </ScrollView>
  );
};

const Perk = ({
  symbol,
  color,
  name,
  desc,
}: {
  symbol: string;
  color: string;
  name: string;
  desc: string;
}) => (
  <View style={styles.perkRow}>
    <Text style={[styles.perkSymbol, { color, textShadowColor: color }]}>{symbol}</Text>
    <View style={styles.perkText}>
      <Text style={[styles.perkName, { color }]}>{name}</Text>
      <Text style={styles.perkDesc}>{desc}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  subtitle: {
    ...text.label,
    color: colors.suitH,
    fontSize: 11,
    letterSpacing: 4,
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
    ...text.section,
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
  },
  divider: { height: 1, backgroundColor: colors.outlineSoft, marginVertical: spacing.xl },
  copy: { ...text.body, marginBottom: spacing.md },
  perksBlock: { marginBottom: spacing.md, gap: spacing.sm },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  perkSymbol: {
    fontFamily: fonts.mono,
    fontSize: 26,
    fontWeight: '900',
    width: 28,
    textAlign: 'center',
    textShadowRadius: 6,
  },
  perkText: { flex: 1 },
  perkName: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  perkDesc: {
    ...text.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
});
