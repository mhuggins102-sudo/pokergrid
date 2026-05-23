import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BONUS_DECK_POOL } from '../../game/bonusCards';
import { NeonButton } from '../components/NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

// Group cards by their id prefix so the list reads top-to-bottom in
// category groups.
const groupFor = (id: string): string => {
  if (id.startsWith('hand-')) return 'Hand Type';
  if (id.startsWith('row-')) return 'Row / Column';
  if (id.startsWith('col-')) return 'Row / Column';
  if (id.startsWith('suit-density-')) return 'Suit Density';
  if (id === 'outer-edge-x1_25') return 'Per-Line Conditional';
  if (id === 'rainbow-line-x2') return 'Per-Line Conditional';
  if (id === 'joker-line-x1_5') return 'Per-Line Conditional';
  if (id === 'royal-touch-x1_5') return 'Per-Line Conditional';
  if (id === 'spiral-core-x1_5') return 'Per-Line Conditional';
  return 'Grid Achievement';
};

const ORDER = [
  'Hand Type',
  'Row / Column',
  'Suit Density',
  'Per-Line Conditional',
  'Grid Achievement',
];

export const BonusCardsScreen = ({ onBack }: Props) => {
  const groups = new Map<string, typeof BONUS_DECK_POOL>();
  for (const card of BONUS_DECK_POOL) {
    const g = groupFor(card.id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(card);
  }
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonus Cards</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.intro}>
        All {BONUS_DECK_POOL.length} bonus cards in the deck. Spend a ♣ during the game to draw
        2 of them; keep one (hold up to 3 at a time).
      </Text>

      {ORDER.map(groupName => {
        const cards = groups.get(groupName) ?? [];
        if (cards.length === 0) return null;
        return (
          <View key={groupName} style={styles.groupBlock}>
            <Text style={styles.groupLabel}>
              {groupName} <Text style={styles.groupCount}>· {cards.length}</Text>
            </Text>
            {cards.map(c => (
              <View key={c.id} style={styles.card}>
                <Text style={styles.cardName}>{c.name}</Text>
                <Text style={styles.cardDesc}>{c.description}</Text>
              </View>
            ))}
          </View>
        );
      })}
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
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.lg,
  },
  groupBlock: { marginBottom: spacing.lg, gap: 4 },
  groupLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  groupCount: {
    color: colors.textLow,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...glow(colors.warn, 4, 0.18),
  },
  cardName: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: colors.warn,
    textShadowRadius: 3,
  },
  cardDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
});
