import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../game/cards';
import { LineKind } from '../../game/grid';
import { HandRank, evaluateLine } from '../../game/hands';
import { Modifier, applyModifiers } from '../../game/modifiers';
import {
  ClubBonus,
  HAND_BASE_VALUE,
  clubMultiplier,
} from '../../game/scoring';
import { CardTile } from './CardTile';

interface Props {
  visible: boolean;
  onClose: () => void;
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
  clubs: ClubBonus;
  modifiers: Modifier[];
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
  clubs,
  modifiers,
}: Props) => {
  const hand = evaluateLine(cards);
  const filledCount = cards.filter(c => c !== null).length;
  const title = kind === 'row' ? `Row ${index + 1}` : `Column ${index + 1}`;

  let base = 0;
  let cMult = 1;
  let mMult = 1;
  let flat = 0;
  let total = 0;
  if (hand) {
    base = HAND_BASE_VALUE[hand];
    cMult = clubMultiplier(hand, clubs);
    const m = applyModifiers({ kind, index, cards, hand }, modifiers);
    mMult = m.multiplier;
    flat = m.flat;
    total = Math.ceil(base * cMult * mMult) + flat;
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
            <Text style={styles.incomplete}>
              {filledCount} / 5 placed — fill the line to score it.
            </Text>
          ) : (
            <>
              <View style={styles.handBlock}>
                <Text style={styles.handLabel}>Hand</Text>
                <Text style={styles.handValue}>{HAND_LABEL[hand]}</Text>
              </View>

              <View style={styles.breakdown}>
                <BreakdownRow label="Base" value={`${base}`} />
                <BreakdownRow
                  label="♣ multiplier"
                  value={cMult === 1 ? '—' : `× ${cMult.toFixed(2)}`}
                  active={cMult !== 1}
                />
                <BreakdownRow
                  label="Modifier multiplier"
                  value={mMult === 1 ? '—' : `× ${mMult.toFixed(2)}`}
                  active={mMult !== 1}
                />
                <BreakdownRow
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

const BreakdownRow = ({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) => (
  <View style={styles.breakdownRow}>
    <Text style={styles.breakdownLabel}>{label}</Text>
    <Text style={[styles.breakdownValue, active && styles.breakdownActive]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#262c3a',
    borderRadius: 10,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: '#f4f5f9', fontSize: 16, fontWeight: '800' },
  closeBtn: { color: '#9aa0b2', fontSize: 24, fontWeight: '700', paddingHorizontal: 4 },
  miniRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginVertical: 10,
  },
  incomplete: {
    color: '#caa44a',
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
    marginVertical: 8,
  },
  handBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#3c4456',
    marginBottom: 6,
  },
  handLabel: { color: '#9aa0b2', fontSize: 12 },
  handValue: { color: '#f4f5f9', fontSize: 14, fontWeight: '700' },
  breakdown: { gap: 2 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownLabel: { color: '#cfd2dd', fontSize: 12 },
  breakdownValue: { color: '#9aa0b2', fontSize: 12 },
  breakdownActive: { color: '#7cdca0' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: '#3c4456',
    marginTop: 4,
  },
  totalLabel: { color: '#9aa0b2', fontSize: 13 },
  totalValue: { color: '#7cdca0', fontSize: 18, fontWeight: '800' },
});
