import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BONUS_DECK_POOL } from '../../game/bonusCards';
import { BonusCategory, categoryOf, CATEGORY_LABEL, styleFor } from '../bonusCardCategory';
import { NeonButton } from '../components/NeonButton';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

// Iteration order matches the visual hierarchy of bonus impact: hand-type
// boosts first (most personal), then line-targeted, then suit density,
// then conditional, then grid-wide.
const ORDER: BonusCategory[] = [
  'hand',
  'line',
  'suit',
  'conditional',
  'grid',
  'deck-management',
];

export const BonusCardsScreen = ({ onBack }: Props) => {
  const { settings } = useSettings();
  const groups = new Map<BonusCategory, typeof BONUS_DECK_POOL>();
  for (const card of BONUS_DECK_POOL) {
    const g = categoryOf(card);
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

      {ORDER.map(cat => {
        const cards = groups.get(cat) ?? [];
        if (cards.length === 0) return null;
        return (
          <View key={cat} style={styles.groupBlock}>
            <Text style={styles.groupLabel}>
              {CATEGORY_LABEL[cat]} <Text style={styles.groupCount}>· {cards.length}</Text>
            </Text>
            <View style={styles.cardGrid}>
              {cards.map(c => {
                const s = styleFor(c);
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.card,
                      { borderColor: s.borderColor },
                      glow(s.borderColor, 4, 0.18),
                    ]}
                  >
                    {settings.colorBlindAssist && (
                      <Text
                        style={[styles.cardIcon, { color: s.iconColor, textShadowColor: s.iconColor }]}
                      >
                        {s.icon}
                      </Text>
                    )}
                    <Text
                      style={[styles.cardTitle, { color: s.titleColor, textShadowColor: s.titleColor }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {c.title}
                    </Text>
                    <Text style={styles.cardMult} numberOfLines={1} adjustsFontSizeToFit>
                      {c.mult}
                    </Text>
                    <Text style={styles.cardDesc}>{c.description}</Text>
                  </View>
                );
              })}
            </View>
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
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  card: {
    // Two cards per row, accounting for the row's gap. flexGrow stays at 0
    // so a lone card in an odd-count category keeps the same width as the
    // pair above it rather than stretching to fill the row.
    flexBasis: '48%',
    flexGrow: 0,
    backgroundColor: colors.bgPanel,
    // borderColor + glow set inline from the card's category tone.
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  cardIcon: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    textShadowRadius: 4,
    textAlign: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    // color + textShadowColor set inline from category tone.
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowRadius: 3,
    textAlign: 'center',
  },
  cardMult: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 3,
    textAlign: 'center',
    marginTop: 2,
  },
  cardDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
