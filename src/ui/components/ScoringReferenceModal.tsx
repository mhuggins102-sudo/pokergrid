import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BonusCard, universalEffectFor, universalEffectSum } from '../../game/bonusCards';
import { HandRank } from '../../game/hands';
import { HAND_BASE_VALUE } from '../../game/scoring';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  bonusCards: BonusCard[];
}

const HAND_LABEL: Record<HandRank, string> = {
  HIGH_CARD: 'High Card',
  PAIR: 'Pair',
  TWO_PAIR: 'Two Pair',
  THREE_OF_A_KIND: 'Three of a Kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  FULL_HOUSE: 'Full House',
  FOUR_OF_A_KIND: 'Four of a Kind',
  STRAIGHT_FLUSH: 'Straight Flush',
  FIVE_OF_A_KIND: 'Five of a Kind',
  ROYAL_FLUSH: 'Royal Flush',
};

// High Card is intentionally omitted — a 5-card line with no pair / straight /
// flush scores 0, so listing it would just be noise in the chart.
const HAND_ORDER: HandRank[] = [
  'PAIR', 'TWO_PAIR', 'THREE_OF_A_KIND', 'STRAIGHT', 'FLUSH',
  'FULL_HOUSE', 'FOUR_OF_A_KIND', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH', 'FIVE_OF_A_KIND',
];

const fmt = (n: number): string => {
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
};

const HandRow = ({ hand, bonusCards }: { hand: HandRank; bonusCards: BonusCard[] }) => {
  const base = HAND_BASE_VALUE[hand];
  const { multiplier, flat } = universalEffectSum(bonusCards, hand);
  const finalValue = Math.ceil(base * multiplier) + flat;
  const isModified = multiplier !== 1 || flat !== 0;
  const parts: string[] = [];
  if (multiplier !== 1) parts.push(`×${fmt(multiplier)}`);
  if (flat !== 0) parts.push(`+${flat}`);

  return (
    <View style={styles.row}>
      <View style={styles.handCol}>
        <Text style={styles.handName} numberOfLines={1}>{HAND_LABEL[hand]}</Text>
        {isModified && (
          <Text style={styles.bonusSub} numberOfLines={1}>{parts.join(' · ')}</Text>
        )}
      </View>
      {isModified ? (
        <>
          <Text style={styles.baseStrike}>{base}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.valueBoosted}>{finalValue}</Text>
        </>
      ) : (
        <Text style={styles.value}>{base}</Text>
      )}
    </View>
  );
};

export const ScoringReferenceModal = ({ visible, onClose, bonusCards }: Props) => {
  const conditional = bonusCards.filter(b =>
    b.lineEffect && HAND_ORDER.every(h => universalEffectFor(b, h) === null)
  );
  const gridLevel = bonusCards.filter(b => !!b.gridEffect);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Scoring</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll}>
            {HAND_ORDER.map(h => (
              <HandRow key={h} hand={h} bonusCards={bonusCards} />
            ))}

            {conditional.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Conditional Bonuses</Text>
                {conditional.map(b => (
                  <Text key={b.id} style={styles.modLine}>· {b.description}</Text>
                ))}
              </>
            )}

            {gridLevel.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Grid Achievements</Text>
                {gridLevel.map(b => (
                  <Text key={b.id} style={styles.modLine}>· {b.description}</Text>
                ))}
              </>
            )}

            <Text style={styles.footnote}>
              Multipliers compose multiplicatively per line. Grid achievements multiply the
              summed total. Incomplete lines (under 5 cards) cost 25 each at game end.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    backgroundColor: colors.bgPanel,
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 24, 0.25),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  scroll: { maxHeight: 480 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: colors.outlineSoft,
  },
  handCol: { flex: 1 },
  handName: { color: colors.textMid, fontFamily: fonts.sans, fontSize: 13 },
  bonusSub: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  value: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  baseStrike: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginRight: 4,
  },
  arrow: { color: colors.textLow, fontSize: 12, marginRight: 4 },
  valueBoosted: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'right',
    textShadowColor: colors.success,
    textShadowRadius: 6,
  },
  divider: { height: 1, backgroundColor: colors.outline, marginVertical: spacing.md },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  modLine: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginBottom: 2,
    lineHeight: 16,
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 10,
    marginTop: spacing.md,
    fontStyle: 'italic',
    lineHeight: 14,
  },
});
