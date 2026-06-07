// Daily Grid result-screen panel. Structurally mirrors ResultScreen's
// BannerHero (the free-play / TU / challenge hero card) row-for-row so
// the two end-of-game surfaces feel like siblings:
//
//   bannerMode    →  kicker        ("HARD" or "HARD · THREE TRICKS")
//   bannerKicker  →  rankLine      (replaces "· WIN ·" / "· DEFEAT ·")
//   bannerScore   →  score         (same 36pt mono 900)
//   bannerTarget  →  targetLine    ("target 500")
//   tierBadge     →  statsBadge    (replaces tier; opens stats modal)
//
// The DAILY · date kicker moved into the DailyStatsModal — the panel
// itself doesn't repeat it.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { findChallenge } from '../../game/challenges';
import { recipeFor } from '../../game/daily/recipe';
import { TARGET_BY_DIFFICULTY } from '../../game/rules';
import { useDaily } from '../daily/DailyProvider';
import { useDailyRank } from '../hooks/useDailyRank';
import { colors, fonts, glow, radius, spacing } from '../theme';
import { DailyStatsModal } from './DailyStatsModal';

const DIFFICULTY_LABEL: Record<'easy' | 'medium' | 'hard' | 'extreme', string> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
  extreme: 'EXTREME',
};

interface Props {
  dateISO: string;
  score: number;
  // True when the play was just submitted (game just ended). False
  // when re-opening a historical play. Affects the placeholder copy
  // in the rank-pending state.
  freshlySubmitted: boolean;
}

export const RankPanel = ({ dateISO, score, freshlySubmitted }: Props) => {
  const { status, rank, refresh } = useDailyRank(dateISO);
  const { lastSubmitError } = useDaily();
  const [statsOpen, setStatsOpen] = useState(false);
  // A submit error for THIS dateISO outranks the generic
  // "Submitting…" copy — the player should see the real reason it's
  // not on the board rather than thinking the network's still in
  // flight.
  const submitErrorForThisDate =
    lastSubmitError?.dateISO === dateISO ? lastSubmitError.detail : null;

  const modeLine = useMemo(() => {
    const r = recipeFor(dateISO);
    const diff = DIFFICULTY_LABEL[r.difficulty];
    if (r.twist) {
      return `${diff} · ${findChallenge(r.twist).name.toUpperCase()}`;
    }
    return diff;
  }, [dateISO]);

  const target = useMemo(() => {
    const r = recipeFor(dateISO);
    if (r.twist) return findChallenge(r.twist).scoreTarget;
    return TARGET_BY_DIFFICULTY[r.difficulty];
  }, [dateISO]);

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>{modeLine}</Text>

      {/* Rank line — same vertical slot as bannerKicker (· WIN ·).
          Fixed minHeight reserves space across status states so the
          panel doesn't reflow when the rank fetch resolves. */}
      <View style={styles.rankSlot}>
        {status === 'ready' && rank ? (
          <Text style={styles.rankLine}>
            #{rank.rank} of {rank.total}
          </Text>
        ) : submitErrorForThisDate ? (
          <>
            <Text style={styles.errorLine}>Submit failed</Text>
            <Text style={styles.errorDetail} selectable>
              {submitErrorForThisDate}
            </Text>
          </>
        ) : status === 'loading' || status === 'pending' ? (
          <Text style={styles.statusLine}>Fetching leaderboard…</Text>
        ) : status === 'rank-pending' ? (
          <Text style={styles.statusLine}>
            {freshlySubmitted
              ? 'Submitting your score…'
              : 'Score not yet on leaderboard.'}
          </Text>
        ) : status === 'error' ? (
          <Pressable onPress={refresh} hitSlop={6}>
            <Text style={styles.errorLine}>Couldn't reach · tap to retry</Text>
          </Pressable>
        ) : (
          // backend-unavailable
          <Text style={styles.statusLine}>Saved locally</Text>
        )}
      </View>

      <Text style={styles.score}>{score}</Text>
      <Text style={styles.targetLine}>target {target}</Text>

      {/* Stats badge — same vertical slot as the free-play tier
          badge. Fixed minHeight reserves space so the panel doesn't
          shrink when the rank isn't ready. */}
      <View style={styles.badgeSlot}>
        {status === 'ready' && rank && (
          <Pressable
            onPress={() => setStatsOpen(true)}
            hitSlop={6}
            style={styles.statsBadge}
          >
            <Text style={styles.statsBadgeText}>Stats →</Text>
          </Pressable>
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
  // Mirrors ResultScreen.banner — same 2px border, padding, glow.
  root: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    ...glow(colors.accent, 18, 0.55),
  },
  // Matches ResultScreen.bannerMode — small textLow kicker line.
  kicker: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 2,
  },
  // Slot for the rank line + status placeholders. Reserves 22px so
  // the panel height stays constant across loading / error / ready.
  // Submit-failed state allows the slot to grow vertically to fit
  // the diagnostic detail line below the error header.
  rankSlot: {
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  // Matches ResultScreen.bannerKicker shape (12pt mono 800 letter
  // spacing 4 uppercase), tinted success-green to celebrate making
  // the leaderboard the way · WIN · celebrates the win.
  rankLine: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  // Non-ready states share the rank-line slot. Same baseline so the
  // panel height stays constant but italic + dimmer to read as
  // "transient state" instead of "live data".
  statusLine: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontStyle: 'italic',
    letterSpacing: 1.5,
  },
  errorLine: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Diagnostic detail under "Submit failed". Selectable so playtesters
  // can copy + paste the actual Postgres error back during debugging.
  errorDetail: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: spacing.xs,
  },
  // Matches ResultScreen.bannerScore: 36pt mono 900, accent shadow.
  score: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  // Matches ResultScreen.bannerTarget exactly.
  targetLine: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textLow,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  // Slot for the badge. Reserves the badge's vertical footprint so
  // the panel doesn't shrink in non-ready states.
  badgeSlot: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  // Mirrors ResultScreen.tierBadge — same pill shape, padding,
  // border width. Accent (cyan) since "Stats" is an affordance, not
  // a celebration.
  statsBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    borderColor: colors.accent,
    backgroundColor: colors.bgBase,
  },
  statsBadgeText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
