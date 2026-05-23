import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isJoker } from '../../game/cards';
import { suitActionAvailable } from '../../game/actions';
import { BONUS_HAND_LIMIT } from '../../game/bonusCards';
import { LineKind, nextSpiralSlot } from '../../game/grid';
import { scoreGrid } from '../../game/scoring';
import { Action, GameState } from '../../game/state';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { ScoreBar } from '../components/ScoreBar';
import { ScoringReferenceModal } from '../components/ScoringReferenceModal';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
}

const SUIT_PERK_LABEL: Record<string, string> = {
  H: 'Swap (♥)',
  S: 'Slide (♠)',
  D: 'Destroy (♦)',
  C: 'Bonus (♣)',
};

export const GameScreen = ({ state, dispatch }: Props) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);

  useEffect(() => {
    if (state.phase.kind === 'awaiting-action') setSelectedSlot(null);
  }, [state.phase.kind]);

  const liveScore = useMemo(
    () =>
      scoreGrid(state.grid, state.bonusCards, {
        deckRemaining: state.deck.length,
        ignoreIncompletePenalty: true,
      }).total,
    [state.grid, state.bonusCards, state.deck.length]
  );

  const nextSlot = useMemo(() => nextSpiralSlot(state.grid), [state.grid]);

  const drawn = state.drawn;
  const suitOK =
    state.phase.kind === 'awaiting-action' &&
    suitActionAvailable(drawn, state.grid, state.bonusDeck.length);

  const handleSlotPress = (idx: number) => {
    const p = state.phase;
    if (p.kind === 'awaiting-target-hop') {
      if (selectedSlot === null) {
        if (p.pairs.some(([a, b]) => a === idx || b === idx)) setSelectedSlot(idx);
      } else if (idx === selectedSlot) {
        setSelectedSlot(null);
      } else {
        const pair = p.pairs.find(
          ([a, b]) => (a === selectedSlot && b === idx) || (a === idx && b === selectedSlot)
        );
        if (pair) {
          dispatch({ type: 'RESOLVE_HOP', i: pair[0], j: pair[1] });
          setSelectedSlot(null);
        }
      }
    } else if (p.kind === 'awaiting-target-slide-source') {
      if (p.sources.includes(idx)) {
        dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: idx });
        setSelectedSlot(idx);
      }
    } else if (p.kind === 'awaiting-target-slide-dest') {
      const valid = p.moves.find(m => m.leadingDest === idx);
      if (valid) {
        dispatch({
          type: 'RESOLVE_SLIDE',
          from: valid.from,
          direction: valid.direction,
          distance: valid.distance,
        });
        setSelectedSlot(null);
      }
    } else if (p.kind === 'awaiting-target-destroy') {
      if (p.targets.includes(idx)) {
        dispatch({ type: 'RESOLVE_DESTROY', slot: idx });
      }
    }
  };

  const highlightedSlots = useMemo(() => {
    const out = new Set<number>();
    const p = state.phase;
    if (p.kind === 'awaiting-target-hop') {
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
    } else if (p.kind === 'awaiting-target-slide-source') {
      for (const s of p.sources) out.add(s);
    } else if (p.kind === 'awaiting-target-slide-dest') {
      for (const m of p.moves) out.add(m.leadingDest);
      out.add(p.source);
    } else if (p.kind === 'awaiting-target-destroy') {
      for (const t of p.targets) out.add(t);
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
        trashCount={state.trash.length}
        bonusDeckCount={state.bonusDeck.length}
        target={state.target}
        difficulty={state.difficulty}
        liveScore={liveScore}
        onInfoPress={() => setScoringOpen(true)}
      />
      <BonusCardStrip
        cards={state.bonusCards}
        selectedIdx={
          state.phase.kind === 'bonus-card-replacing' ? null : undefined
        }
      />

      <View style={styles.gridWrap}>
        <GridView
          grid={state.grid}
          highlight={highlightedSlots}
          selected={selectedSlot}
          nextSlotHint={state.phase.kind === 'awaiting-action' ? nextSlot : null}
          onSlotPress={handleSlotPress}
          onLinePress={(kind, index) => setInspectLine({ kind, index })}
        />
      </View>

      <View style={styles.bottom}>{renderBottom(state, dispatch, suitOK)}</View>

      <ScoringReferenceModal
        visible={scoringOpen}
        onClose={() => setScoringOpen(false)}
        bonusCards={state.bonusCards}
      />
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
    </View>
  );
};

const renderBottom = (state: GameState, dispatch: (a: Action) => void, suitOK: boolean) => {
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
          <Btn label="Place" onPress={() => dispatch({ type: 'PLACE' })} />
          {!isJk && suitOK && (
            <Btn
              label={SUIT_PERK_LABEL[(state.drawn as any).suit]}
              tint="#ffb547"
              onPress={() => dispatch({ type: 'BEGIN_SUIT_ACTION' })}
            />
          )}
          {!isJk && (
            <Btn
              label="Trash"
              tint="#7a4040"
              onPress={() => dispatch({ type: 'DISCARD_NONE' })}
            />
          )}
          {isJk && <Text style={styles.lockedNote}>Joker must be placed.</Text>}
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-hop') {
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♥ Swap</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap two cards that share a row or a column.</Text>
          <Btn label="Cancel" tint="#4d525f" onPress={() => dispatch({ type: 'CANCEL_ACTION' })} />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-slide-source') {
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap a card to slide.</Text>
          <Btn label="Cancel" tint="#4d525f" onPress={() => dispatch({ type: 'CANCEL_ACTION' })} />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-slide-dest') {
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>
            Tap a destination — the whole connected chain slides together.
          </Text>
          <Btn label="Pick a different card" tint="#4d525f" onPress={() => dispatch({ type: 'CANCEL_ACTION' })} />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-destroy') {
    return (
      <View style={styles.actionRow}>
        <View style={styles.drawnBlock}>
          <Text style={styles.drawnLabel}>♦ Destroy</Text>
          <CardTile card={state.drawn} size="lg" />
        </View>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap any card on the grid to trash it.</Text>
          <Btn label="Cancel" tint="#4d525f" onPress={() => dispatch({ type: 'CANCEL_ACTION' })} />
        </View>
      </View>
    );
  }

  if (p.kind === 'bonus-card-resolving') {
    const atMax = state.bonusCards.length >= BONUS_HAND_LIMIT;
    return (
      <View style={styles.actionCol}>
        <Text style={styles.hint}>
          {atMax
            ? "You\'re at 3 bonus cards. Pick one of the drawn — you must swap an old one out."
            : 'Pick one of the drawn bonus cards to keep, or decline.'}
        </Text>
        <View style={styles.bonusRow}>
          {p.drawn.map((b, i) => (
            <Pressable
              key={i}
              style={styles.bonusPick}
              onPress={() =>
                atMax
                  ? dispatch({ type: 'BONUS_SELECT_NEW', idx: i })
                  : dispatch({ type: 'BONUS_KEEP', idx: i })
              }
            >
              <Text style={styles.bonusName} numberOfLines={1}>{b.name}</Text>
              <Text style={styles.bonusDesc} numberOfLines={3}>{b.description}</Text>
            </Pressable>
          ))}
        </View>
        {!atMax && (
          <Btn label="Decline both" tint="#4d525f" onPress={() => dispatch({ type: 'BONUS_DECLINE' })} />
        )}
      </View>
    );
  }

  if (p.kind === 'bonus-card-replacing') {
    const newCard = p.drawn[p.pickedNew];
    return (
      <View style={styles.actionCol}>
        <Text style={styles.hint}>
          Tap one of your 3 to replace with "{newCard?.name}". The old one is discarded for good.
        </Text>
        <View style={styles.bonusRow}>
          {state.bonusCards.map((b, i) => (
            <Pressable
              key={i}
              style={styles.bonusPick}
              onPress={() => dispatch({ type: 'BONUS_REPLACE', oldIdx: i })}
            >
              <Text style={styles.bonusName} numberOfLines={1}>{b.name}</Text>
              <Text style={styles.bonusDesc} numberOfLines={3}>{b.description}</Text>
            </Pressable>
          ))}
        </View>
        <Btn label="Back" tint="#4d525f" onPress={() => dispatch({ type: 'CANCEL_ACTION' })} />
      </View>
    );
  }

  return null;
};

interface BtnProps {
  label: string;
  onPress: () => void;
  tint?: string;
}
const Btn = ({ label, onPress, tint = '#3680ff' }: BtnProps) => (
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
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hint: { color: '#cfd2dd', fontSize: 11, marginBottom: 2 },
  lockedNote: { color: '#caa44a', fontSize: 11, fontStyle: 'italic' },
  bonusRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 4,
  },
  bonusPick: {
    flex: 1,
    backgroundColor: '#f1efe6',
    borderColor: '#d6cfa7',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    maxWidth: 160,
  },
  bonusName: { fontSize: 12, fontWeight: '700', color: '#5d4f1a' },
  bonusDesc: { fontSize: 10, color: '#776230', marginTop: 2 },
});
