// Daily Grid result-screen panel — sits where the SS/A/B tier badge
// lives on Free Play / Targets-Up / Challenge results. Phase 1 ships a
// placeholder ("local only · backend lands in Phase 2") so the layout
// is right and result screens look correct before any networking
// exists. Phase 2 replaces the body with the real rank line + score
// histogram fed from Supabase.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayNameFor, useDaily } from '../daily/DailyProvider';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  dateISO: string;
  score: number;
  // True when the play was just submitted (game just ended). False
  // when re-opening a historical play. Currently only affects the
  // placeholder copy.
  freshlySubmitted: boolean;
}

const formatDate = (iso: string): string => {
  // Render YYYY-MM-DD as something humans can read at a glance:
  // "Jun 5, 2026". Done by hand to avoid pulling in toLocaleDateString
  // (locale-dependent + inconsistent across RN runtimes).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthName = MONTHS[Number(mo) - 1] ?? mo;
  return `${monthName} ${Number(d)}, ${y}`;
};

export const RankPanel = ({ dateISO, score, freshlySubmitted }: Props) => {
  const { deviceId, handle } = useDaily();
  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>DAILY · {formatDate(dateISO)}</Text>
      <Text style={styles.score}>{score}</Text>
      <Text style={styles.handle}>{displayNameFor(deviceId, handle)}</Text>
      <View style={styles.pendingBox}>
        <Text style={styles.pendingTitle}>
          {freshlySubmitted ? 'Saved locally' : 'Local result'}
        </Text>
        <Text style={styles.pendingBody}>
          Leaderboard rank + score histogram land in Phase 2 once the
          Supabase backend is wired up.
        </Text>
      </View>
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
  pendingBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  pendingTitle: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pendingBody: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    textAlign: 'center',
    maxWidth: 240,
  },
});
