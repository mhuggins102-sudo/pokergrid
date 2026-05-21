import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HandRank } from '../../game/hands';
import { Modifier } from '../../game/modifiers';
import { ClubBonus, HAND_BASE_VALUE, clubMultiplier } from '../../game/scoring';

interface Props {
  visible: boolean;
  onClose: () => void;
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

const HAND_ORDER: HandRank[] = [
  'HIGH_CARD',
  'PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
  'FIVE_OF_A_KIND',
  'ROYAL_FLUSH',
];

export const ScoringReferenceModal = ({ visible, onClose, clubs, modifiers }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Scoring Reference</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>×</Text>
          </Pressable>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colHand, styles.headerText]}>Hand</Text>
          <Text style={[styles.colBase, styles.headerText]}>Base</Text>
          <Text style={[styles.colClub, styles.headerText]}>♣ Boost</Text>
          <Text style={[styles.colAfter, styles.headerText]}>= Value</Text>
        </View>

        <ScrollView style={styles.table}>
          {HAND_ORDER.map(h => {
            const base = HAND_BASE_VALUE[h];
            const pip = clubs[h];
            const mult = clubMultiplier(h, clubs);
            const after = Math.ceil(base * mult);
            return (
              <View key={h} style={styles.row}>
                <Text style={styles.colHand} numberOfLines={1}>{HAND_LABEL[h]}</Text>
                <Text style={styles.colBase}>{base}</Text>
                <Text style={styles.colClub}>{pip ? `+${pip * 2}%` : '—'}</Text>
                <Text style={[styles.colAfter, pip ? styles.boosted : null]}>{after}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Active Run Modifiers ({modifiers.length})</Text>
        {modifiers.map(m => (
          <Text key={m.id} style={styles.modLine}>
            • {m.description}
          </Text>
        ))}

        <Text style={styles.footnote}>
          Each line's total = ⌈base × club × modifier multiplier⌉ + flat bonus.
        </Text>
      </Pressable>
    </Pressable>
  </Modal>
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
    maxWidth: 360,
    maxHeight: '88%',
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
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#3c4456',
    paddingVertical: 6,
  },
  headerText: {
    color: '#9aa0b2',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  table: { maxHeight: 280 },
  row: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderColor: '#2c3344',
  },
  colHand: { color: '#cfd2dd', fontSize: 12, flex: 2 },
  colBase: { color: '#cfd2dd', fontSize: 12, flex: 0.8, textAlign: 'center' },
  colClub: { color: '#cfd2dd', fontSize: 12, flex: 1, textAlign: 'center' },
  colAfter: { color: '#f4f5f9', fontSize: 12, flex: 1, textAlign: 'right', fontWeight: '600' },
  boosted: { color: '#7cdca0' },
  divider: { height: 1, backgroundColor: '#3c4456', marginVertical: 10 },
  sectionLabel: {
    color: '#9aa0b2',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  modLine: { color: '#cfd2dd', fontSize: 12, marginBottom: 2 },
  footnote: { color: '#9aa0b2', fontSize: 10, marginTop: 10, fontStyle: 'italic' },
});
