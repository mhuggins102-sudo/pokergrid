import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HandRank } from '../../game/hands';
import { scoreGrid } from '../../game/scoring';
import { GameState } from '../../game/state';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { GridView } from '../components/GridView';

interface Props {
  state: GameState;
  onReplay: () => void;
  onHome: () => void;
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

export const ResultScreen = ({ state, onReplay, onHome }: Props) => {
  const report = useMemo(
    () => scoreGrid(state.grid, state.bonusCards),
    [state.grid, state.bonusCards]
  );
  const { lines: scoredLines, subtotal, gridMultiplier, gridFlat, total } = report;
  const won = total >= state.target;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={[styles.banner, won ? styles.bannerWon : styles.bannerLost]}>
        <Text style={styles.bannerTitle}>{won ? 'You won!' : 'Run complete'}</Text>
        <Text style={styles.bannerScore}>
          {total} / {state.target}
        </Text>
      </View>

      <BonusCardStrip cards={state.bonusCards} />
      <GridView grid={state.grid} />

      <View style={styles.breakdownBlock}>
        <Text style={styles.sectionLabel}>Per-line breakdown</Text>
        {scoredLines.map(line => (
          <View
            key={`${line.kind}-${line.index}`}
            style={[styles.lineRow, line.total > 0 && styles.lineRowActive]}
          >
            <Text style={styles.lineLabel}>
              {line.kind === 'row' ? `Row ${line.index + 1}` : `Col ${line.index + 1}`}
            </Text>
            <Text style={styles.lineHand}>{line.hand ? HAND_LABEL[line.hand] : '—'}</Text>
            <Text style={styles.lineScore}>{line.total}</Text>
          </View>
        ))}
        <View style={styles.subtotalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{subtotal}</Text>
        </View>
        {(gridMultiplier !== 1 || gridFlat !== 0) && (
          <View style={styles.subtotalRow}>
            <Text style={styles.totalLabel}>Grid achievements</Text>
            <Text style={styles.subtotalValue}>
              {gridMultiplier !== 1 ? `× ${gridMultiplier.toFixed(2)}` : ''}
              {gridFlat !== 0 ? ` + ${gridFlat}` : ''}
            </Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalScore}>{total}</Text>
        </View>
      </View>

      <View style={styles.btnRow}>
        <Pressable style={[styles.btn, { backgroundColor: '#3680ff' }]} onPress={onReplay}>
          <Text style={styles.btnLabel}>Play Again ({state.difficulty})</Text>
        </Pressable>
        <Pressable style={[styles.btn, { backgroundColor: '#4d525f' }]} onPress={onHome}>
          <Text style={styles.btnLabel}>Home</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#262c3a' },
  content: { paddingBottom: 40 },
  banner: { paddingVertical: 18, alignItems: 'center', backgroundColor: '#1d2331' },
  bannerWon: { backgroundColor: '#1c4a30' },
  bannerLost: { backgroundColor: '#1d2331' },
  bannerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  bannerScore: { color: '#cfd2dd', fontSize: 16, marginTop: 4 },
  sectionLabel: {
    color: '#9aa0b2',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  breakdownBlock: { paddingHorizontal: 14, marginTop: 16 },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#1d2331',
    marginBottom: 3,
  },
  lineRowActive: { backgroundColor: '#27314a' },
  lineLabel: { color: '#cfd2dd', fontSize: 12, width: 60 },
  lineHand: { color: '#cfd2dd', fontSize: 12, flex: 1 },
  lineScore: { color: '#f4f5f9', fontSize: 13, fontWeight: '700', width: 40, textAlign: 'right' },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  subtotalValue: { color: '#cfd2dd', fontSize: 13, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopColor: '#3c4456',
    borderTopWidth: 1,
    marginTop: 6,
  },
  totalLabel: { color: '#9aa0b2', fontSize: 13 },
  totalScore: { color: '#7cdca0', fontSize: 18, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: 10, padding: 16, justifyContent: 'center' },
  btn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 8 },
  btnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
