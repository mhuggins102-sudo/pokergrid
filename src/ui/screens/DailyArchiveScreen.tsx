// Daily Grid archive — month calendar of past dailies.
//
// Cells are tone-coded:
//   - green : played and beat the target on that date
//   - amber : played but didn't beat the target
//   - gray  : past date the player hasn't tried yet (tappable to play)
//   - faint : future date or before-launch (disabled)
//   - cyan  : today (highlighted regardless of played status)
//
// Tapping a played cell opens that date's stored ResultScreen.
// Tapping an unplayed past cell launches a fresh game seeded by that
// date. Late entries count fully toward the leaderboard for that date.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recipeFor } from '../../game/daily/recipe';
import { parseDateISO } from '../../game/daily/seed';
import { DailyRulesModal } from '../components/DailyRulesModal';
import { NeonButton } from '../components/NeonButton';
import { useDaily } from '../daily/DailyProvider';
import { DailyPlay } from '../daily/localStore';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  // Start playing a specific past daily. App.tsx handles the
  // playContext + screen transition. omit = today's daily.
  onStartDaily: (dateISO: string) => void;
  // View the result screen for an already-played daily.
  onOpenResult: (dateISO: string) => void;
}

// Earliest date the player can navigate to / play in the archive.
// Pre-launch dates aren't surfaced because no one was around to play
// them — they'd just be empty leaderboards.
const LAUNCH_DATE_ISO = '2026-05-01';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Day-of-week header. Sunday-first matches the most common US-locale
// calendar convention. Localization is a Phase 4 nicety.
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface CellMonthMeta {
  // Year + month identify the visible page.
  year: number;
  // 0..11
  month: number;
}

// Generate the 7×6 grid of dateISOs for a given month. Cells outside
// the month proper return null (rendered as blanks). Cells before
// LAUNCH_DATE_ISO and after today are still returned but the consumer
// renders them disabled.
const buildMonthGrid = (meta: CellMonthMeta): (string | null)[] => {
  const firstOfMonth = new Date(Date.UTC(meta.year, meta.month, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0..6, Sun-first
  const daysInMonth = new Date(
    Date.UTC(meta.year, meta.month + 1, 0)
  ).getUTCDate();
  const cells: (string | null)[] = [];
  // Leading blanks so the first-of-month lands under the right day of
  // week.
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const y = meta.year;
    const m = String(meta.month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push(`${y}-${m}-${dd}`);
  }
  // Pad trailing cells to fill the last week (so the grid is always
  // a multiple of 7).
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

// "Is this month earlier than the launch month?" used to gate the
// prev-month arrow.
const monthIsBeforeLaunch = (m: CellMonthMeta): boolean => {
  const launch = parseDateISO(LAUNCH_DATE_ISO);
  if (!launch) return false;
  const launchY = launch.getUTCFullYear();
  const launchM = launch.getUTCMonth();
  return m.year < launchY || (m.year === launchY && m.month < launchM);
};

// "Is this month later than the current month?" used to gate the
// next-month arrow. The current month is the latest valid view.
const monthIsAfterCurrent = (m: CellMonthMeta, todayISO: string): boolean => {
  const today = parseDateISO(todayISO);
  if (!today) return false;
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth();
  return m.year > ty || (m.year === ty && m.month > tm);
};

// Per-cell status drives both the visual style and the tap handler.
type CellStatus = 'won' | 'lost' | 'unplayed' | 'today-unplayed' | 'future' | 'pre-launch';

const cellStatusFor = (
  dateISO: string,
  todayISO: string,
  play: DailyPlay | undefined
): CellStatus => {
  const isToday = dateISO === todayISO;
  if (dateISO < LAUNCH_DATE_ISO) return 'pre-launch';
  if (dateISO > todayISO) return 'future';
  if (play) return play.won ? 'won' : 'lost';
  if (isToday) return 'today-unplayed';
  return 'unplayed';
};

export const DailyArchiveScreen = ({
  onBack,
  onStartDaily,
  onOpenResult,
}: Props) => {
  const { plays, todayISO } = useDaily();
  const today = parseDateISO(todayISO)!;

  // The visible month — defaults to whatever today is in. Tracks
  // independently of todayISO so a session crossing midnight doesn't
  // jump the view.
  const [month, setMonth] = useState<CellMonthMeta>({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
  });

  // Pending "start this date" intent — surfaced as a rules-modal
  // confirmation so the player commits intentionally (same flow as
  // today's daily on landing).
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  const cells = useMemo(() => buildMonthGrid(month), [month]);

  // Cumulative stats for the visible month — small "X / Y played"
  // and "N won" summary above the grid.
  const monthStats = useMemo(() => {
    if (!plays) return { played: 0, won: 0 };
    let played = 0;
    let won = 0;
    for (const dateISO of cells) {
      if (!dateISO) continue;
      const p = plays[dateISO];
      if (!p) continue;
      played += 1;
      if (p.won) won += 1;
    }
    return { played, won };
  }, [cells, plays]);

  const canGoBack = !monthIsBeforeLaunch(prevMonth(month));
  const canGoForward = !monthIsAfterCurrent(nextMonth(month), todayISO);

  const onCellPress = (dateISO: string | null) => {
    if (!dateISO || !plays) return;
    const status = cellStatusFor(dateISO, todayISO, plays[dateISO]);
    if (status === 'pre-launch' || status === 'future') return;
    if (status === 'won' || status === 'lost') {
      onOpenResult(dateISO);
      return;
    }
    // unplayed or today-unplayed → confirm before committing.
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
          const play = plays?.[dateISO];
          const dayNum = Number(dateISO.slice(-2));
          return (
            <Pressable
              key={i}
              onPress={() => onCellPress(dateISO)}
              disabled={status === 'pre-launch' || status === 'future'}
              style={[
                styles.cell,
                styles.cellActive,
                status === 'won' && styles.cellWon,
                status === 'lost' && styles.cellLost,
                status === 'unplayed' && styles.cellUnplayed,
                status === 'today-unplayed' && styles.cellTodayUnplayed,
                (status === 'pre-launch' || status === 'future') && styles.cellDisabled,
                isToday && styles.cellToday,
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  status === 'won' && styles.cellNumWon,
                  status === 'lost' && styles.cellNumLost,
                  (status === 'pre-launch' || status === 'future') && styles.cellNumDisabled,
                  isToday && styles.cellNumToday,
                ]}
              >
                {dayNum}
              </Text>
              {play && (
                <Text style={styles.cellScore}>{play.score}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.cellWon]} />
          <Text style={styles.legendLabel}>Beat target</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.cellLost]} />
          <Text style={styles.legendLabel}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.cellUnplayed]} />
          <Text style={styles.legendLabel}>Unplayed</Text>
        </View>
      </View>

      <Text style={styles.monthStats}>
        {monthLabel(month)} · {monthStats.won} won / {monthStats.played} played
      </Text>

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
    // Each row holds 7 cells, so width is computed as ~14.28% per cell
    // with a small gap. flexBasis keeps spacing consistent on different
    // viewport widths.
    flexBasis: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellActive: {
    borderRadius: radius.sm,
  },
  cellWon: {
    backgroundColor: 'rgba(92, 255, 154, 0.22)',
    borderColor: colors.success,
    borderWidth: 1,
  },
  cellLost: {
    backgroundColor: 'rgba(255, 183, 74, 0.18)',
    borderColor: colors.warn,
    borderWidth: 1,
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
    // Stronger glow on top of the per-status border.
    ...glow(colors.accent, 6, 0.5),
  },
  cellNum: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
  },
  cellNumWon: {
    color: colors.success,
  },
  cellNumLost: {
    color: colors.warn,
  },
  cellNumDisabled: {
    color: colors.textLow,
    opacity: 0.4,
  },
  cellNumToday: {
    color: colors.accent,
  },
  cellScore: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 8,
    marginTop: 1,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
  },
  legendLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  monthStats: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
