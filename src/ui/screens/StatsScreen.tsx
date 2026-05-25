import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Difficulty } from '../../game/rules';
import { NeonButton } from '../components/NeonButton';
import { DifficultyStat, useStats } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

const Difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

type Metric = 'wl' | 'best' | 'average' | 'streak';

const METRIC_ORDER: Metric[] = ['wl', 'best', 'average', 'streak'];

const METRIC_LABEL: Record<Metric, string> = {
  wl: 'W/L',
  best: 'Best',
  average: 'Avg',
  streak: 'Streak',
};

const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const valueFor = (s: DifficultyStat, m: Metric): { value: string; isEmpty: boolean } => {
  switch (m) {
    case 'wl':
      if (s.totalRuns === 0) return { value: '—', isEmpty: true };
      return { value: `${s.wins}-${s.totalRuns - s.wins}`, isEmpty: false };
    case 'best':
      return s.best === null
        ? { value: '—', isEmpty: true }
        : { value: `${s.best}`, isEmpty: false };
    case 'average':
      if (s.totalRuns === 0) return { value: '—', isEmpty: true };
      return { value: `${Math.round(s.totalScore / s.totalRuns)}`, isEmpty: false };
    case 'streak':
      return s.bestStreak === 0
        ? { value: '—', isEmpty: true }
        : { value: `${s.bestStreak}`, isEmpty: false };
  }
};

export const StatsScreen = ({ onBack }: Props) => {
  const { stats } = useStats();
  const [metric, setMetric] = useState<Metric>('wl');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Stats</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Difficulty</Text>
        <View style={styles.toggle}>
          {METRIC_ORDER.map(m => {
            const active = metric === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMetric(m)}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                  {METRIC_LABEL[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.diffList}>
        {Difficulties.map(d => {
          const s = stats.byDifficulty[d];
          const { value, isEmpty } = valueFor(s, metric);
          const showActiveStreak = metric === 'streak' && s.currentStreak > 0;
          return (
            <View key={d} style={styles.diffRow}>
              <Text style={styles.diffLabel}>{d.toUpperCase()}</Text>
              <View style={styles.diffRight}>
                {showActiveStreak && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ON {s.currentStreak}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.diffValue,
                    !isEmpty && styles.diffValueActive,
                  ]}
                >
                  {value}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Recent runs</Text>
      {stats.recent.length === 0 ? (
        <Text style={styles.empty}>No runs yet. Start a Free Play game to begin tracking.</Text>
      ) : (
        <View style={styles.recentBlock}>
          {stats.recent.map((r, i) => (
            <View key={i} style={styles.recentRow}>
              <Text style={styles.recentDate}>{fmtDate(r.ts)}</Text>
              <Text style={styles.recentDiff}>{r.difficulty}</Text>
              <Text style={[styles.recentScore, r.won && styles.recentScoreWon]}>
                {r.score}
              </Text>
              <Text style={styles.recentTarget}>/ {r.target}</Text>
              <Text
                style={[
                  styles.recentOutcome,
                  { color: r.won ? colors.success : colors.danger },
                ]}
              >
                {r.won ? 'W' : 'L'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(107, 214, 255, 0.15)',
    ...glow(colors.accent, 4, 0.4),
  },
  toggleLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  toggleLabelActive: {
    color: colors.accent,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  diffList: { gap: 4 },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  diffLabel: {
    fontFamily: fonts.mono,
    color: colors.textMid,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  diffRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  diffValue: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 50,
    textAlign: 'right',
  },
  diffValueActive: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 6,
  },
  activeBadge: {
    backgroundColor: 'rgba(255, 183, 74, 0.18)',
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    ...glow(colors.warn, 4, 0.6),
  },
  activeBadgeText: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: colors.warn,
    textShadowRadius: 3,
  },
  empty: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  recentBlock: { gap: 2 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  recentDate: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 11,
    width: 56,
  },
  recentDiff: {
    fontFamily: fonts.mono,
    color: colors.textMid,
    fontSize: 11,
    textTransform: 'uppercase',
    flex: 1,
  },
  recentScore: {
    fontFamily: fonts.mono,
    color: colors.textHi,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 50,
    textAlign: 'right',
  },
  recentScoreWon: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  recentTarget: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 11,
    marginLeft: 4,
    width: 36,
  },
  recentOutcome: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '900',
    marginLeft: spacing.sm,
    width: 16,
    textAlign: 'center',
    textShadowRadius: 4,
  },
});
