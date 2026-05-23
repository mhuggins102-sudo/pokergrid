import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../game/cards';
import { applyLineEffects, BonusCard, LineContext } from '../../game/bonusCards';
import { LineKind } from '../../game/grid';
import { HandRank, evaluateLine } from '../../game/hands';
import { HAND_BASE_VALUE, INCOMPLETE_LINE_PENALTY } from '../../game/scoring';
import { colors, fonts, glow, radius, spacing } from '../theme';
import { CardTile } from './CardTile';

interface Props {
  visible: boolean;
  onClose: () => void;
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
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

export const LineDetailModal = ({
  visible,
  onClose,
  kind,
  index,
  cards,
  bonusCards,
}: Props) => {
  const hand = evaluateLine(cards);
  const filledCount = cards.filter(c => c !== null).length;
  const title = kind === 'row' ? `Row ${index + 1}` : `Column ${index + 1}`;

  let base = 0;
  let mult = 1;
  let flat = 0;
  let total = 0;
  if (hand) {
    base = HAND_BASE_VALUE[hand];
    const ctx: LineContext = { kind, index, cards, hand };
    const e = applyLineEffects(ctx, bonusCards);
    mult = e.multiplier;
    flat = e.flat;
    total = Math.ceil(base * mult) + flat;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <View style={styles.miniRow}>
            {cards.map((c, i) => (
              <CardTile key={i} card={c} size="sm" />
            ))}
          </View>

          {!hand ? (
            <>
              <Text style={styles.incomplete}>
                {filledCount} / 5 placed — incomplete lines cost
                {' '}{INCOMPLETE_LINE_PENALTY * -1} points at game end.
              </Text>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>End-of-game</Text>
                <Text style={styles.penaltyValue}>{INCOMPLETE_LINE_PENALTY}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.handBlock}>
                <Text style={styles.handLabel}>HAND</Text>
                <Text style={styles.handValue}>{HAND_LABEL[hand]}</Text>
              </View>

              <View style={styles.breakdown}>
                <Row label="Base" value={`${base}`} />
                <Row
                  label="Multiplier"
                  value={mult === 1 ? '—' : `× ${mult.toFixed(2)}`}
                  active={mult !== 1}
                />
                <Row
                  label="Flat bonus"
                  value={flat === 0 ? '—' : `+ ${flat}`}
                  active={flat !== 0}
                />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{total}</Text>
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const Row = ({ label, value, active }: { label: string; value: string; active?: boolean }) => (
  <View style={styles.breakdownRow}>
    <Text style={styles.breakdownLabel}>{label}</Text>
    <Text style={[styles.breakdownValue, active && styles.breakdownActive]}>{value}</Text>
  </View>
);

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
    maxWidth: 340,
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
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  incomplete: {
    color: colors.warn,
    fontFamily: fonts.sans,
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
    marginVertical: spacing.sm,
  },
  handBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.outlineSoft,
    marginBottom: spacing.xs,
  },
  handLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  handValue: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  breakdown: { gap: 2 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownLabel: { color: colors.textMid, fontFamily: fonts.sans, fontSize: 12 },
  breakdownValue: { color: colors.textLow, fontFamily: fonts.mono, fontSize: 12 },
  breakdownActive: { color: colors.success, textShadowColor: colors.success, textShadowRadius: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.outlineSoft,
    marginTop: spacing.xs,
  },
  totalLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  totalValue: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: colors.success,
    textShadowRadius: 6,
  },
  penaltyValue: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: colors.danger,
    textShadowRadius: 6,
  },
});
