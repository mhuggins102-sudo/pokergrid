import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { suitActionAvailable } from '../../game/actions';
import { isJoker } from '../../game/cards';
import { BONUS_HAND_LIMIT } from '../../game/bonusCards';
import { LineKind, nextSpiralSlot } from '../../game/grid';
import { scoreGrid } from '../../game/scoring';
import { Action, GameState } from '../../game/state';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { NeonButton } from '../components/NeonButton';
import { ScoreBar } from '../components/ScoreBar';
import { ScoringReferenceModal } from '../components/ScoringReferenceModal';
import { useHaptic } from '../haptics';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

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

const SUIT_PERK_VARIANT: Record<string, 'primary' | 'warn' | 'danger'> = {
  H: 'warn',
  S: 'warn',
  D: 'danger',
  C: 'warn',
};

// Drawn-card area: card fades + scales in on every change so each new draw
// reads as a beat.
const DrawnArea = ({
  drawnKey,
  children,
}: {
  drawnKey: string;
  children: React.ReactNode;
}) => {
  const { settings } = useSettings();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (settings.reduceMotion) return;
    opacity.value = 0;
    scale.value = 0.85;
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withTiming(1, { duration: 280 });
  }, [drawnKey, opacity, scale, settings.reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.drawnBlock, style]}>{children}</Animated.View>;
};

export const GameScreen = ({ state, dispatch }: Props) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const haptic = useHaptic();

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

  const fire = (a: Action, h: 'light' | 'medium' | 'heavy' = 'medium') => {
    haptic(h);
    dispatch(a);
  };

  const handleSlotPress = (idx: number) => {
    const p = state.phase;
    if (p.kind === 'awaiting-target-hop') {
      if (selectedSlot === null) {
        if (p.pairs.some(([a, b]) => a === idx || b === idx)) {
          haptic('light');
          setSelectedSlot(idx);
        }
      } else if (idx === selectedSlot) {
        setSelectedSlot(null);
      } else {
        const pair = p.pairs.find(
          ([a, b]) => (a === selectedSlot && b === idx) || (a === idx && b === selectedSlot)
        );
        if (pair) {
          fire({ type: 'RESOLVE_HOP', i: pair[0], j: pair[1] }, 'medium');
          setSelectedSlot(null);
        }
      }
    } else if (p.kind === 'awaiting-target-slide-source') {
      if (p.sources.includes(idx)) {
        haptic('light');
        dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: idx });
        setSelectedSlot(idx);
      }
    } else if (p.kind === 'awaiting-target-slide-dest') {
      const valid = p.moves.find(m => m.leadingDest === idx);
      if (valid) {
        fire(
          {
            type: 'RESOLVE_SLIDE',
            from: valid.from,
            direction: valid.direction,
            distance: valid.distance,
          },
          'medium'
        );
        setSelectedSlot(null);
      }
    } else if (p.kind === 'awaiting-target-destroy') {
      if (p.targets.includes(idx)) {
        fire({ type: 'RESOLVE_DESTROY', slot: idx }, 'heavy');
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

  const drawnKey = drawn
    ? isJoker(drawn) ? 'joker' : `${drawn.rank}${drawn.suit}`
    : 'none';

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
      <BonusCardStrip cards={state.bonusCards} />

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

      <View style={styles.bottom}>
        {renderBottom(state, fire, dispatch, haptic, suitOK, drawnKey)}
      </View>

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

const renderBottom = (
  state: GameState,
  fire: (a: Action, h?: 'light' | 'medium' | 'heavy') => void,
  dispatch: (a: Action) => void,
  haptic: (k: 'light' | 'medium' | 'heavy' | 'warning') => void,
  suitOK: boolean,
  drawnKey: string
) => {
  const p = state.phase;

  if (p.kind === 'awaiting-action') {
    if (!state.drawn) return null;
    const isJk = isJoker(state.drawn);
    const suit = !isJk ? (state.drawn as any).suit : null;
    return (
      <View style={styles.actionRow}>
        <DrawnArea drawnKey={drawnKey}>
          <Text style={styles.drawnLabel}>Drawn</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <NeonButton
            label="Place"
            variant="primary"
            onPress={() => fire({ type: 'PLACE' }, 'medium')}
          />
          {!isJk && suitOK && suit && (
            <NeonButton
              label={SUIT_PERK_LABEL[suit]}
              variant={SUIT_PERK_VARIANT[suit]}
              onPress={() => fire({ type: 'BEGIN_SUIT_ACTION' }, 'light')}
            />
          )}
          {!isJk && (
            <NeonButton
              label="Trash"
              variant="secondary"
              size="sm"
              onPress={() => fire({ type: 'DISCARD_NONE' }, 'light')}
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
        <DrawnArea drawnKey={drawnKey + '-hop'}>
          <Text style={[styles.drawnLabel, { color: colors.suitH }]}>♥ Swap</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap two cards that share a row or column.</Text>
          <NeonButton
            label="Cancel"
            variant="secondary"
            size="sm"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-slide-source') {
    return (
      <View style={styles.actionRow}>
        <DrawnArea drawnKey={drawnKey + '-slide'}>
          <Text style={[styles.drawnLabel, { color: colors.suitS }]}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap a card to slide.</Text>
          <NeonButton
            label="Cancel"
            variant="secondary"
            size="sm"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-slide-dest') {
    return (
      <View style={styles.actionRow}>
        <DrawnArea drawnKey={drawnKey + '-slide-dest'}>
          <Text style={[styles.drawnLabel, { color: colors.suitS }]}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>
            Tap a destination — the chain in front of the picked card slides together.
          </Text>
          <NeonButton
            label="Pick a different card"
            variant="secondary"
            size="sm"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'awaiting-target-destroy') {
    return (
      <View style={styles.actionRow}>
        <DrawnArea drawnKey={drawnKey + '-destroy'}>
          <Text style={[styles.drawnLabel, { color: colors.suitD }]}>♦ Destroy</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap any card on the grid to trash it.</Text>
          <NeonButton
            label="Cancel"
            variant="secondary"
            size="sm"
            onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
          />
        </View>
      </View>
    );
  }

  if (p.kind === 'bonus-card-resolving') {
    const atMax = state.bonusCards.length >= BONUS_HAND_LIMIT;
    return (
      <View style={styles.actionCol}>
        <Text style={[styles.drawnLabel, { color: colors.suitC, textAlign: 'center' }]}>
          ♣ Bonus
        </Text>
        <Text style={styles.hint}>
          {atMax
            ? 'You\'re at 3 bonus cards. Pick one to swap in — old one is dropped.'
            : 'Pick one of the drawn bonus cards to keep, or decline.'}
        </Text>
        <View style={styles.bonusRow}>
          {p.drawn.map((b, i) => (
            <Pressable
              key={i}
              style={styles.bonusPick}
              onPress={() => {
                haptic('light');
                dispatch(
                  atMax
                    ? { type: 'BONUS_SELECT_NEW', idx: i }
                    : { type: 'BONUS_KEEP', idx: i }
                );
              }}
            >
              <Text style={styles.bonusName} numberOfLines={2}>{b.name}</Text>
              <Text style={styles.bonusDesc} numberOfLines={4}>{b.description}</Text>
            </Pressable>
          ))}
        </View>
        {!atMax && (
          <NeonButton
            label="Decline both"
            variant="secondary"
            size="sm"
            onPress={() => dispatch({ type: 'BONUS_DECLINE' })}
          />
        )}
      </View>
    );
  }

  if (p.kind === 'bonus-card-replacing') {
    const newCard = p.drawn[p.pickedNew];
    return (
      <View style={styles.actionCol}>
        <Text style={[styles.drawnLabel, { color: colors.suitC, textAlign: 'center' }]}>
          ♣ Bonus — Replace
        </Text>
        <Text style={styles.hint}>
          Tap one of your 3 to replace with "{newCard?.name}". The old one is gone for good.
        </Text>
        <View style={styles.bonusRow}>
          {state.bonusCards.map((b, i) => (
            <Pressable
              key={i}
              style={styles.bonusPick}
              onPress={() => {
                haptic('medium');
                dispatch({ type: 'BONUS_REPLACE', oldIdx: i });
              }}
            >
              <Text style={styles.bonusName} numberOfLines={2}>{b.name}</Text>
              <Text style={styles.bonusDesc} numberOfLines={4}>{b.description}</Text>
            </Pressable>
          ))}
        </View>
        <NeonButton
          label="Back"
          variant="secondary"
          size="sm"
          onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
        />
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  gridWrap: { alignItems: 'center', paddingVertical: spacing.xs },
  bottom: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  actionCol: { gap: spacing.sm, alignItems: 'stretch' },
  drawnBlock: { alignItems: 'center', gap: spacing.xs },
  drawnLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 2,
  },
  btnCol: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  hint: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 2,
  },
  lockedNote: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 1,
  },
  bonusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  bonusPick: {
    flex: 1,
    backgroundColor: colors.bgGlass,
    borderColor: colors.warn,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.sm,
    maxWidth: 170,
    ...glow(colors.warn, 8, 0.4),
  },
  bonusName: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    color: colors.warn,
    letterSpacing: 0.5,
  },
  bonusDesc: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.textMid,
    marginTop: 4,
    lineHeight: 14,
  },
});
