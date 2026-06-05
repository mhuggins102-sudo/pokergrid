import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BonusCard, BONUS_DECK_POOL, SPECIAL_DECK_POOL } from '../../game/bonusCards';
import { BonusCategory, categoryOf, CATEGORY_LABEL, styleFor } from '../bonusCardCategory';
import { NeonButton } from '../components/NeonButton';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

// Three tone-grouped sections: yellow = per-line multipliers (fire
// during the run), purple = grid-wide multipliers (fire at game end),
// green = one-time consumable actions from the Challenge-only special
// deck. Each tone keeps its mechanic sub-categories as nested labels so
// the catalog stays scannable instead of becoming a 30-card wall under
// each colored banner.
type Tone = 'yellow' | 'purple' | 'green';
interface SectionDef {
  label: string;
  tone: Tone;
  subCats: BonusCategory[];
  pool: readonly BonusCard[];
}
const SECTION_DEFS: SectionDef[] = [
  {
    label: 'Line Multipliers',
    tone: 'yellow',
    subCats: ['hand', 'line', 'suit', 'conditional'],
    pool: BONUS_DECK_POOL,
  },
  {
    label: 'Grid Multipliers',
    tone: 'purple',
    subCats: ['grid', 'deck-management'],
    pool: BONUS_DECK_POOL,
  },
  {
    label: 'One-Time Actions',
    tone: 'green',
    subCats: ['special'],
    pool: SPECIAL_DECK_POOL,
  },
];

export const BonusCardsScreen = ({ onBack }: Props) => {
  const { settings } = useSettings();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bonus Cards</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.intro}>
        The standard bonus deck contains {BONUS_DECK_POOL.length} cards, which are yellow and purple. Yellow cards are in-game multipliers that increase the value of a scoring line (row or column). Purple cards multiply your total score at end of game. There is also a special green deck that offers one-time actions rather than point multipliers. It is only used during select Challenges.
      </Text>

      {SECTION_DEFS.map(section => {
        const subGroups = section.subCats
          .map(cat => ({
            cat,
            cards: section.pool.filter(c => categoryOf(c) === cat),
          }))
          .filter(g => g.cards.length > 0);
        const totalCount = subGroups.reduce((acc, g) => acc + g.cards.length, 0);
        // Single-sub-category tones (currently just green) skip the
        // redundant sub-label — "One-Time Actions · 8" then
        // "One-time action · 8" on the next line would just stutter.
        const showSubLabels = subGroups.length > 1;
        return (
          <View key={section.tone} style={styles.groupBlock}>
            <Text
              style={[
                styles.groupLabel,
                section.tone === 'yellow' && styles.groupLabelYellow,
                section.tone === 'purple' && styles.groupLabelPurple,
                section.tone === 'green' && styles.groupLabelGreen,
              ]}
            >
              {section.label} <Text style={styles.groupCount}>· {totalCount}</Text>
            </Text>
            {subGroups.map(sg => (
              <View key={sg.cat}>
                {showSubLabels && (
                  <Text style={styles.subLabel}>
                    {CATEGORY_LABEL[sg.cat]}{' '}
                    <Text style={styles.subCount}>· {sg.cards.length}</Text>
                  </Text>
                )}
                <View style={styles.cardGrid}>
                  {sg.cards.map(c => {
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
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  groupBlock: { marginBottom: spacing.lg },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  groupLabelYellow: {
    color: colors.warn,
    textShadowColor: colors.warn,
    textShadowRadius: 2,
  },
  groupLabelPurple: {
    color: colors.joker,
    textShadowColor: colors.joker,
    textShadowRadius: 2,
  },
  groupLabelGreen: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 2,
  },
  groupCount: {
    color: colors.textLow,
    fontWeight: '600',
    textShadowRadius: 0,
  },
  // Sub-category labels (e.g. "Hand-type bonus") sit one level below the
  // colored tone header. Smaller / dimmer / non-glowing so the eye reads
  // tone-header → sub-header → cards without effort.
  subLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  subCount: {
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
    textShadowRadius: 2,
    textAlign: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    // color + textShadowColor set inline from category tone.
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowRadius: 2,
    textAlign: 'center',
  },
  cardMult: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 2,
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
