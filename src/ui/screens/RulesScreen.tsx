import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NeonButton } from '../components/NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  onOpenTutorial: () => void;
  onOpenBonusCards: () => void;
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionLabel}>{label}</Text>
    {children}
  </View>
);

const Perk = ({
  symbol,
  color,
  name,
  desc,
}: {
  symbol: string;
  color: string;
  name: string;
  desc: string;
}) => (
  <View style={styles.perkRow}>
    <Text style={[styles.perkSymbol, { color, textShadowColor: color }]}>{symbol}</Text>
    <View style={styles.perkText}>
      <Text style={[styles.perkName, { color }]}>{name}</Text>
      <Text style={styles.perkDesc}>{desc}</Text>
    </View>
  </View>
);

export const RulesScreen = ({ onBack, onOpenTutorial, onOpenBonusCards }: Props) => (
  <View style={styles.root}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>How to Play</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.tagline}>
        5×5 poker solitaire. Place every card, score the 10 lines, beat your target.
      </Text>

      <Section label="Each turn">
        <Text style={styles.body}>
          A card is drawn for you. You can <Text style={styles.bodyHi}>place</Text> it (it lands
          in the next spiral slot, starting at the center of the grid and expanding clockwise
          outward), <Text style={styles.bodyHi}>trash</Text> it (it's gone), or spend it on its{' '}
          <Text style={styles.bodyHi}>suit perk</Text>. A pulsing cyan ring marks the next slot
          a placed card will land in.
        </Text>
      </Section>

      <Section label="Suit perks">
        <Perk
          symbol="♥"
          color={colors.suitH}
          name="Swap"
          desc="Trade any two cards on the grid that share a row or column."
        />
        <Perk
          symbol="♠"
          color={colors.suitS}
          name="Slide"
          desc="Pick a card; that card and the cards in front of it slide together as a chain, any distance up to a wall or blocker. Drag from the card in a direction instead of tapping if you like."
        />
        <Perk
          symbol="♦"
          color={colors.suitD}
          name="Destroy"
          desc="Trash any one card on the grid — even the joker. Use sparingly: empty slots cost points at game end."
        />
        <Perk
          symbol="♣"
          color={colors.suitC}
          name="Bonus"
          desc="Draw two bonus cards from the bonus deck and keep one. Hold up to 3 in your hand; at the cap, ♣ forces a swap."
        />
        <Text style={styles.footnoteInSection}>
          The drawn card is trashed after a suit perk. If a perk has no legal target, its button
          is hidden.
        </Text>
      </Section>

      <Section label="Bonus cards">
        <Text style={styles.body}>
          You hold up to 3 bonus cards at a time. They multiply your scores — some target a
          specific poker hand, some target a specific row or column, some are conditional, and
          some multiply your whole grid total at game end. Multipliers{' '}
          <Text style={styles.bodyHi}>stack multiplicatively</Text>: two ×2 cards on one line
          is ×4, not ×3.
        </Text>
      </Section>

      <Section label="The joker">
        <Text style={styles.body}>
          The joker is auto-placed when drawn — you don't get to choose where, and it can't be
          trashed initially. On the grid it's a wild, taking whatever rank and suit make the
          best hand in its row, and independently in its column. A ♦ Destroy can remove it
          mid-game (and triggers the "Trash Joker" bonus card if you hold it).
        </Text>
      </Section>

      <Section label="Scoring">
        <Text style={styles.body}>
          At the end, every row and every column scores as a 5-card poker hand. High Card earns
          nothing — only Pair and above pay out. Bonuses multiply each line; grid achievements
          multiply the summed total. Lines with fewer than 5 cards{' '}
          <Text style={styles.bodyDanger}>cost 25 points each</Text>, so unfilled empties from
          a ♦ Destroy are expensive.
        </Text>
      </Section>

      <Section label="End of game">
        <Text style={styles.body}>
          The run ends when the grid is full or the deck runs out. Beat your target to win.
          Free Play uses Easy 300, Medium 400, or Hard 500. Targets Up and Challenges set
          their own targets.
        </Text>
      </Section>

      <View style={styles.ctaWrap}>
        <NeonButton
          label="Show Tutorial →"
          variant="primary"
          size="lg"
          onPress={onOpenTutorial}
        />
        <NeonButton
          label="Bonus Cards"
          variant="secondary"
          size="lg"
          onPress={onOpenBonusCards}
        />
      </View>
      <Text style={styles.ctaHint}>
        The Tutorial walks through the rules with interactive examples. Bonus Cards lists every
        card in the bonus deck.
      </Text>
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  scroll: { flex: 1 },
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
  tagline: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  bodyHi: { color: colors.textHi, fontWeight: '700' },
  bodyDanger: { color: colors.danger, fontWeight: '700' },
  footnoteInSection: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  perkSymbol: {
    fontFamily: fonts.mono,
    fontSize: 26,
    fontWeight: '900',
    width: 28,
    textAlign: 'center',
    textShadowRadius: 6,
  },
  perkText: { flex: 1 },
  perkName: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  perkDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  ctaWrap: {
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
    ...glow(colors.accent, 0, 0),
  },
  ctaHint: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
});
