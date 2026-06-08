// Daily Grid archive — month calendar of past dailies + condensed
// stats panel.
//
// Calendar cells are tone-coded by tier (SS / S / A / B / C / D)
// using the same TIER_COLOR palette the result screen + stats screen
// use, so the visual language is consistent across the app:
//   - SS : purple (joker)
//   - S  : green (success) — labeled with the letter
//   - A  : green (success)
//   - B  : cyan  (accent)
//   - C  : amber (warn)
//   - D  : red   (danger)
//   - unplayed past   : gray panel (tappable)
//   - today unplayed  : cyan border + glow
//   - future / pre-launch : faint, disabled
//
// Below the calendar: a scope toggle (This Month / All Time), three
// stat boxes (Played / Wins / Best tier), and a tier distribution
// histogram. Mirrors StatsScreen's tier chart at a smaller scale.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recipeFor } from '../../game/daily/recipe';
import { parseDateISO } from '../../game/daily/seed';
import { DailyRulesModal } from '../components/DailyRulesModal';
import { NeonButton } from '../components/NeonButton';
import { useDaily } from '../daily/DailyProvider';
import { DailyPlay } from '../daily/localStore';
import { Tier, TIER_ORDER, tierForRun } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  onStartDaily: (dateISO: string) => void;
  onOpenResult: (dateISO: string) => void;
}

const LAUNCH_DATE_ISO = '2026-05-01';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Per-tier color. Same palette as ResultScreen's TIER_COLOR map so
// "what does green mean" reads consistently across the app.
const TIER_COLOR: Record<Tier, string> = {
  SS: colors.joker,
  S: colors.success,
  A: colors.success,
  B: colors.accent,
  C: colors.warn,
  D: colors.danger,
};

// Background tints (12-22% alpha of the tier color) so the cell
// reads "filled with tier color" without overwhelming the day
// number.
const TIER_BG: Record<Tier, string> = {
  SS: 'rgba(184, 130, 255, 0.22)',
  S: 'rgba(92, 255, 154, 0.22)',
  A: 'rgba(92, 255, 154, 0.18)',
  B: 'rgba(107, 214, 255, 0.18)',
  C: 'rgba(255, 183, 74, 0.18)',
  D: 'rgba(255, 100, 100, 0.18)',
};

interface CellMonthMeta {
  year: number;
  month: number;
}

const buildMonthGrid = (meta: CellMonthMeta): (string | null)[] => {
  const firstOfMonth = new Date(Date.UTC(meta.year, meta.month, 1));
  const startDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(meta.year, meta.month + 1, 0)
  ).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const y = meta.year;
    const m = String(meta.month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push(`${y}-${m}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const monthLabel = (meta: CellMonthMeta): string =>
  `${MONTH_NAMES[meta.month]} ${meta.year}`;

const prevMonth = (m: CellMonthMeta): CellMonthMeta =>
  m.month === 0
    ? { year: m.year - 1, month: 11 }
    : { year: m.year, month: m.month - 1 };

const nextMonth = (m: CellMonthMeta): CellMonthMeta =>
  m.month === 11
    ? { year: m.year + 1, month: 0 }
    : { year: m.year, month: m.month + 1 };

const monthIsBeforeLaunch = (m: CellMonthMeta): boolean => {
  const launch = parseDateISO(LAUNCH_DATE_ISO);
  if (!launch) return false;
  const launchY = launch.getUTCFullYear();
  const launchM = launch.getUTCMonth();
  return m.year < launchY || (m.year === launchY && m.month < launchM);
};

const monthIsAfterCurrent = (m: CellMonthMeta, todayISO: string): boolean => {
  const today = parseDateISO(todayISO);
  if (!today) return false;
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth();
  return m.year > ty || (m.year === ty && m.month > tm);
};

// Tier computed from the stored play. Uses the run's recorded
// difficulty + target (snapshotted on the GameState at game-over)
// so a recipe-config change later won't retroactively shift tiers.
const tierForPlay = (play: DailyPlay): Tier =>
  tierForRun({
    ts: play.completedAt,
    difficulty: play.state.difficulty,
    score: play.score,
    target: play.state.target,
    won: play.won,
  });

type CellStatus =
  | { kind: 'played'; tier: Tier }
  | { kind: 'unplayed' }
  | { kind: 'today-unplayed' }
  | { kind: 'future' }
  | { kind: 'pre-launch' };

const cellStatusFor = (
  dateISO: string,
  todayISO: string,
  play: DailyPlay | undefined
): CellStatus => {
  const isToday = dateISO === todayISO;
  if (dateISO < LAUNCH_DATE_ISO) return { kind: 'pre-launch' };
  if (dateISO > todayISO) return { kind: 'future' };
  if (play) return { kind: 'played', tier: tierForPlay(play) };
  if (isToday) return { kind: 'today-unplayed' };
  return { kind: 'unplayed' };
};

// Stats panel state — scope toggle between the visible month and the
// player's entire daily history.
type Scope = 'month' | 'all';

interface StatsSummary {
  played: number;
  wins: number;        // A / S / SS
  best: Tier | null;   // highest tier achieved
  tierCounts: Record<Tier, number>;
}

const emptyTierCounts = (): Record<Tier, number> => ({
  SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0,
});

const TIER_RANK: Record<Tier, number> = { SS: 5, S: 4, A: 3, B: 2, C: 1, D: 0 };

const summarize = (plays: DailyPlay[]): StatsSummary => {
  const tierCounts = emptyTierCounts();
  let best: Tier | null = null;
  let wins = 0;
  for (const p of plays) {
    const t = tierForPlay(p);
    tierCounts[t] += 1;
    if (t === 'A' || t === 'S' || t === 'SS') wins += 1;
    if (best === null || TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return { played: plays.length, wins, best, tierCounts };
};

export const DailyArchiveScreen = ({
  onBack,
  onStartDaily,
  onOpenResult,
}: Props) => {
  const { plays, todayISO } = useDaily();
  const today = parseDateISO(todayISO)!;

  const [month, setMonth] = useState<CellMonthMeta>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
  });
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('month');

  const cells = useMemo(() => buildMonthGrid(month), [month]);

  // Plays filtered to the current scope. "month" walks the visible
  // calendar cells; "all" walks every recorded play regardless of
  // which month it was played in.
  const scopedPlays = useMemo(() => {
    if (!plays) return [];
    if (scope === 'all') return Object.values(plays);
    const out: DailyPlay[] = [];
    for (const dateISO of cells) {
      if (!dateISO) continue;
      const p = plays[dateISO];
      if (p) out.push(p);
    }
    return out;
  }, [cells, plays, scope]);

  const summary = useMemo(() => summarize(scopedPlays), [scopedPlays]);

  const canGoBack = !monthIsBeforeLaunch(prevMonth(month));
  const canGoForward = !monthIsAfterCurrent(nextMonth(month), todayISO);

  const onCellPress = (dateISO: string | null) => {
    if (!dateISO || !plays) return;
    const status = cellStatusFor(dateISO, todayISO, plays[dateISO]);
    if (status.kind === 'pre-launch' || status.kind === 'future') return;
    if (status.kind === 'played') {
      onOpenResult(dateISO);
      return;
    }
    setPendingStart(dateISO);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Daily Archive</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <View style={styles.monthNavRow}>
        <Pressable
          onPress={() => canGoBack && setMonth(m => prevMonth(m))}
          disabled={!canGoBack}
          hitSlop={8}
          style={[styles.monthArrow, !canGoBack && styles.monthArrowDisabled]}
        >
          <Text style={styles.monthArrowText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Pressable
          onPress={() => canGoForward && setMonth(m => nextMonth(m))}
          disabled={!canGoForward}
          hitSlop={8}
          style={[styles.monthArrow, !canGoForward && styles.monthArrowDisabled]}
        >
          <Text style={styles.monthArrowText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.dowRow}>
        {DOW_LABELS.map((d, i) => (
          <Text key={i} style={styles.dowCell}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((dateISO, i) => {
          if (!dateISO) {
            return <View key={i} style={styles.cell} />;
          }
          const status = cellStatusFor(dateISO, todayISO, plays?.[dateISO]);
          const isToday = dateISO === todayISO;
          const dayNum = Number(dateISO.slice(-2));
          // Color resolved from the cell status — played cells use the
          // tier palette, others use the existing gray/cyan/faint.
          const tierColor =
            status.kind === 'played' ? TIER_COLOR[status.tier] : null;
          const tierBg =
            status.kind === 'played' ? TIER_BG[status.tier] : null;
          return (
            <Pressable
              key={i}
              onPress={() => onCellPress(dateISO)}
              disabled={status.kind === 'pre-launch' || status.kind === 'future'}
              style={[
                styles.cell,
                styles.cellActive,
                status.kind === 'played' && {
                  backgroundColor: tierBg!,
                  borderColor: tierColor!,
                  borderWidth: 1,
                },
                status.kind === 'unplayed' && styles.cellUnplayed,
                status.kind === 'today-unplayed' && styles.cellTodayUnplayed,
                (status.kind === 'pre-launch' || status.kind === 'future') && styles.cellDisabled,
                isToday && styles.cellToday,
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  status.kind === 'played' && { color: tierColor! },
                  (status.kind === 'pre-launch' || status.kind === 'future') && styles.cellNumDisabled,
                  isToday && styles.cellNumToday,
                ]}
              >
                {dayNum}
              </Text>
              {status.kind === 'played' && (
                <Text style={[styles.cellTier, { color: tierColor! }]}>
                  {status.tier}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ---- Stats panel ---- */}
      <View style={styles.scopeToggleRow}>
        <Pressable
          onPress={() => setScope('month')}
          style={[
            styles.scopePill,
            scope === 'month' && styles.scopePillActive,
          ]}
        >
          <Text
            style={[
              styles.scopePillText,
              scope === 'month' && styles.scopePillTextActive,
            ]}
          >
            This Month
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setScope('all')}
          style={[
            styles.scopePill,
            scope === 'all' && styles.scopePillActive,
          ]}
        >
          <Text
            style={[
              styles.scopePillText,
              scope === 'all' && styles.scopePillTextActive,
            ]}
          >
            All Time
          </Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>PLAYED</Text>
          <Text style={styles.statValue}>{summary.played}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>WINS</Text>
          <Text style={[styles.statValue, styles.statValueWins]}>
            {summary.wins}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>BEST</Text>
          <Text
            style={[
              styles.statValue,
              summary.best ? { color: TIER_COLOR[summary.best] } : null,
            ]}
          >
            {summary.best ?? '—'}
          </Text>
        </View>
      </View>

      <View style={styles.histBlock}>
        <Text style={styles.histTitle}>Tier Distribution</Text>
        {TIER_ORDER.map(t => {
          const count = summary.tierCounts[t];
          const max = Math.max(1, ...Object.values(summary.tierCounts));
          const pct = count / max;
          const color = TIER_COLOR[t];
          return (
            <View key={t} style={styles.histRow}>
              <Text style={[styles.histTier, { color }]}>{t}</Text>
              <View style={styles.histBarTrack}>
                <View
                  style={[
                    styles.histBar,
                    {
                      width: `${Math.max(2, pct * 100)}%`,
                      backgroundColor: count > 0 ? color : colors.outlineSoft,
                      opacity: count > 0 ? 1 : 0.3,
                    },
                  ]}
                />
              </View>
              <Text style={styles.histCount}>{count}</Text>
            </View>
          );
        })}
      </View>

      {pendingStart && (
        <DailyRulesModal
          visible
          dateISO={pendingStart}
          recipe={recipeFor(pendingStart)}
          onStart={() => {
            const target = pendingStart;
            setPendingStart(null);
            onStartDaily(target);
          }}
          onClose={() => setPendingStart(null)}
        />
      )}
    </ScrollView>
  );
};

// Sanity check at import time: the launch date must be a valid ISO
// string. Catches typos in the constant above before they ship.
if (!parseDateISO(LAUNCH_DATE_ISO)) {
  throw new Error(`Invalid LAUNCH_DATE_ISO: ${LAUNCH_DATE_ISO}`);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    ...glow(colors.accent, 4, 0.3),
  },
  monthArrowDisabled: {
    borderColor: colors.outlineSoft,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.4,
  },
  monthArrowText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '900',
  },
  monthLabel: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    minWidth: 160,
    textAlign: 'center',
  },
  dowRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  dowCell: {
    flex: 1,
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexBasis: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellActive: {
    borderRadius: radius.sm,
  },
  cellUnplayed: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.outlineSoft,
    borderWidth: 1,
  },
  cellTodayUnplayed: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    ...glow(colors.accent, 4, 0.3),
  },
  cellDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  cellToday: {
    ...glow(colors.accent, 6, 0.5),
  },
  cellNum: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
  },
  cellNumDisabled: {
    color: colors.textLow,
    opacity: 0.4,
  },
  cellNumToday: {
    color: colors.accent,
  },
  // Tiny tier badge in the bottom of the cell — visible only on
  // played cells. SS shows "SS"; everything else single-letter.
  cellTier: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ---------------- stats panel ----------------
  scopeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  scopePill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.bgPanel,
  },
  scopePillActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(107, 214, 255, 0.08)',
  },
  scopePillText: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  scopePillTextActive: {
    color: colors.accent,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgPanel,
    borderColor: colors.outlineSoft,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  statValue: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statValueWins: {
    color: colors.success,
  },
  histBlock: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.outlineSoft,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  histTitle: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  histTier: {
    width: 22,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  histBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.bgBase,
    borderRadius: 2,
    overflow: 'hidden',
  },
  histBar: {
    height: '100%',
    borderRadius: 2,
  },
  histCount: {
    width: 28,
    textAlign: 'right',
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
});
