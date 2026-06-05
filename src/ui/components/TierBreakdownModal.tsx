import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, glow, radius, spacing } from '../theme';

// Tier rules — single source of truth for thresholds and descriptions.
// Mirrors the tierFor() formula in ResultScreen: win bands use score /
// target ratio, loss bands compare to the same target. SS at 1.6×, S at
// 1.3×, A is just a win, B is the close-loss band, C and D for further
// misses.
export const TIER_RULES = [
  { tier: 'SS', label: 'Perfect',    ratio: 1.6,  won: true  },
  { tier: 'S',  label: 'Strong win', ratio: 1.3,  won: true  },
  { tier: 'A',  label: 'Win',        ratio: 1.0,  won: true  },
  { tier: 'B',  label: 'Close',      ratio: 0.85, won: false },
  { tier: 'C',  label: 'Missed',     ratio: 0.5,  won: false },
  { tier: 'D',  label: 'Far miss',   ratio: 0,    won: false },
] as const;

// Per-tier Targets-Up rewards. Hidden in non-TU modes via the
// showRewards prop on TierBreakdownModal.
const TU_REWARDS: Record<string, string> = {
  SS: '1 bonus + 1 grid supercharge',
  S: '1 supercharge (bonus or grid)',
  A: 'Advance · no reward',
};

interface Props {
  visible: boolean;
  target: number;
  // 'targets-up' mode adds a Rewards column showing the per-tier
  // payout. Other modes hide it (challenges and free play don't have
  // tier-based rewards).
  showRewards: boolean;
  onClose: () => void;
}

const thresholdFor = (ratio: number, target: number): number => {
  if (ratio === 0) return 0;
  return Math.ceil(target * ratio);
};

export const TierBreakdownModal = ({ visible, target, showRewards, onClose }: Props) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tier Breakdown</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.targetLine}>Target: {target}</Text>

          <View style={styles.sectionDivider} />

          {TIER_RULES.map(rule => {
            const threshold = thresholdFor(rule.ratio, target);
            const isWin = rule.won;
            const accent = isWin
              ? rule.tier === 'SS'
                ? colors.joker
                : colors.success
              : rule.tier === 'B'
                ? colors.warn
                : colors.danger;
            const range =
              rule.ratio === 0
                ? `< ${thresholdFor(0.5, target)}`
                : isWin
                  ? `${threshold}+`
                  : `${threshold}+`;
            return (
              <View key={rule.tier} style={styles.tierRow}>
                <Text
                  style={[
                    styles.tierBadge,
                    { color: accent, borderColor: accent, textShadowColor: accent },
                  ]}
                >
                  {rule.tier}
                </Text>
                <View style={styles.tierMid}>
                  <Text style={styles.tierLabel}>{rule.label}</Text>
                  <Text style={styles.tierRange}>{range}</Text>
                </View>
                {showRewards && rule.won && TU_REWARDS[rule.tier] && (
                  <Text style={styles.tierReward}>{TU_REWARDS[rule.tier]}</Text>
                )}
              </View>
            );
          })}

          <Text style={styles.footnote}>
            {showRewards
              ? 'Targets Up: each win advances you up the ladder; S+ unlocks supercharges.'
              : 'Tier shows on the result screen — based on score ÷ target.'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 18, 0.3),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  targetLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.outlineSoft,
    marginBottom: spacing.sm,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  tierBadge: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    textShadowRadius: 2,
    width: 36,
    textAlign: 'center',
  },
  tierMid: {
    flex: 1,
  },
  tierLabel: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tierRange: {
    // The score threshold is the actual data point the player came
    // here to find — bump it to the same color + size as the tier
    // label so the eye lands on "300+" as easily as on "Win".
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  tierReward: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontStyle: 'italic',
    maxWidth: 130,
    textAlign: 'right',
    lineHeight: 13,
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: spacing.md,
    lineHeight: 14,
  },
});
