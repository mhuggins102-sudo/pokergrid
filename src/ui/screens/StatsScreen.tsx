import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BONUS_DECK_POOL } from '../../game/bonusCards';
import { Difficulty } from '../../game/rules';
import { styleFor as bonusStyleFor } from '../bonusCardCategory';
import { NeonButton } from '../components/NeonButton';
import {
  BonusCardStat,
  DifficultyStat,
  RunRecord,
  Tier,
  TIER_ORDER,
  useStats,
} from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

// Filter selector across the top — "All" plus each difficulty.
type Filter = 'all' | Difficulty;
const FILTER_ORDER: Filter[] = ['all', 'easy', 'medium', 'hard', 'extreme'];
const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
  extreme: 'Extr',
};

const fmtDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// id → BonusCard lookup so we can show the human title in the analytics
// table without keeping a copy of the whole card on every record.
const BONUS_BY_ID = new Map(BONUS_DECK_POOL.map(c => [c.id, c]));

// Histogram tier colors mirror the tier badge palette on the result
// screen so the distribution reads at a glance — SS jokers-purple,
// the win bands green / cyan, loss bands warn / danger.
const TIER_COLOR: Record<Tier, string> = {
  SS: colors.joker,
  S: colors.success,
  A: colors.accent,
  B: colors.warn,
  C: colors.danger,
  D: colors.danger,
};

// Aggregate a DifficultyStat across multiple entries — used by the
// "All" filter to roll Easy / Medium / Hard / Extreme into one block.
const sumDifficultyStats = (entries: DifficultyStat[]): DifficultyStat => {
  let best: number | null = null;
  let totalScore = 0;
  let totalRuns = 0;
  let wins = 0;
  let bestStreak = 0;
  // currentStreak doesn't compose across difficulties cleanly — fall back
  // to 0 in the "All" rollup, since streaks are tracked per-difficulty.
  for (const e of entries) {
    if (e.best !== null && (best === null || e.best > best)) best = e.best;
    totalScore += e.totalScore;
    totalRuns += e.totalRuns;
    wins += e.wins;
    if (e.bestStreak > bestStreak) bestStreak = e.bestStreak;
  }
  return { best, totalScore, totalRuns, wins, bestStreak, currentStreak: 0 };
};

const sumTierCounts = (entries: Record<Tier, number>[]): Record<Tier, number> => {
  const out: Record<Tier, number> = { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const e of entries) {
    for (const t of TIER_ORDER) out[t] += e[t];
  }
  return out;
};

const sumBonusStats = (
  entries: Record<string, BonusCardStat>[]
): Record<string, BonusCardStat> => {
  const out: Record<string, BonusCardStat> = {};
  for (const e of entries) {
    for (const [id, s] of Object.entries(e)) {
      const cur = out[id] ?? { timesHeld: 0, totalShapley: 0 };
      out[id] = {
        timesHeld: cur.timesHeld + s.timesHeld,
        totalShapley: cur.totalShapley + s.totalShapley,
      };
    }
  }
  return out;
};

const TierHistogram = ({ counts }: { counts: Record<Tier, number> }) => {
  const max = Math.max(...TIER_ORDER.map(t => counts[t]), 1);
  const total = TIER_ORDER.reduce((acc, t) => acc + counts[t], 0);
  if (total === 0) {
    return <Text style={styles.empty}>No runs in this filter yet.</Text>;
  }
  return (
    <View style={styles.histogram}>
      {TIER_ORDER.map(t => {
        const count = counts[t];
        const pct = count / max;
        const color = TIER_COLOR[t];
        return (
          <View key={t} style={styles.histRow}>
            <Text style={[styles.histTier, { color, textShadowColor: color }]}>
              {t}
            </Text>
            <View style={styles.histBarTrack}>
              <View
                style={[
                  styles.histBar,
                  {
                    width: `${Math.max(2, pct * 100)}%`,
                    backgroundColor: color,
                    shadowColor: color,
                    shadowOpacity: 0.5,
                    shadowRadius: 3,
                  },
                ]}
              />
            </View>
            <Text style={styles.histCount}>{count}</Text>
          </View>
        );
      })}
    </View>
  );
};

export const StatsScreen = ({ onBack }: Props) => {
  const { stats, reset } = useStats();
  const [confirmReset, setConfirmReset] = useState(false);
  // Default to "All" so the page opens with the most complete summary.
  const [filter, setFilter] = useState<Filter>('all');

  // Aggregated DifficultyStat for the selected filter.
  const filteredStat: DifficultyStat = useMemo(() => {
    if (filter === 'all') {
      return sumDifficultyStats(Object.values(stats.byDifficulty));
    }
    return stats.byDifficulty[filter];
  }, [filter, stats.byDifficulty]);

  // Tier histogram for the selected filter.
  const filteredTiers: Record<Tier, number> = useMemo(() => {
    if (filter === 'all') {
      return sumTierCounts(Object.values(stats.tierCounts));
    }
    return stats.tierCounts[filter];
  }, [filter, stats.tierCounts]);

  // Recent-run rows filtered by the selected difficulty (or unfiltered
  // for "All"). The buffer is still the same RECENT_RUNS_CAP — picking
  // a difficulty just narrows the visible subset.
  const filteredRecent: RunRecord[] = useMemo(() => {
    if (filter === 'all') return stats.recent;
    return stats.recent.filter(r => r.difficulty === filter);
  }, [filter, stats.recent]);

  // Bonus card analytics source for the selected filter. "All" reads
  // the global all-time aggregate (preserves any data recorded before
  // per-difficulty tracking was added); a specific difficulty reads its
  // own per-difficulty aggregate.
  const filteredBonusStats = useMemo<Record<string, BonusCardStat>>(() => {
    if (filter === 'all') return stats.bonusCardStats;
    return stats.bonusCardStatsByDifficulty[filter];
  }, [filter, stats.bonusCardStats, stats.bonusCardStatsByDifficulty]);

  // Bonus card table sort.
  const [bonusSortBy, setBonusSortBy] = useState<'held' | 'avg'>('held');
  const [bonusSortDir, setBonusSortDir] = useState<'desc' | 'asc'>('desc');
  const toggleBonusSort = (col: 'held' | 'avg') => {
    if (bonusSortBy === col) {
      setBonusSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setBonusSortBy(col);
      setBonusSortDir('desc');
    }
  };
  const bonusRows = useMemo(() => {
    const rows = Object.entries(filteredBonusStats)
      .map(([cardId, s]) => ({
        cardId,
        card: BONUS_BY_ID.get(cardId),
        timesHeld: s.timesHeld,
        avg: s.timesHeld > 0 ? s.totalShapley / s.timesHeld : 0,
      }))
      .filter(r => r.card && r.timesHeld > 0);
    rows.sort((a, b) => {
      const va = bonusSortBy === 'held' ? a.timesHeld : a.avg;
      const vb = bonusSortBy === 'held' ? b.timesHeld : b.avg;
      return bonusSortDir === 'desc' ? vb - va : va - vb;
    });
    return rows;
  }, [filteredBonusStats, bonusSortBy, bonusSortDir]);

  // Pre-format the four headline stats so the JSX stays readable.
  const wlText = filteredStat.totalRuns === 0
    ? '—'
    : `${filteredStat.wins}-${filteredStat.totalRuns - filteredStat.wins}`;
  const bestText = filteredStat.best === null ? '—' : `${filteredStat.best}`;
  const avgText = filteredStat.totalRuns === 0
    ? '—'
    : `${Math.round(filteredStat.totalScore / filteredStat.totalRuns)}`;
  const streakText = filteredStat.bestStreak === 0 ? '—' : `${filteredStat.bestStreak}`;
  const showCurrentStreak =
    filter !== 'all' && filteredStat.currentStreak > 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Stats</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.sectionLabel}>Filter by difficulty</Text>
      <View style={styles.toggle}>
        {FILTER_ORDER.map(f => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                {FILTER_LABEL[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summaryBlock}>
        <SummaryRow label="W / L" value={wlText} active={filteredStat.totalRuns > 0} />
        <SummaryRow label="Best" value={bestText} active={filteredStat.best !== null} />
        <SummaryRow label="Average" value={avgText} active={filteredStat.totalRuns > 0} />
        <SummaryRow
          label="Streak"
          value={streakText}
          active={filteredStat.bestStreak > 0}
          rightExtra={showCurrentStreak ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ON {filteredStat.currentStreak}</Text>
            </View>
          ) : undefined}
        />
      </View>

      <Text style={styles.sectionLabel}>Score distribution</Text>
      <View style={styles.histogramBlock}>
        <TierHistogram counts={filteredTiers} />
      </View>

      <Text style={styles.sectionLabel}>Recent runs</Text>
      {filteredRecent.length === 0 ? (
        <Text style={styles.empty}>
          {filter === 'all'
            ? 'No runs yet. Start a Free Play game to begin tracking.'
            : 'No recent runs at this difficulty.'}
        </Text>
      ) : (
        <View style={styles.recentBlock}>
          {filteredRecent.map((r, i) => (
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

      <Text style={styles.sectionLabel}>Bonus cards</Text>
      {bonusRows.length === 0 ? (
        <Text style={styles.empty}>
          {filter === 'all'
            ? 'No bonus card history yet. They get tracked as you finish Free Play runs.'
            : 'No bonus card history at this difficulty yet.'}
        </Text>
      ) : (
        <View style={styles.bonusBlock}>
          <View style={[styles.bonusRow, styles.bonusHeader]}>
            <View style={styles.bonusSwatchSpacer} />
            <Text style={[styles.bonusHeaderCell, styles.bonusNameCell]}>Card</Text>
            <Pressable
              onPress={() => toggleBonusSort('held')}
              style={styles.bonusHeaderBtn}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.bonusHeaderCell,
                  styles.bonusNumberCell,
                  bonusSortBy === 'held' && styles.bonusHeaderActive,
                ]}
              >
                Held{bonusSortBy === 'held' ? (bonusSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleBonusSort('avg')}
              style={styles.bonusHeaderBtn}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.bonusHeaderCell,
                  styles.bonusNumberCell,
                  bonusSortBy === 'avg' && styles.bonusHeaderActive,
                ]}
              >
                Avg{bonusSortBy === 'avg' ? (bonusSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </Text>
            </Pressable>
          </View>
          {bonusRows.map(r => {
            const tone = bonusStyleFor(r.card!);
            const avgInt = Math.round(r.avg);
            const sign = avgInt > 0 ? '+' : '';
            return (
              <View key={r.cardId} style={styles.bonusRow}>
                <View style={[styles.bonusSwatch, { backgroundColor: tone.borderColor }]} />
                <Text
                  style={[styles.bonusName, { color: tone.titleColor }]}
                  numberOfLines={1}
                >
                  {r.card!.title}
                </Text>
                <Text style={[styles.bonusNumber, styles.bonusNumberCell]}>
                  ×{r.timesHeld}
                </Text>
                <Text
                  style={[
                    styles.bonusNumber,
                    styles.bonusNumberCell,
                    avgInt > 0 && styles.bonusNumberActive,
                    avgInt < 0 && styles.bonusNumberLoss,
                  ]}
                >
                  {avgInt === 0 ? '—' : `${sign}${avgInt}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.dataBlock}>
        <Text style={styles.sectionLabel}>Data</Text>
        <Text style={styles.dataCopy}>
          Stats and preferences are stored locally on this device. Clearing the browser data or
          deleting the app removes them.
        </Text>
        {!confirmReset ? (
          <NeonButton
            label="Reset stats"
            variant="danger"
            onPress={() => setConfirmReset(true)}
          />
        ) : (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmText}>Erase all stats and history?</Text>
            <View style={styles.confirmBtns}>
              <NeonButton
                label="Cancel"
                variant="secondary"
                size="sm"
                onPress={() => setConfirmReset(false)}
              />
              <NeonButton
                label="Yes, reset"
                variant="danger"
                size="sm"
                onPress={() => {
                  reset();
                  setConfirmReset(false);
                }}
              />
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const SummaryRow = ({
  label,
  value,
  active,
  rightExtra,
}: {
  label: string;
  value: string;
  active: boolean;
  rightExtra?: React.ReactNode;
}) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <View style={styles.summaryRight}>
      {rightExtra}
      <Text style={[styles.summaryValue, active && styles.summaryValueActive]}>
        {value}
      </Text>
    </View>
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
  // Five-button filter pill across the top. Same visual treatment as
  // the old metric toggle so the difference is just what each button
  // does, not how the row looks.
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
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
  summaryBlock: { gap: 4, marginTop: spacing.md },
  summaryRow: {
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
  summaryLabel: {
    fontFamily: fonts.mono,
    color: colors.textMid,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryValue: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 64,
    textAlign: 'right',
  },
  summaryValueActive: {
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
  // Score-distribution histogram. One horizontal bar per tier; the bar
  // width is the tier's run count normalized to the largest bin in the
  // current filter.
  histogramBlock: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  histogram: { gap: 6 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  histTier: {
    width: 26,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowRadius: 4,
  },
  histBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: colors.bgBase,
    borderRadius: 2,
    overflow: 'hidden',
  },
  histBar: {
    height: '100%',
    borderRadius: 2,
  },
  histCount: {
    width: 32,
    textAlign: 'right',
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
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
  bonusBlock: { gap: 2 },
  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.sm,
  },
  bonusHeader: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingVertical: 2,
  },
  bonusSwatchSpacer: { width: 8 },
  bonusHeaderCell: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  bonusNameCell: { flex: 1 },
  bonusHeaderBtn: { width: 56 },
  bonusHeaderActive: {
    color: colors.accent,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  bonusSwatch: {
    width: 8,
    height: 24,
    borderRadius: 2,
  },
  bonusName: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bonusNumberCell: {
    width: 56,
    textAlign: 'right',
    flex: 0,
  },
  bonusNumber: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMid,
  },
  bonusNumberActive: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  bonusNumberLoss: {
    color: colors.danger,
  },
  // Data section at the bottom of the page — visually separated from
  // the stats blocks above by a top margin. The destructive Reset
  // stats button lives here (moved out of Settings) so the same
  // page that surfaces your run history also offers the way to
  // clear it.
  dataBlock: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.outlineSoft,
  },
  dataCopy: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  confirmRow: { gap: spacing.sm },
  confirmText: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
});
