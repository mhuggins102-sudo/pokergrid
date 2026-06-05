import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACHIEVEMENTS, Achievement } from '../../game/achievements';
import { NeonButton } from '../components/NeonButton';
import { useStats } from '../stats';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

// Achievements list — read-only. The player earns these passively
// during Free Play runs; nothing here is tappable to launch a
// dedicated mode (those are Challenges).
export const AchievementsScreen = ({ onBack }: Props) => {
  const { stats } = useStats();
  const done = useMemo(
    () => new Set(stats.achievementsDone),
    [stats.achievementsDone]
  );
  const doneCount = ACHIEVEMENTS.filter(a => done.has(a.id)).length;
  const easyList = ACHIEVEMENTS.filter(a => a.tier === 'easy');
  const hardList = ACHIEVEMENTS.filter(a => a.tier === 'hard-extreme');
  const milestoneList = ACHIEVEMENTS.filter(a => a.tier === 'milestone');

  const renderCard = (a: Achievement) => {
    const isDone = done.has(a.id);
    return (
      <View key={a.id} style={[styles.card, isDone && styles.cardDone]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, isDone && styles.cardNameDone]}>
            {a.name}
          </Text>
          {isDone && <Text style={styles.cardBadge}>· DONE</Text>}
        </View>
        <Text style={styles.cardDesc}>{a.description}</Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Achievements</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.intro}>
        Passive goals earned from single runs and upon reaching select
        milestones (Free Play only, except for Challenge Sweep). Easy
        and Hard / Extreme difficulties each have a unique set of
        achievements to complete.
      </Text>

      <Text style={styles.tally}>
        {doneCount} / {ACHIEVEMENTS.length} earned
      </Text>

      <Text style={[styles.sectionLabel, styles.sectionLabelEasy]}>Easy</Text>
      <View style={styles.list}>{easyList.map(renderCard)}</View>

      <Text style={[styles.sectionLabel, styles.sectionLabelHard]}>
        Hard / Extreme
      </Text>
      <View style={styles.list}>{hardList.map(renderCard)}</View>

      <Text style={[styles.sectionLabel, styles.sectionLabelMilestone]}>
        Milestones
      </Text>
      <View style={styles.list}>{milestoneList.map(renderCard)}</View>
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
    marginBottom: spacing.md,
  },
  tally: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textShadowColor: colors.joker,
    textShadowRadius: 2,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabelEasy: {
    color: colors.success,
  },
  sectionLabelHard: {
    color: colors.warn,
  },
  // Milestones — accent (cyan) so the tier reads as "all-up" / cross-
  // mode goals rather than tied to a single difficulty's color.
  sectionLabelMilestone: {
    color: colors.accent,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.outlineSoft,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardDone: {
    borderColor: colors.joker,
    ...glow(colors.joker, 6, 0.3),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  cardName: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardNameDone: {
    color: colors.joker,
    textShadowColor: colors.joker,
    textShadowRadius: 1,
  },
  cardBadge: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginLeft: spacing.sm,
    textShadowColor: colors.joker,
    textShadowRadius: 2,
  },
  cardDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
});
