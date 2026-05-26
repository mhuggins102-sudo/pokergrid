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
import { useSettings } from '../settings';
import { useStats } from '../stats';
import { useTUSave } from '../targetsUpSave';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onStartFree: (d: Difficulty) => void;
  onStartTargetsUp: () => void;
  onContinueTargetsUp: () => void;
  onOpenChallenges: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

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
  onOpenSettings,
  onOpenRules,
}: Props) => {
  const [diff, setDiff] = React.useState<Difficulty>('medium');
  const [confirmNewTU, setConfirmNewTU] = React.useState(false);
  const [difficultyInfoOpen, setDifficultyInfoOpen] = React.useState(false);
  const { stats } = useStats();
  const { save: tuSave } = useTUSave();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.subtitle}>5×5 poker solitaire</Text>
        <NeonTitle />
      </View>

      {/* FREE PLAY ----------------------------------------------------- */}
      <Text style={styles.sectionLabel}>Free Play</Text>
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
        <View style={styles.startRow}>
          <NeonButton
            label={`Start · target ${TARGET_BY_DIFFICULTY[diff]}`}
            size="lg"
            onPress={() => onStartFree(diff)}
            style={styles.startBtn}
          />
          <Pressable
            onPress={() => setDifficultyInfoOpen(true)}
            hitSlop={6}
            style={styles.infoBtn}
          >
            <Text style={styles.infoBtnText}>ⓘ</Text>
          </Pressable>
        </View>
      </View>

      {/* GAME MODES --------------------------------------------------- */}
      <Text style={styles.sectionLabel}>Game Modes</Text>
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
          <Text style={styles.modeBody}>
            A ladder. Level 1 starts at target 300; each win pushes the bar +50. Lose once and the
            run ends. Final score is the highest level you cleared.
          </Text>
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
          <Text style={styles.modeBody}>
            A handful of structural goals — score 500+ with constraints on which lines may pay
            out, where the joker can be, and so on.
          </Text>
          <Text style={styles.modeCta}>Pick a challenge →</Text>
        </Pressable>
      </View>

      <View style={styles.streakRow}>
        {stats.wins > 0 && (
          <Text style={styles.streakText}>
            {stats.wins} free-play win{stats.wins !== 1 ? 's' : ''}
            {stats.streak > 1 ? ` · streak ${stats.streak}` : ''}
          </Text>
        )}
      </View>

      <View style={styles.navRow}>
        <NeonButton label="How to Play" variant="primary" size="sm" onPress={onOpenRules} />
        <NeonButton label="Stats" variant="secondary" size="sm" onPress={onOpenStats} />
        <NeonButton label="Settings" variant="secondary" size="sm" onPress={onOpenSettings} />
      </View>

      <DifficultyInfoModal
        visible={difficultyInfoOpen}
        onClose={() => setDifficultyInfoOpen(false)}
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
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
  diffRow: { flexDirection: 'row', gap: spacing.xs },
  diffCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 2,
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
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMid,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  startWrap: { marginTop: spacing.md, alignItems: 'stretch' },
  startRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  startBtn: { flex: 1 },
  // Round info button sized to match the NeonButton's lg height (~48px)
  // so the row aligns cleanly. ⓘ glyph uses the accent tint so it reads
  // as a tappable affordance, not just decoration.
  infoBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    ...glow(colors.accent, 6, 0.3),
  },
  infoBtnText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '800',
    textShadowColor: colors.accent,
    textShadowRadius: 4,
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
  modeBest: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
    textShadowColor: colors.success,
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
