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
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Challenges</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.intro}>
        Structural goals — every challenge requires you to clear a 500-point bar AND satisfy
        the extra rule. Hit both and the challenge is marked complete on your profile.
      </Text>

      <Text style={styles.rulesetNote}>
        All challenges run on the Hard ruleset: 1 joker, no undos, no starting bonus card, and ♣ at the bonus-hand cap forces a swap.
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
  intro: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  // Sits between the intro and the challenge list. Tinted with the
  // accent color + a subtle border so it reads as a callout rather
  // than body copy — important info but not a section header.
  rulesetNote: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.5,
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    backgroundColor: 'rgba(107, 214, 255, 0.06)',
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
