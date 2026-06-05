// Daily Grid result-screen panel. Sits where the SS/A/B tier badge
// lives on Free Play / Targets-Up / Challenge results. Phase 2 wires
// it to Supabase: rank line + 15-bin score histogram with the
// player's bucket highlighted and a median marker.
//
// Status-driven render — the hook reports one of:
//   - 'backend-unavailable'  → "local result" placeholder
//   - 'pending' / 'loading'  → skeleton bars
//   - 'rank-pending'         → "Submitting…"
//   - 'ready'                → real rank + histogram
//   - 'error'                → retry CTA

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayNameFor, useDaily } from '../daily/DailyProvider';
import {
  HistogramBin,
  HistogramSnapshot,
  RankSnapshot,
} from '../daily/supabase';
import { useDailyRank } from '../hooks/useDailyRank';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  dateISO: string;
  score: number;
  // True when the play was just submitted (game just ended). False
  // when re-opening a historical play. Affects the kicker copy
  // ("Saved" vs nothing).
  freshlySubmitted: boolean;
}

const HISTOGRAM_BAR_COUNT = 15;
const HISTOGRAM_HEIGHT = 70;

const formatDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
};

// Find which histogram bin contains the player's score. Returns null
// when the bins haven't loaded or the score is outside the range.
const playerBinIndex = (bins: HistogramBin[], score: number): number | null => {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    // Last bin's upper bound is inclusive so the top scorer doesn't
    // fall off the right edge.
    const isLast = i === bins.length - 1;
    if (score >= b.lo && (isLast ? score <= b.hi : score < b.hi)) return i;
  }
  return null;
};

const Histogram = ({
  data,
  playerScore,
}: {
  data: HistogramSnapshot;
  playerScore: number;
}) => {
  const bins = data.bins;
  if (bins.length === 0) return null;
  const maxCount = Math.max(1, ...bins.map(b => b.count));
  const playerBin = playerBinIndex(bins, playerScore);
  return (
    <View style={styles.histogramWrap}>
      <View style={styles.histogramRow}>
        {bins.map((b, i) => {
          const isPlayer = i === playerBin;
          const heightPct = (b.count / maxCount) * 100;
          return (
            <View key={i} style={styles.barColumn}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.max(heightPct, 4)}%` },
                  isPlayer && styles.barPlayer,
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.histogramFooter}>
        <Text style={styles.histogramAxis}>{data.min}</Text>
        {data.median !== null && (
          <Text style={styles.histogramMedian}>
            median {Math.round(data.median)}
          </Text>
        )}
        <Text style={styles.histogramAxis}>{data.max}</Text>
      </View>
    </View>
  );
};

const Skeleton = () => (
  <View style={styles.histogramWrap}>
    <View style={styles.histogramRow}>
      {Array.from({ length: HISTOGRAM_BAR_COUNT }, (_, i) => (
        <View key={i} style={styles.barColumn}>
          <View style={[styles.bar, styles.barSkeleton, { height: `${20 + ((i * 7) % 60)}%` }]} />
        </View>
      ))}
    </View>
    <View style={styles.histogramFooter}>
      <Text style={styles.histogramAxis}>loading…</Text>
    </View>
  </View>
);

const RankLine = ({ rank }: { rank: RankSnapshot }) => (
  <Text style={styles.rankLine}>
    <Text style={styles.rankNum}>#{rank.rank}</Text>
    <Text style={styles.rankOf}> of {rank.total}</Text>
    <Text style={styles.rankSep}>  ·  </Text>
    <Text style={styles.rankTop}>top {rank.topPercent}%</Text>
  </Text>
);

export const RankPanel = ({ dateISO, score, freshlySubmitted }: Props) => {
  const { deviceId, handle } = useDaily();
  const { status, rank, histogram, refresh } = useDailyRank(dateISO);

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>DAILY · {formatDate(dateISO)}</Text>
      <Text style={styles.score}>{score}</Text>
      <Text style={styles.handle}>{displayNameFor(deviceId, handle)}</Text>

      {/* Status-driven body. The histogram height + bar count stay
          fixed across states so the layout doesn't jump as we move
          from skeleton → real data. */}
      {status === 'ready' && rank && histogram ? (
        <>
          <RankLine rank={rank} />
          <Histogram data={histogram} playerScore={score} />
        </>
      ) : status === 'loading' || status === 'pending' ? (
        <>
          <Text style={styles.statusLine}>Fetching leaderboard…</Text>
          <Skeleton />
        </>
      ) : status === 'rank-pending' ? (
        <>
          <Text style={styles.statusLine}>
            {freshlySubmitted
              ? 'Submitting your score…'
              : 'Score not yet on the leaderboard.'}
          </Text>
          <Skeleton />
        </>
      ) : status === 'error' ? (
        <Pressable onPress={refresh} style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn't reach leaderboard</Text>
          <Text style={styles.errorBody}>Tap to retry.</Text>
        </Pressable>
      ) : (
        // backend-unavailable — local-only operation. Show the
        // placeholder copy that Phase 1 shipped so the layout still
        // looks intentional.
        <View style={styles.localOnlyBox}>
          <Text style={styles.localOnlyTitle}>Saved locally</Text>
          <Text style={styles.localOnlyBody}>
            Leaderboard backend not configured. Set
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
            to enable rank + histogram.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    ...glow(colors.accent, 14, 0.4),
  },
  kicker: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    textShadowColor: colors.accent,
    textShadowRadius: 4,
  },
  score: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: spacing.xs,
    textShadowColor: colors.accent,
    textShadowRadius: 14,
  },
  handle: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  rankLine: {
    marginTop: spacing.md,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  rankNum: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 5,
    fontSize: 22,
    fontWeight: '900',
  },
  rankOf: {
    color: colors.textMid,
    fontWeight: '700',
  },
  rankSep: {
    color: colors.textLow,
  },
  rankTop: {
    color: colors.accent,
    textShadowColor: colors.accent,
    textShadowRadius: 4,
  },
  statusLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  histogramWrap: {
    marginTop: spacing.md,
    width: '100%',
  },
  histogramRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: HISTOGRAM_HEIGHT,
    gap: 2,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    backgroundColor: colors.outlineSoft,
    borderRadius: 2,
  },
  barPlayer: {
    backgroundColor: colors.accent,
    ...glow(colors.accent, 6, 0.6),
  },
  barSkeleton: {
    opacity: 0.4,
  },
  histogramFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  histogramAxis: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  histogramMedian: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textShadowColor: colors.warn,
    textShadowRadius: 3,
  },
  errorBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  errorTitle: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
    textShadowColor: colors.danger,
    textShadowRadius: 3,
  },
  errorBody: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
  },
  localOnlyBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  localOnlyTitle: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  localOnlyBody: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    textAlign: 'center',
    maxWidth: 240,
  },
});
