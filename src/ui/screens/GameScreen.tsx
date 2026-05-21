import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isJoker, movementPip } from '../../game/cards';
import { suitActionAvailable } from '../../game/actions';
import { LineKind, lowestEmptySlot } from '../../game/grid';
import { HandRank } from '../../game/hands';
import { HAND_BASE_VALUE, scoreGrid } from '../../game/scoring';
import { Action, GameState } from '../../game/state';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { ModifierStrip } from '../components/ModifierStrip';
import { ScoreBar } from '../components/ScoreBar';
import { ScoringReferenceModal } from '../components/ScoringReferenceModal';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

const SUIT_ACTION_LABEL: Record<string, string> = {
  H: 'Swap (♥)',
  S: 'Slide (♠)',
  C: 'Boost (♣)',
  D: 'Reshuffle (♦)',
};

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

export const GameScreen = ({ state, dispatch }: Props) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);

  useEffect(() => {
    if (state.phase.kind === 'awaiting-action') setSelectedSlot(null);
  }, [state.phase.kind]);

  const liveScore = useMemo(
    () => scoreGrid(state.grid, state.clubs, state.modifiers).total,
    [state.grid, state.clubs, state.modifiers]
  );

  const nextSlot = useMemo(() => lowestEmptySlot(state.grid), [state.grid]);

  const drawn = state.drawn;
  const suitActOK =
    state.phase.kind === 'awaiting-action' &&
    suitActionAvailable(drawn, state.grid, state.clubs, state.discard.length);

  const handleSlotPress = (idx: number) => {
    const p = state.phase;
    if (p.kind === 'awaiting-target-hearts') {
      if (selectedSlot === null) {
        if (p.pairs.some(([a, b]) => a === idx || b === idx)) setSelectedSlot(idx);
      } else if (idx === selectedSlot) {
        setSelectedSlot(null);
      } else {
        const pair = p.pairs.find(
          ([a, b]) => (a === selectedSlot && b === idx) || (a === idx && b === selectedSlot)
        );
        if (pair) {
          dispatch({ type: 'RESOLVE_HEARTS', i: pair[0], j: pair[1] });
          setSelectedSlot(null);
        }
      }
    } else if (p.kind === 'awaiting-target-spades') {
      if (selectedSlot === null) {
        if (p.moves.some(m => m.from === idx)) setSelectedSlot(idx);
      } else if (idx === selectedSlot) {
        setSelectedSlot(null);
      } else {
        const move = p.moves.find(m => m.from === selectedSlot && m.to === idx);
        if (move) {
          dispatch({ type: 'RESOLVE_SPADES', from: move.from, to: move.to });
          setSelectedSlot(null);
        }
      }
    }
  };

  const handleLinePress = (kind: LineKind, index: number) => {
    setInspectLine({ kind, index });
  };

  const highlightedSlots = useMemo(() => {
    const out = new Set<number>();
    const p = state.phase;
    if (p.kind === 'awaiting-target-hearts') {
      if (selectedSlot === null) {
        for (const [a, b] of p.pairs) {
          out.add(a);
          out.add(b);
        }
      } else {
        for (const [a, b] of p.pairs) {
          if (a === selectedSlot) out.add(b);
          if (b === selectedSlot) out.add(a);
        }
      }
    } else if (p.kind === 'awaiting-target-spades') {
      if (selectedSlot === null) {
        for (const m of p.moves) out.add(m.from);
      } else {
        for (const m of p.moves) if (m.from === selectedSlot) out.add(m.to);
      }
    }
    return out;
  }, [state.phase, selectedSlot]);

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
    <View style={styles.root}>
      <ScoreBar
        deckCount={state.deck.length}
        discardCount={state.discard.length}
        target={state.target}
        difficulty={state.difficulty}
        liveScore={liveScore}
        onInfoPress={() => setScoringOpen(true)}
      />
      <ModifierStrip modifiers={state.modifiers} />

      <View style={styles.gridWrap}>
        <GridView
          grid={state.grid}
          highlight={highlightedSlots}
          selected={selectedSlot}
          nextSlotHint={state.phase.kind === 'awaiting-action' ? nextSlot : null}
          onSlotPress={handleSlotPress}
          onLinePress={handleLinePress}
        />
      </View>

      <View style={styles.bottom}>{renderBottom(state, dispatch, suitActOK)}</View>

      <ScoringReferenceModal
        visible={scoringOpen}
        onClose={() => setScoringOpen(false)}
        clubs={state.clubs}
        modifiers={state.modifiers}
      />
      {inspectLine && (
        <LineDetailModal
          visible
          onClose={() => setInspectLine(null)}
          kind={inspectLine.kind}
          index={inspectLine.index}
          cards={inspectCards}
          clubs={state.clubs}
          modifiers={state.modifiers}
        />
      )}
    </View>
  );
};

const renderBottom = (
  state: GameState,
  dispatch: (a: Action) => void,
  suitActOK: boolean
) => {
  const p = state.phase;

  if (p.kind === 'awaiting-action') {
    if (!state.drawn) return null;
    const isJk = isJoker(state.drawn);
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>Drawn</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <PrimaryButton label="Place" onPress={() => dispatch({ type: 'PLACE' })} />
          {!isJk && suitActOK && (
            <PrimaryButton
              label={SUIT_ACTION_LABEL[(state.drawn as any).suit]}
              tint="#ffb547"
              onPress={() => dispatch({ type: 'BEGIN_SUIT_ACTION' })}
            />
          )}
          {!isJk && (
            <PrimaryButton
              label="Discard"
              tint="#4d525f"
              onPress={() => dispatch({ type: 'DISCARD_NONE' })}
            />
          )}
          {isJk && <Text style={styles.lockedNote}>Joker must be placed.</Text>}
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-hearts') {
    const pip = state.drawn && !isJoker(state.drawn) ? movementPip(state.drawn) : 0;
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♥ {pip}</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>
            Tap two cards within {pip} position{pip === 1 ? '' : 's'} of each other (wraps).
          </Text>
          <PrimaryButton
            label="Cancel"
            tint="#4d525f"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-spades') {
    const pip = state.drawn && !isJoker(state.drawn) ? movementPip(state.drawn) : 0;
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♠ {pip}</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>
            Tap a card, then its destination ({pip} forward or backward, wraps).
          </Text>
          <PrimaryButton
            label="Cancel"
            tint="#4d525f"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-clubs') {
    return (
      <View style={styles.actionCol}>
        <Text style={styles.hint}>Pick a hand type to boost.</Text>
        <ScrollView style={styles.clubsList}>
          {p.targets.map(h => (
            <Pressable
              key={h}
              style={styles.clubsRow}
              onPress={() => dispatch({ type: 'RESOLVE_CLUBS', hand: h })}
            >
              <Text style={styles.clubsHandLabel}>{HAND_LABEL[h]}</Text>
              <Text style={styles.clubsHandBase}>base {HAND_BASE_VALUE[h]}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <PrimaryButton
          label="Cancel"
          tint="#4d525f"
          onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
        />
      </View>
    );
  }

  if (p.kind === 'diamond-choosing') {
    return (
      <View style={styles.actionCol}>
        <Text style={styles.hint}>
          Pick one to play next (you can then place, discard, or use its suit action). The other
          returns to discard.
        </Text>
        <View style={styles.diamondRow}>
          {p.choices.map((c, i) => (
            <Pressable
              key={i}
              style={styles.diamondPick}
              onPress={() => dispatch({ type: 'CHOOSE_DIAMOND', idx: i as 0 | 1 })}
            >
              <CardTile card={c} size="lg" />
              <Text style={styles.pickLabel}>Pick</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return null;
};

interface ButtonProps {
  label: string;
  onPress: () => void;
  tint?: string;
}
const PrimaryButton = ({ label, onPress, tint = '#3680ff' }: ButtonProps) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.btn, { backgroundColor: tint, opacity: pressed ? 0.85 : 1 }]}
  >
    <Text style={styles.btnLabel}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#262c3a' },
  gridWrap: { alignItems: 'center', paddingVertical: 2 },
  bottom: { flex: 1, paddingHorizontal: 12, paddingTop: 6 },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  actionCol: { gap: 8 },
  drawnBlock: { alignItems: 'center', gap: 4 },
  drawnLabel: { color: '#9aa0b2', fontSize: 10, textTransform: 'uppercase', fontWeight: '700' },
  btnCol: { flex: 1, gap: 6, justifyContent: 'center' },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: { color: '#cfd2dd', fontSize: 11, marginBottom: 2 },
  lockedNote: { color: '#caa44a', fontSize: 11, fontStyle: 'italic' },
  clubsList: { maxHeight: 160 },
  clubsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1d2331',
    padding: 7,
    borderRadius: 6,
    marginBottom: 3,
  },
  clubsHandLabel: { color: '#f4f5f9', fontSize: 12, fontWeight: '600' },
  clubsHandBase: { color: '#9aa0b2', fontSize: 11 },
  diamondRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4 },
  diamondPick: { alignItems: 'center', gap: 4 },
  pickLabel: { color: '#7cdca0', fontSize: 11, fontWeight: '700' },
});
