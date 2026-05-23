import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BonusCard, universalEffectFor, universalEffectSum } from '../../game/bonusCards';
import { HandRank } from '../../game/hands';
import { HAND_BASE_VALUE } from '../../game/scoring';

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

const HAND_ORDER: HandRank[] = [
  'HIGH_CARD', 'PAIR', 'TWO_PAIR', 'THREE_OF_A_KIND', 'STRAIGHT', 'FLUSH',
  'FULL_HOUSE', 'FOUR_OF_A_KIND', 'STRAIGHT_FLUSH', 'FIVE_OF_A_KIND', 'ROYAL_FLUSH',
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
            <Text style={styles.title}>Scoring Reference</Text>
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
                <Text style={styles.sectionLabel}>Conditional bonus cards</Text>
                {conditional.map(b => (
                  <Text key={b.id} style={styles.modLine}>• {b.description}</Text>
                ))}
              </>
            )}

            {gridLevel.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>Grid achievements (multiply final total)</Text>
                {gridLevel.map(b => (
                  <Text key={b.id} style={styles.modLine}>• {b.description}</Text>
                ))}
              </>
            )}

            <Text style={styles.footnote}>
              Bonus multipliers compose multiplicatively: total per line = ⌈base × Π multipliers⌉
              + flats. Grid achievements multiply the summed total. Incomplete lines (fewer than
              5 cards) cost 25 points each.
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
  scroll: { maxHeight: 480 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderColor: '#2c3344',
  },
  handCol: { flex: 1 },
  handName: { color: '#cfd2dd', fontSize: 13 },
  bonusSub: { color: '#9aa0b2', fontSize: 10, marginTop: 1 },
  value: { color: '#cfd2dd', fontSize: 14, fontWeight: '600', minWidth: 40, textAlign: 'right' },
  baseStrike: {
    color: '#6a6f7d',
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginRight: 4,
  },
  arrow: { color: '#9aa0b2', fontSize: 12, marginRight: 4 },
  valueBoosted: {
    color: '#7cdca0',
    fontSize: 16,
    fontWeight: '800',
    minWidth: 40,
    textAlign: 'right',
  },
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
