import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHALLENGES, ChallengeId } from '../../game/challenges';
import { NeonButton } from '../components/NeonButton';
import { useStats } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  onStart: (id: ChallengeId) => void;
}

export const ChallengesScreen = ({ onBack, onStart }: Props) => {
  const { stats } = useStats();
  // Only count IDs that still exist in CHALLENGES — stats.challengesDone
  // may carry migrated IDs from the pre-Achievements split, and we
  // don't want those inflating the tally.
  const doneCount = CHALLENGES.filter(c =>
    stats.challengesDone.includes(c.id)
  ).length;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Challenges</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.tally}>
        {doneCount} / {CHALLENGES.length} cleared
      </Text>

      <View style={styles.list}>
        {CHALLENGES.map(c => {
          const done = stats.challengesDone.includes(c.id);
          return (
            <Pressable
              key={c.id}
              style={[styles.card, done && styles.cardDone]}
              onPress={() => onStart(c.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, done && styles.cardTitleDone]}>{c.name}</Text>
                {done && <Text style={styles.cardBadge}>· DONE</Text>}
              </View>
              <Text style={styles.cardGoal}>{c.goal}</Text>
              <Text style={styles.cardCta}>
                {done ? 'Play again →' : 'Start →'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        More challenges coming. Suggestions welcome.
      </Text>
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
  // Mirrors the Achievements tally — tinted with the "done" success
  // green so it reads as a progress marker, not a header.
  tally: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: colors.success,
    textShadowRadius: 3,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...glow(colors.warn, 6, 0.25),
  },
  cardDone: {
    borderColor: colors.success,
    ...glow(colors.success, 8, 0.3),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 5,
  },
  cardTitleDone: {
    color: colors.success,
    textShadowColor: colors.success,
  },
  cardBadge: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginLeft: spacing.sm,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  cardGoal: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  cardCta: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
