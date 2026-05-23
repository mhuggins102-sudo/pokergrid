import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineKind } from '../../game/grid';
import { HandRank } from '../../game/hands';
import { scoreGrid } from '../../game/scoring';
import { GameState } from '../../game/state';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';

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
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const report = useMemo(
    () => scoreGrid(state.grid, state.bonusCards, { deckRemaining: state.deck.length }),
    [state.grid, state.bonusCards, state.deck.length]
  );
  const {
    lines: scoredLines,
    subtotal,
    incompletePenalty,
    gridMultiplier,
    gridFlat,
    total,
  } = report;
  const won = total >= state.target;

  const inspectCards = useMemo(() => {
    if (!inspectLine) return [];
    if (inspectLine.kind === 'row') {
      return state.grid.slice(inspectLine.index * 5, inspectLine.index * 5 + 5);
    }
    const out = [];
    for (let r = 0; r < 5; r++) out.push(state.grid[r * 5 + inspectLine.index]);
    return out;
  }, [state.grid, inspectLine]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={[styles.banner, won ? styles.bannerWon : styles.bannerLost]}>
        <Text style={styles.bannerTitle}>{won ? 'You won!' : 'Run complete'}</Text>
        <Text style={styles.bannerScore}>
          {total} / {state.target}
        </Text>
      </View>

      <BonusCardStrip cards={state.bonusCards} />
      <GridView
        grid={state.grid}
        onLinePress={(kind, index) => setInspectLine({ kind, index })}
      />

      <View style={styles.breakdownBlock}>
        <Text style={styles.sectionLabel}>Per-line breakdown</Text>
        {scoredLines.map(line => (
          <Pressable
            key={`${line.kind}-${line.index}`}
            onPress={() => setInspectLine({ kind: line.kind, index: line.index })}
            style={[
              styles.lineRow,
              line.total > 0 && styles.lineRowActive,
              line.total < 0 && styles.lineRowPenalty,
            ]}
          >
            <Text style={styles.lineLabel}>
              {line.kind === 'row' ? `Row ${line.index + 1}` : `Col ${line.index + 1}`}
            </Text>
            <Text style={styles.lineHand}>
              {line.hand ? HAND_LABEL[line.hand] : line.incomplete ? 'Incomplete' : '—'}
            </Text>
            <Text
              style={[
                styles.lineScore,
                line.total < 0 && styles.lineScorePenalty,
              ]}
            >
              {line.total}
            </Text>
          </Pressable>
        ))}
        <View style={styles.subtotalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{subtotal}</Text>
        </View>
        {incompletePenalty < 0 && (
          <View style={styles.subtotalRow}>
            <Text style={styles.totalLabel}>Incomplete penalty (in subtotal)</Text>
            <Text style={styles.penaltyValue}>{incompletePenalty}</Text>
          </View>
        )}
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

      {inspectLine && (
        <LineDetailModal
          visible
          onClose={() => setInspectLine(null)}
          kind={inspectLine.kind}
          index={inspectLine.index}
          cards={inspectCards}
          bonusCards={state.bonusCards}
        />
      )}

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
  lineRowPenalty: { backgroundColor: '#4a2727' },
  lineScorePenalty: { color: '#f08585' },
  penaltyValue: { color: '#f08585', fontSize: 13, fontWeight: '700' },
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
