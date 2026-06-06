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

export const RankPanel = ({ dateISO, score, freshlySubmitted }: Props) => {
  const { status, rank, refresh } = useDailyRank(dateISO);
  const [statsOpen, setStatsOpen] = useState(false);

  // Recipe summary above the score so the player can see at a glance
  // what the rules were on this date — important when revisiting an
  // older daily where they no longer remember the difficulty + twist.
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
      {/* Vertical rhythm mirrors BannerHero's: small kicker → medium
          centerpiece line → huge score → pill badge. Sizes / letter
          spacings are intentionally aligned so the daily result and
          the free-play result feel like siblings. */}
      <Text style={styles.kicker}>DAILY · {formatDate(dateISO)}</Text>
      <Text style={styles.recipeLine}>{recipeSummary}</Text>
      <Text style={styles.score}>{score}</Text>

      {/* Fixed-height reservation so the panel doesn't grow when
          rank + Stats button mount, and doesn't shrink when the
          status line takes their place. */}
      <View style={styles.rankSlot}>
        {status === 'ready' && rank ? (
          <>
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>
                #{rank.rank} of {rank.total}
              </Text>
            </View>
            <Pressable
              onPress={() => setStatsOpen(true)}
              hitSlop={8}
              style={styles.statsBtn}
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
  // Mirrors ResultScreen's `banner` style (the free-play / TU /
  // challenge hero card): 2px border, same outer / inner spacing,
  // accent-tinted border + glow, alignSelf center with the same
  // 320px max width as the bonus chips + breakdown below.
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
  // Matches ResultScreen.bannerMode — small textLow kicker line just
  // tinted accent here since the daily IS the celebratory tone.
  kicker: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 2,
  },
  // Matches ResultScreen.bannerKicker — the "what kind of run was
  // this" line. For free play it's "· WIN ·" / "· DEFEAT ·"; for
  // daily it's the recipe summary. Same font + letterSpacing 4 so
  // the two read as the same visual element.
  recipeLine: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
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
  // Reserves vertical space for the ready-state rank pill + Stats
  // button (or whichever status content is rendering). Sized to match
  // the tallest state so the panel doesn't reflow as data arrives.
  rankSlot: {
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  // Mirrors ResultScreen.tierBadge — same pill shape, padding, border
  // width. Success-green to telegraph "you made the leaderboard"
  // instead of the per-tier color the free-play badge uses.
  rankBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    borderColor: colors.success,
    backgroundColor: colors.bgBase,
  },
  rankBadgeText: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  // Small ghost-style text button under the rank badge. Matches the
  // result-screen "Per-line scores" disclosure read — minimal weight,
  // no border, accent color.
  statsBtn: {
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  statsBtnText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 10,
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
