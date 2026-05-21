import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isJoker } from '../../game/cards';
import { HAND_BASE_VALUE } from '../../game/scoring';
import { scoreGrid } from '../../game/scoring';
import { suitActionAvailable } from '../../game/actions';
import { Action, GameState } from '../../game/state';
import { HandRank } from '../../game/hands';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { ModifierStrip } from '../components/ModifierStrip';
import { ScoreBar } from '../components/ScoreBar';

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

  useEffect(() => {
    if (state.phase.kind === 'awaiting-action') setSelectedSlot(null);
  }, [state.phase.kind]);

  const liveScore = useMemo(
    () => scoreGrid(state.grid, state.clubs, state.modifiers).total,
    [state.grid, state.clubs, state.modifiers]
  );

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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScoreBar
        deckCount={state.deck.length}
        discardCount={state.discard.length}
        target={state.target}
        difficulty={state.difficulty}
        liveScore={liveScore}
      />
      <ModifierStrip modifiers={state.modifiers} />

      <GridView
        grid={state.grid}
        highlight={highlightedSlots}
        selected={selectedSlot}
        onSlotPress={handleSlotPress}
      />

      <View style={styles.drawArea}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>Drawn card</Text>
          <CardTile card={drawn} size="lg" />
        </View>
        <View style={styles.actionBlock}>{renderActions(state, dispatch, suitActOK)}</View>
      </View>

      <ClubsSummary state={state} />
    </ScrollView>
  );
};

const renderActions = (state: GameState, dispatch: (a: Action) => void, suitActOK: boolean) => {
  const p = state.phase;
  if (p.kind === 'awaiting-action') {
    if (!state.drawn) return null;
    const isJk = isJoker(state.drawn);
    return (
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
    );
  }
  if (p.kind === 'awaiting-target-hearts') {
    return (
      <View style={styles.btnCol}>
        <Text style={styles.hint}>Tap two same-suit cards to swap.</Text>
        <PrimaryButton
          label="Cancel"
          tint="#4d525f"
          onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
        />
      </View>
    );
  }
  if (p.kind === 'awaiting-target-spades') {
    return (
      <View style={styles.btnCol}>
        <Text style={styles.hint}>Tap a card, then its destination.</Text>
        <PrimaryButton
          label="Cancel"
          tint="#4d525f"
          onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
        />
      </View>
    );
  }
  if (p.kind === 'awaiting-target-clubs') {
    return (
      <View style={styles.btnCol}>
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
      <View style={styles.btnCol}>
        <Text style={styles.hint}>Pick one to place. The other returns to discard.</Text>
        <View style={styles.diamondRow}>
          {p.choices.map((c, i) => (
            <Pressable
              key={i}
              style={styles.diamondPick}
              onPress={() => dispatch({ type: 'CHOOSE_DIAMOND', idx: i as 0 | 1 })}
            >
              <CardTile card={c} size="md" />
              <Text style={styles.pickLabel}>Pick</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return null;
};

const ClubsSummary = ({ state }: { state: GameState }) => {
  const entries = Object.entries(state.clubs) as [HandRank, number][];
  if (entries.length === 0) return null;
  return (
    <View style={styles.clubsSummary}>
      <Text style={styles.clubsSummaryTitle}>♣ Boosts</Text>
      {entries.map(([h, pip]) => (
        <Text key={h} style={styles.clubsSummaryItem}>
          {HAND_LABEL[h]} +{pip * 2}%
        </Text>
      ))}
    </View>
  );
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
  content: { paddingBottom: 32 },
  drawArea: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 16,
    alignItems: 'flex-start',
  },
  drawnBlock: { alignItems: 'center', gap: 6 },
  drawnLabel: { color: '#9aa0b2', fontSize: 11, textTransform: 'uppercase' },
  actionBlock: { flex: 1 },
  btnCol: { gap: 8 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { color: '#cfd2dd', fontSize: 12, marginBottom: 4 },
  lockedNote: { color: '#caa44a', fontSize: 11, fontStyle: 'italic' },
  clubsList: { maxHeight: 180 },
  clubsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1d2331',
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  clubsHandLabel: { color: '#f4f5f9', fontSize: 13, fontWeight: '600' },
  clubsHandBase: { color: '#9aa0b2', fontSize: 12 },
  diamondRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  diamondPick: { alignItems: 'center', gap: 4 },
  pickLabel: { color: '#7cdca0', fontSize: 11, fontWeight: '700' },
  clubsSummary: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 8,
    backgroundColor: '#1d2331',
    borderRadius: 6,
  },
  clubsSummaryTitle: { color: '#9aa0b2', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 },
  clubsSummaryItem: { color: '#cfd2dd', fontSize: 12 },
});
