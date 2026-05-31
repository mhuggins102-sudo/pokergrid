import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Difficulty, TARGET_BY_DIFFICULTY } from '../../game/rules';
import { DifficultyInfoModal } from '../components/DifficultyInfoModal';
import { NeonButton } from '../components/NeonButton';
import { VariantsInfoModal } from '../components/VariantsInfoModal';
import { useSettings } from '../settings';
import { useStats } from '../stats';
import { useTUSave } from '../targetsUpSave';
import { colors, difficultyColor, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onStartFree: (d: Difficulty) => void;
  onStartTargetsUp: () => void;
  onContinueTargetsUp: () => void;
  onOpenChallenges: () => void;
  onOpenStats: () => void;
  onOpenAchievements: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

// A worded intensity ramp shown under each tile. Extreme's target (450) is
// lower than Hard's (500), so the bare number reads as a step DOWN even though
// Extreme is the toughest mode — the word fixes the ordering at a glance. The
// per-difficulty rule details live in the Difficulty Modes info popup.
const DIFF_TAGLINE: Record<Difficulty, string> = {
  easy: 'gentle',
  medium: 'steady',
  hard: 'tough',
  extreme: 'brutal',
};

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
  return <Animated.Text style={[styles.title, style]}>POKERGRID</Animated.Text>;
};

export const HomeScreen = ({
  onStartFree,
  onStartTargetsUp,
  onContinueTargetsUp,
  onOpenChallenges,
  onOpenStats,
  onOpenAchievements,
  onOpenSettings,
  onOpenRules,
}: Props) => {
  const [confirmNewTU, setConfirmNewTU] = React.useState(false);
  const [difficultyInfoOpen, setDifficultyInfoOpen] = React.useState(false);
  const [variantsInfoOpen, setVariantsInfoOpen] = React.useState(false);
  const { stats } = useStats();
  const { save: tuSave } = useTUSave();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.subtitle}>5×5 poker solitaire</Text>
        <NeonTitle />
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>Free Play</Text>
        <Pressable
          onPress={() => setDifficultyInfoOpen(true)}
          hitSlop={10}
          style={styles.headerInfoBtn}
        >
          <Text style={styles.headerInfoBtnText}>ⓘ</Text>
        </Pressable>
      </View>
      <View style={styles.diffRow}>
        {DIFFS.map(d => (
          <Pressable
            key={d}
            style={[styles.diffCell, { borderColor: difficultyColor(d) }, glow(difficultyColor(d), 8, 0.35)]}
            onPress={() => onStartFree(d)}
          >
            <Text style={[styles.diffName, { color: difficultyColor(d), textShadowColor: difficultyColor(d) }]}>
              {d}
            </Text>
            <Text style={[styles.diffTagline, { color: difficultyColor(d) }]}>
              {DIFF_TAGLINE[d]}
            </Text>
            <Text style={styles.diffTarget}>target {TARGET_BY_DIFFICULTY[d]}</Text>
            <Text style={styles.diffBest}>
              best {stats.best[d] ?? '—'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>Variants</Text>
        <Pressable
          onPress={() => setVariantsInfoOpen(true)}
          hitSlop={10}
          style={styles.headerInfoBtn}
        >
          <Text style={styles.headerInfoBtnText}>ⓘ</Text>
        </Pressable>
      </View>
      <View style={styles.modesCol}>
        <Pressable
          style={styles.modeCard}
          onPress={tuSave ? onContinueTargetsUp : onStartTargetsUp}
        >
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>Targets Up</Text>
            {stats.targetsUpBest > 0 && (
              <Text style={styles.modeBest}>best L{stats.targetsUpBest}</Text>
            )}
          </View>
          <Text style={styles.modeBody}>Climb the ladder — targets rise each level.</Text>
          {tuSave ? (
            <>
              <Text style={styles.modeCta}>Continue at Level {tuSave.level} →</Text>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setConfirmNewTU(true);
                }}
                hitSlop={6}
              >
                <Text style={styles.modeSecondaryCta}>· Start a new run</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.modeCta}>Start at Level 1 →</Text>
          )}
        </Pressable>

        <Pressable style={styles.modeCard} onPress={onOpenChallenges}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>Challenges</Text>
            {stats.challengesDone.length > 0 && (
              <Text style={styles.modeBest}>
                {stats.challengesDone.length} done
              </Text>
            )}
          </View>
          <Text style={styles.modeBody}>Beat the target with unique deck and rule twists.</Text>
          <Text style={styles.modeCta}>Pick a challenge →</Text>
        </Pressable>
      </View>

      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>Progress</Text>
      </View>
      <View style={styles.modesCol}>
        <Pressable style={styles.modeCard} onPress={onOpenStats}>
          <View style={styles.modeHeader}>
            <Text style={[styles.modeTitle, styles.modeTitleAccent]}>Stats</Text>
            {stats.wins > 0 && (
              <Text style={styles.modeBest}>
                {stats.wins} win{stats.wins === 1 ? '' : 's'}
              </Text>
            )}
          </View>
          <Text style={styles.modeBody}>
            Per-difficulty W/L, best score, tier distribution, recent runs, and bonus-card frequency.
          </Text>
          <Text style={styles.modeCta}>View stats →</Text>
        </Pressable>

        <Pressable style={styles.modeCard} onPress={onOpenAchievements}>
          <View style={styles.modeHeader}>
            <Text style={[styles.modeTitle, styles.modeTitleAccentJoker]}>Achievements</Text>
            {stats.achievementsDone.length > 0 && (
              <Text style={styles.modeBestJoker}>
                {stats.achievementsDone.length} earned
              </Text>
            )}
          </View>
          <Text style={styles.modeBody}>
            Passive goals earned on Hard or Extreme. They tick off automatically when a qualifying
            run ends.
          </Text>
          <Text style={styles.modeCta}>View achievements →</Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        <NeonButton label="How to Play" variant="primary" size="md" onPress={onOpenRules} />
        <NeonButton label="Settings" variant="secondary" size="md" onPress={onOpenSettings} />
      </View>

      <DifficultyInfoModal
        visible={difficultyInfoOpen}
        onClose={() => setDifficultyInfoOpen(false)}
      />

      <VariantsInfoModal
        visible={variantsInfoOpen}
        onClose={() => setVariantsInfoOpen(false)}
      />

      <Modal
        visible={confirmNewTU}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmNewTU(false)}
      >
        <Pressable style={modalStyles.backdrop} onPress={() => setConfirmNewTU(false)}>
          <Pressable style={modalStyles.sheet} onPress={() => {}}>
            <Text style={modalStyles.title}>Discard your Targets Up save?</Text>
            <Text style={modalStyles.body}>
              You'll lose your progress on Level {tuSave?.level ?? 1} and start fresh at Level 1.
            </Text>
            <View style={modalStyles.btnRow}>
              <NeonButton
                label="Cancel"
                variant="secondary"
                size="sm"
                onPress={() => setConfirmNewTU(false)}
              />
              <NeonButton
                label="Start fresh"
                variant="warn"
                size="sm"
                onPress={() => {
                  setConfirmNewTU(false);
                  onStartTargetsUp();
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.warn, 14, 0.3),
  },
  title: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textShadowColor: colors.warn,
    textShadowRadius: 4,
  },
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: {
    paddingTop: spacing.xl,
    paddingBottom: 0,
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
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  diffRow: { flexDirection: 'row', gap: spacing.xs },
  // Each cell is now a self-contained launcher — tap to start that
  // difficulty. Border + glow tint come from the per-difficulty color
  // applied inline so the four tiles read as a heat-ramp.
  diffCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 2,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
  },
  // Matches the modeTitle treatment (mono / 900 / uppercase / neon
  // shadow) but a touch smaller so "EXTREME" fits the 4-across row on
  // a 390-wide frame. Color + shadow tint are applied inline.
  diffName: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textShadowRadius: 5,
  },
  // "target N" / "best N" use the same sans body voice as the mode
  // card descriptions ("Climb the ladder…") rather than the mono
  // numeric voice — keeps them as soft labels, not data readouts.
  diffTagline: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 3,
    opacity: 0.9,
  },
  diffTarget: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMid,
    marginTop: 6,
  },
  diffBest: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMid,
    marginTop: 2,
  },
  headerInfoBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    ...glow(colors.accent, 4, 0.3),
  },
  headerInfoBtnText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  modesCol: { gap: spacing.sm },
  modeCard: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...glow(colors.warn, 6, 0.18),
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  modeTitle: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 6,
  },
  // Stats card uses the accent (cyan) tint so it visually separates
  // from the warn-amber Targets-Up and Challenges variants.
  modeTitleAccent: {
    color: colors.accent,
    textShadowColor: colors.accent,
  },
  // Achievements card uses the joker (violet) tint — matches the
  // achievement-earned callout on the result screen + the SS tier
  // badge, tying the visual language together.
  modeTitleAccentJoker: {
    color: colors.joker,
    textShadowColor: colors.joker,
  },
  modeBest: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
    textShadowColor: colors.success,
    textShadowRadius: 3,
  },
  modeBestJoker: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
    textShadowColor: colors.joker,
    textShadowRadius: 3,
  },
  modeBody: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  modeCta: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  modeSecondaryCta: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 4,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
});
