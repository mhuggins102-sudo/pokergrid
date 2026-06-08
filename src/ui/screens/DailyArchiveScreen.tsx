// Daily Grid archive — month calendar of past dailies + condensed
// stats panel that mirrors the Free Play Stats screen's structure
// (filter pills on top → W/L · Best · Average · Streak summary →
// Score distribution histogram).
//
// Calendar cells are tone-coded by tier (SS / S / A / B / C / D)
// using the same TIER_COLOR palette the result screen uses, so the
// visual language is consistent across the app:
//   - SS : purple (joker)
//   - S  : green (success)
//   - A  : green (success)
//   - B  : cyan  (accent)
//   - C  : amber (warn)
//   - D  : red   (danger)
//   - unplayed past   : gray panel (tappable)
//   - today unplayed  : cyan border + glow
//   - future / pre-launch : faint, disabled
//
// The calendar always shows all plays — only the panel below responds
// to the difficulty filter. The "This Month" date scope follows the
// currently navigated month in the calendar.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recipeFor } from '../../game/daily/recipe';
import { parseDateISO } from '../../game/daily/seed';
import { Difficulty } from '../../game/rules';
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

// Per-tier color. SS and the win bands (S / A) share the success-green
// palette; B / C / D step down through cyan / amber / red. Matches the
// result-screen ribbon so "what does green mean" reads consistently.
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

// ----------- filter pills -----------
type DateScope = 'all' | 'month';
type DifficultyFilter = 'all' | Difficulty;

const DATE_SCOPE_ORDER: DateScope[] = ['all', 'month'];
const DATE_SCOPE_LABEL: Record<DateScope, string> = {
  all: 'All Time',
  month: 'This Month',
};

const DIFFICULTY_ORDER: DifficultyFilter[] = ['all', 'easy', 'medium', 'hard', 'extreme'];
const DIFFICULTY_LABEL: Record<DifficultyFilter, string> = {
  all: 'All',
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
  extreme: 'Extr',
};

// ----------- summary computation -----------
interface SummaryStats {
  played: number;
  wins: number;
  losses: number;
  best: number | null;        // best score
  totalScore: number;
  longestStreak: number;      // longest run of consecutive winning days
  tierCounts: Record<Tier, number>;
}

const emptyTierCounts = (): Record<Tier, number> => ({
  SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0,
});

// Longest run of consecutive winning DAYS in the scoped play set. A
// non-winning day (loss) or a gap (no play on a date that would have
// extended the chain) breaks the streak. This matches the Wordle-style
// "daily streak" intuition rather than the free-play "consecutive
// wins ignoring time" definition.
const longestStreakInPlays = (plays: DailyPlay[]): number => {
  if (plays.length === 0) return 0;
  const sorted = [...plays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  let best = 0;
  let current = 0;
  let prevDateISO: string | null = null;
  for (const p of sorted) {
    if (!p.won) {
      current = 0;
      prevDateISO = p.dateISO;
      continue;
    }
    let consecutive = false;
    if (prevDateISO !== null) {
      const prev = parseDateISO(prevDateISO);
      const cur = parseDateISO(p.dateISO);
      if (prev && cur) {
        const diffDays = Math.round(
          (cur.getTime() - prev.getTime()) / 86_400_000
        );
        if (diffDays === 1) consecutive = true;
      }
    }
    current = consecutive ? current + 1 : 1;
    if (current > best) best = current;
    prevDateISO = p.dateISO;
  }
  return best;
};

const summarize = (plays: DailyPlay[]): SummaryStats => {
  const tierCounts = emptyTierCounts();
  let wins = 0;
  let best: number | null = null;
  let totalScore = 0;
  for (const p of plays) {
    tierCounts[tierForPlay(p)] += 1;
    if (p.won) wins += 1;
    if (best === null || p.score > best) best = p.score;
    totalScore += p.score;
  }
  return {
    played: plays.length,
    wins,
    losses: plays.length - wins,
    best,
    totalScore,
    longestStreak: longestStreakInPlays(plays),
    tierCounts,
  };
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
  // Date scope defaults to "This Month" — the calendar above is
  // already framed by month, so the stats panel reads as "stats for
  // what I'm currently looking at" by default. The difficulty axis
  // still defaults to "All" so the player sees their full mix until
  // they explicitly narrow it.
  const [dateScope, setDateScope] = useState<DateScope>('month');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');

  const cells = useMemo(() => buildMonthGrid(month), [month]);

  // Plays filtered to the active scope + difficulty.
  const scopedPlays = useMemo(() => {
    if (!plays) return [];
    const all = Object.values(plays);
    const inScope = dateScope === 'all'
      ? all
      : all.filter(p => {
          const d = parseDateISO(p.dateISO);
          if (!d) return false;
          return d.getUTCFullYear() === month.year
            && d.getUTCMonth() === month.month;
        });
    if (difficulty === 'all') return inScope;
    return inScope.filter(p => p.recipe.difficulty === difficulty);
  }, [plays, dateScope, difficulty, month]);

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

  // Pre-format the summary stats so the JSX stays readable.
  const hasPlays = summary.played > 0;
  const wlText = hasPlays ? `${summary.wins}-${summary.losses}` : '—';
  const bestText = summary.best === null ? '—' : `${summary.best}`;
  const avgText = hasPlays
    ? `${Math.round(summary.totalScore / summary.played)}`
    : '—';
  const streakText = summary.longestStreak === 0 ? '—' : `${summary.longestStreak}`;

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
          // Does this date match the active difficulty filter? Played
          // cells use the stored recipe; unplayable (pre-launch /
          // future) cells never match; everything else falls through
          // to recipeFor() which deterministically computes the
          // recipe for that date. This lets an "Easy" filter
          // highlight both completed easy days AND untouched past
          // easy puzzles the player might want to attempt.
          const play = plays?.[dateISO];
          const matchesDifficulty = (() => {
            if (difficulty === 'all') return true;
            if (status.kind === 'pre-launch' || status.kind === 'future') return false;
            const recipeDiff = play
              ? play.recipe.difficulty
              : recipeFor(dateISO).difficulty;
            return recipeDiff === difficulty;
          })();
          const showAsPlayed = status.kind === 'played' && matchesDifficulty;
          // Unplayed past dates that match the active filter get a
          // muted accent border (no glow — glow stays reserved for
          // today). Only triggers when a specific difficulty is
          // selected; with filter=All every unplayed cell is a
          // potential target so the highlight would be noise.
          const showAsMatchUnplayed =
            status.kind === 'unplayed'
            && matchesDifficulty
            && difficulty !== 'all';
          // Today's cyan glow only fires when today's recipe matches
          // the filter — otherwise today gets the same muted gray
          // treatment as any other non-matching cell.
          const showAsToday =
            status.kind === 'today-unplayed' && matchesDifficulty;
          const tierColor =
            showAsPlayed && status.kind === 'played'
              ? TIER_COLOR[status.tier]
              : null;
          const tierBg =
            showAsPlayed && status.kind === 'played'
              ? TIER_BG[status.tier]
              : null;
          return (
            <Pressable
              key={i}
              onPress={() => onCellPress(dateISO)}
              disabled={status.kind === 'pre-launch' || status.kind === 'future'}
              style={[
                styles.cell,
                styles.cellActive,
                showAsPlayed && status.kind === 'played' && {
                  backgroundColor: tierBg!,
                  borderColor: tierColor!,
                  borderWidth: 1,
                },
                // Played-but-filtered-out cells fall through to the
                // same gray panel styling as truly unplayed dates.
                status.kind === 'played' && !showAsPlayed && styles.cellUnplayed,
                showAsMatchUnplayed && styles.cellUnplayedMatch,
                status.kind === 'unplayed' && !showAsMatchUnplayed && styles.cellUnplayed,
                showAsToday && styles.cellTodayUnplayed,
                status.kind === 'today-unplayed' && !showAsToday && styles.cellUnplayed,
                (status.kind === 'pre-launch' || status.kind === 'future') && styles.cellDisabled,
                isToday && showAsToday && styles.cellToday,
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  showAsPlayed && status.kind === 'played' && { color: tierColor! },
                  (status.kind === 'pre-launch' || status.kind === 'future') && styles.cellNumDisabled,
                  isToday && showAsToday && styles.cellNumToday,
                ]}
              >
                {dayNum}
              </Text>
              {showAsPlayed && status.kind === 'played' && (
                <Text style={[styles.cellTier, { color: tierColor! }]}>
                  {status.tier}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ---- Filter pills ---- */}
      <Text style={styles.sectionLabel}>Filter by date & difficulty</Text>
      <View style={styles.toggle}>
        {DATE_SCOPE_ORDER.map(s => {
          const active = dateScope === s;
          return (
            <Pressable
              key={s}
              onPress={() => setDateScope(s)}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                {DATE_SCOPE_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.toggle, styles.toggleSecondRow]}>
        {DIFFICULTY_ORDER.map(d => {
          const active = difficulty === d;
          return (
            <Pressable
              key={d}
              onPress={() => setDifficulty(d)}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                {DIFFICULTY_LABEL[d]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Summary stats + score-distribution histogram, side-by-side
          to keep the panel condensed. The summary takes the left
          column; the histogram fills the right. Both share top-edge
          alignment — the histogram block runs a bit shorter than
          the four summary rows, which is fine. */}
      <View style={styles.statsRow}>
        <View style={styles.summaryCol}>
          <SummaryRow label="W / L" value={wlText} active={hasPlays} />
          <SummaryRow label="Best" value={bestText} active={summary.best !== null} />
          <SummaryRow label="Average" value={avgText} active={hasPlays} />
          <SummaryRow
            label="Streak"
            value={streakText}
            active={summary.longestStreak > 0}
          />
        </View>
        <View style={styles.histogramBlock}>
          {summary.played === 0 ? (
            <Text style={styles.empty}>No runs in this filter yet.</Text>
          ) : (
            <View style={styles.histogram}>
              {TIER_ORDER.map(t => {
                const count = summary.tierCounts[t];
                const max = Math.max(
                  1,
                  ...TIER_ORDER.map(k => summary.tierCounts[k])
                );
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
          )}
        </View>
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

// SummaryRow mirrors the same component in StatsScreen — kept inline
// here rather than extracted so the two screens can evolve their row
// shape independently if they diverge.
const SummaryRow = ({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, active && styles.summaryValueActive]}>
      {value}
    </Text>
  </View>
);

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
  // Untouched past date that matches the active difficulty filter.
  // Same panel + border-width as today-unplayed but no glow, so the
  // player can spot playable puzzles of this difficulty without
  // those matches competing visually with today's "play me now" cue.
  cellUnplayedMatch: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
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
  // Tier letter pinned to the top-right corner of the cell so the
  // day number stays vertically centered. Top-right is the standard
  // badge slot (status pips, app-icon counters) and reads as
  // metadata about the cell rather than as a second equal element.
  cellTier: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ---------------- filter + stats panel ----------------
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
  // Pill-bar styling matches StatsScreen.toggle so the two screens
  // read as siblings.
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    padding: 2,
    gap: 2,
  },
  toggleSecondRow: {
    marginTop: spacing.xs,
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
  },

  // Side-by-side container for summary + histogram. Each column flexes
  // to half the available width so the panel reads as one condensed
  // stats block instead of two stacked full-width sections. No
  // alignItems override — the default 'stretch' makes both columns
  // share the same height, which aligns their bottom edges.
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  // Rows distribute themselves vertically (space-between) so when the
  // summary column stretches to match the histogram's height the
  // extra breathing room is shared evenly across the four rows rather
  // than collected at the bottom as dead space.
  summaryCol: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    // Tightened from StatsScreen's spacing.md horizontal padding —
    // the column is roughly half the width of the Free Play stats
    // page, so the rows need less inner gutter to keep the label +
    // value comfortably spaced.
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  // Label + value sizes are smaller than StatsScreen's (12 / 18) —
  // the narrower column makes the original sizes feel oversized next
  // to the histogram, and the daily values are always short so the
  // smaller numerals still read at a glance.
  summaryLabel: {
    fontFamily: fonts.mono,
    color: colors.textMid,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: fonts.mono,
    color: colors.textLow,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  summaryValueActive: {
    color: colors.success,
  },

  histogramBlock: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
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
});
