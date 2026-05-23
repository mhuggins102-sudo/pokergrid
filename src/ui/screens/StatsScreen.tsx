import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NeonButton } from '../components/NeonButton';
import { useStats } from '../stats';
import { colors, fonts, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

const Difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];

const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const StatsScreen = ({ onBack }: Props) => {
  const { stats } = useStats();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Stats</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <View style={styles.summaryRow}>
        <SummaryCell label="Wins" value={`${stats.wins}`} accent={colors.success} />
        <SummaryCell label="Losses" value={`${stats.losses}`} accent={colors.danger} />
        <SummaryCell label="Streak" value={`${stats.streak}`} accent={colors.accent} />
        <SummaryCell label="Best ⤴" value={`${stats.longestStreak}`} accent={colors.warn} />
      </View>

      <Text style={styles.sectionLabel}>Best by difficulty</Text>
      <View style={styles.bestBlock}>
        {Difficulties.map(d => {
          const best = stats.best[d];
          return (
            <View key={d} style={styles.bestRow}>
              <Text style={styles.bestLabel}>{d.toUpperCase()}</Text>
              <Text
                style={[
                  styles.bestScore,
                  best !== null && styles.bestScoreActive,
                ]}
              >
                {best ?? '—'}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Recent runs</Text>
      {stats.recent.length === 0 ? (
        <Text style={styles.empty}>No runs yet. Start a game to begin tracking.</Text>
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

const SummaryCell = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) => (
  <View style={[styles.summaryCell, { borderColor: accent }]}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, { color: accent, textShadowColor: accent }]}>
      {value}
    </Text>
  </View>
);

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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
  },
  summaryLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textLow,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
    textShadowRadius: 6,
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
  bestBlock: { gap: 4 },
  bestRow: {
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
  bestLabel: {
    fontFamily: fonts.mono,
    color: colors.textMid,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  bestScore: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 18,
    fontWeight: '800',
  },
  bestScoreActive: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 6,
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
