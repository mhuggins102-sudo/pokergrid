import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BONUS_DECK_POOL } from '../../game/bonusCards';
import type { Difficulty } from '../../game/rules';
import { styleFor as bonusStyleFor } from '../bonusCardCategory';
import { NeonButton } from '../components/NeonButton';
import { DifficultyStat, RunRecord, useStats } from '../stats';
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

// Score-trend sparkline. Each data point is one historical run (oldest on
// the left, newest on the right); bar height is the score normalized
// against the series max + the target reference. Bars are colored by
// outcome so the win / loss pattern reads at a glance.
//
// Implemented with plain Views — no SVG / chart library — so it stays
// within the existing render tooling and respects the WebScaler width.
const SPARKLINE_HEIGHT = 56;

interface SparkPoint {
  score: number;
  won: boolean;
}

const Sparkline = ({ data, target }: { data: SparkPoint[]; target: number }) => {
  if (data.length === 0) return null;
  const max = Math.max(target, ...data.map(d => d.score), 1);
  const targetY = (target / max) * SPARKLINE_HEIGHT;
  return (
    <View style={[styles.sparkline, { height: SPARKLINE_HEIGHT }]}>
      <View
        pointerEvents="none"
        style={[styles.sparkTargetLine, { bottom: targetY }]}
      />
      {data.map((d, i) => {
        const h = Math.max(2, (d.score / max) * SPARKLINE_HEIGHT);
        const color = d.won ? colors.success : colors.danger;
        return (
          <View key={i} style={styles.sparkSlot}>
            <View
              style={[
                styles.sparkBar,
                {
                  height: h,
                  backgroundColor: color,
                  shadowColor: color,
                  shadowOpacity: 0.5,
                  shadowRadius: 2,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
};

const recentForDifficulty = (recent: RunRecord[], d: Difficulty): SparkPoint[] => {
  // Oldest → newest left-to-right; cap and reverse since `recent` is newest-first.
  return recent
    .filter(r => r.difficulty === d)
    .map(r => ({ score: r.score, won: r.won }))
    .reverse();
};

// Target each difficulty's chart line is drawn against. Mirrors the score
// thresholds in src/game/rules.ts.
const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 300,
  medium: 400,
  hard: 500,
};

// id → BonusCard lookup so we can show the human title in the analytics
// table without keeping a copy of the whole card on every record.
const BONUS_BY_ID = new Map(BONUS_DECK_POOL.map(c => [c.id, c]));

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
  // Bonus card table sort. Default to frequency desc; tapping a column
  // header switches sort key (resets to desc), tapping it again flips to
  // asc — matches the pattern most data tables use so the gesture is
  // self-discoverable.
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

  // Bonus card analytics — only cards that appeared at least once,
  // sorted by the currently-selected column.
  const bonusRows = useMemo(() => {
    const rows = Object.entries(stats.bonusCardStats)
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
  }, [stats.bonusCardStats, bonusSortBy, bonusSortDir]);

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

      <Text style={styles.sectionLabel}>Score trend</Text>
      <View style={styles.trendBlock}>
        {Difficulties.map(d => {
          const series = recentForDifficulty(stats.recent, d);
          return (
            <View key={d} style={styles.trendRow}>
              <View style={styles.trendLabelCol}>
                <Text style={styles.trendLabel}>{d.toUpperCase()}</Text>
                <Text style={styles.trendCount}>
                  {series.length === 0
                    ? 'no runs'
                    : `${series.length} run${series.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <View style={styles.trendChartCol}>
                {series.length === 0 ? (
                  <Text style={styles.trendEmpty}>—</Text>
                ) : (
                  <Sparkline data={series} target={TARGET_BY_DIFFICULTY[d]} />
                )}
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

      <Text style={styles.sectionLabel}>Bonus cards</Text>
      {bonusRows.length === 0 ? (
        <Text style={styles.empty}>
          No bonus card history yet. They get tracked as you finish Free Play runs.
        </Text>
      ) : (
        <View style={styles.bonusBlock}>
          <View style={[styles.bonusRow, styles.bonusHeader]}>
            {/* swatch column spacer keeps "Card" left-aligned with row content */}
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
  trendBlock: { gap: 6 },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    gap: spacing.md,
  },
  trendLabelCol: { width: 64 },
  trendLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  trendCount: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 2,
  },
  trendChartCol: { flex: 1 },
  trendEmpty: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 14,
    textAlign: 'center',
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    position: 'relative',
  },
  sparkSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  sparkBar: {
    width: '70%',
    borderRadius: 1.5,
  },
  // Faint horizontal line at the target score so it's obvious which runs
  // cleared the threshold and which fell short — without needing a per-bar
  // tooltip.
  sparkTargetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderColor: colors.outlineStrong,
    borderStyle: 'dashed',
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
  // Same 8px reserved space as the row's color swatch so "Card" aligns
  // with the name column underneath rather than the swatch underneath.
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
  // Match the data row's bonusNumberCell width so the Held / Avg columns
  // line up across header and rows.
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
});
