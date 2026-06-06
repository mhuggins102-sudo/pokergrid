// Daily Grid result-screen panel. Sits where the SS/A/B tier badge
// lives on Free Play / Targets-Up / Challenge results. Shows the
// player's rank line — the score histogram moved into the Stats
// modal (opened via the "Stats →" button below).
//
// Status-driven render — the rank hook reports one of:
//   - 'backend-unavailable'  → "local result" placeholder
//   - 'pending' / 'loading'  → "Fetching leaderboard…" line
//   - 'rank-pending'         → "Submitting your score…"
//   - 'ready'                → real rank line + Stats button
//   - 'error'                → retry CTA

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { findChallenge } from '../../game/challenges';
import { recipeFor } from '../../game/daily/recipe';
import { TARGET_BY_DIFFICULTY } from '../../game/rules';
import { RankSnapshot } from '../daily/supabase';
import { useDailyRank } from '../hooks/useDailyRank';
import { colors, fonts, glow, radius, spacing } from '../theme';
import { DailyStatsModal } from './DailyStatsModal';

const DIFFICULTY_LABEL: Record<'easy' | 'medium' | 'hard' | 'extreme', string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  extreme: 'Extreme',
};

interface Props {
  dateISO: string;
  score: number;
  // True when the play was just submitted (game just ended). False
  // when re-opening a historical play. Affects the placeholder copy
  // in the rank-pending state.
  freshlySubmitted: boolean;
}

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

const RankLine = ({ rank }: { rank: RankSnapshot }) => (
  <Text style={styles.rankLine}>
    <Text style={styles.rankNum}>#{rank.rank}</Text>
    <Text style={styles.rankOf}> of {rank.total}</Text>
  </Text>
);

export const RankPanel = ({ dateISO, score, freshlySubmitted }: Props) => {
  const { status, rank, refresh } = useDailyRank(dateISO);
  const [statsOpen, setStatsOpen] = useState(false);

  // Recipe summary above the score so the player can see at a glance
  // what the rules were on this date — important when revisiting an
  // older daily where they no longer remember the difficulty + twist.
  // Replaces the handle line that used to live here; the handle still
  // surfaces on the LandingScreen pill and in the Stats modal.
  const recipeSummary = useMemo(() => {
    const r = recipeFor(dateISO);
    const diff = DIFFICULTY_LABEL[r.difficulty];
    if (r.twist) {
      const c = findChallenge(r.twist);
      return `${diff} · ${c.name} · ${c.scoreTarget}`;
    }
    return `${diff} · ${TARGET_BY_DIFFICULTY[r.difficulty]}`;
  }, [dateISO]);

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>DAILY · {formatDate(dateISO)}</Text>
      <Text style={styles.recipeLine}>{recipeSummary}</Text>
      <Text style={styles.score}>{score}</Text>

      {/* Fixed-height reservation so the panel doesn't grow when
          rank + Stats button mount, and doesn't shrink when the
          status line takes their place. */}
      <View style={styles.rankSlot}>
        {status === 'ready' && rank ? (
          <>
            <RankLine rank={rank} />
            <Pressable
              style={styles.statsBtn}
              onPress={() => setStatsOpen(true)}
              hitSlop={8}
            >
              <Text style={styles.statsBtnText}>Stats →</Text>
            </Pressable>
          </>
        ) : status === 'loading' || status === 'pending' ? (
          <Text style={styles.statusLine}>Fetching leaderboard…</Text>
        ) : status === 'rank-pending' ? (
          <Text style={styles.statusLine}>
            {freshlySubmitted
              ? 'Submitting your score…'
              : 'Score not yet on the leaderboard.'}
          </Text>
        ) : status === 'error' ? (
          <Pressable onPress={refresh} style={styles.errorBox}>
            <Text style={styles.errorTitle}>Couldn't reach leaderboard</Text>
            <Text style={styles.errorBody}>Tap to retry.</Text>
          </Pressable>
        ) : (
          // backend-unavailable — local-only operation.
          <View style={styles.localOnlyBox}>
            <Text style={styles.localOnlyTitle}>Saved locally</Text>
            <Text style={styles.localOnlyBody}>
              Leaderboard backend not configured.
            </Text>
          </View>
        )}
      </View>

      <DailyStatsModal
        visible={statsOpen}
        dateISO={dateISO}
        onClose={() => setStatsOpen(false)}
      />
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
  },
  score: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: spacing.xs,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  recipeLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 2,
  },
  // Reserves vertical space for the ready-state rank line + Stats
  // button (or whichever status content is rendering). Sized to match
  // the tallest state so the panel doesn't reflow as data arrives.
  rankSlot: {
    width: '100%',
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
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
    textShadowRadius: 3,
    fontSize: 22,
    fontWeight: '900',
  },
  rankOf: {
    color: colors.textMid,
    fontWeight: '700',
  },
  statsBtn: {
    marginTop: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(107, 214, 255, 0.08)',
    ...glow(colors.accent, 4, 0.3),
  },
  statsBtnText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statusLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    fontStyle: 'italic',
    marginTop: spacing.md,
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
