import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { slideDestinationsFrom, suitActionAvailable } from '../../game/actions';
import { Card, isJoker } from '../../game/cards';
import { BONUS_HAND_LIMIT } from '../../game/bonusCards';
import {
  Direction,
  GRID_SIZE,
  LineKind,
  nextSpiralSlot,
  slideChain,
  SPIRAL_ORDER,
} from '../../game/grid';
import { bonusShapleyValues, scoreGrid } from '../../game/scoring';
import { Action, canPreviewDeck, GameState } from '../../game/state';
import {
  ANIM_DURATION,
  AnimationLayer,
  AnimSpec,
  hiddenSlotsFor,
} from '../components/AnimationLayer';
import { styleFor as bonusStyleFor } from '../bonusCardCategory';
import { BonusCardDetailModal } from '../components/BonusCardDetailModal';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { RemainingDeckModal } from '../components/RemainingDeckModal';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { NeonButton } from '../components/NeonButton';
import { ScoreBar, UndoState as UndoStateKind } from '../components/ScoreBar';
import { ScoringReferenceModal } from '../components/ScoringReferenceModal';
import { useHaptic } from '../haptics';
import { useSettings } from '../settings';
import { useSound } from '../sound';
import { colors, fonts, glow, gridCellSize, radius, spacing } from '../theme';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  onHome?: () => void;
  kicker?: string;
  // Per-mode undo cap. 0 = no undo button (challenge mode). Infinity = unlimited
  // (free play). 1 = one undo per run (targets-up).
  maxUndos?: number;
}

const SUIT_PERK_LABEL: Record<string, string> = {
  H: 'Swap',
  S: 'Slide',
  D: 'Destroy',
  C: 'Bonus',
};

const SUIT_PERK_VARIANT: Record<string, 'primary' | 'warn' | 'danger'> = {
  H: 'warn',
  S: 'warn',
  D: 'danger',
  C: 'warn',
};

// Drawn-card area: card fades + scales in on every change so each new draw
// reads as a beat. The duration is intentionally slow so placing feels weighty.
const DrawnArea = ({
  drawnKey,
  children,
  deckCount,
  perkCount,
  onDeckPress,
}: {
  drawnKey: string;
  children: React.ReactNode;
  deckCount?: number;
  // Number of playing cards the player has spent on suit perks across the run.
  // Surfaced for Burnout / Frugal bonus card thresholds.
  perkCount?: number;
  // When provided, tapping anywhere on the drawn card area opens the
  // remaining-deck preview (Easy difficulty only).
  onDeckPress?: () => void;
}) => {
  const { settings } = useSettings();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (settings.reduceMotion) return;
    opacity.value = 0;
    scale.value = 0.85;
    opacity.value = withTiming(1, { duration: 320 });
    scale.value = withTiming(1, { duration: 420 });
  }, [drawnKey, opacity, scale, settings.reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const deckLabel = deckCount !== undefined ? `deck ${deckCount}` : null;
  const body = (
    <Animated.View style={[styles.drawnBlock, style]}>
      {children}
      {deckLabel !== null && (
        <Text
          style={[
            styles.deckUnderDrawn,
            onDeckPress && styles.deckUnderDrawnLink,
          ]}
        >
          {deckLabel}{onDeckPress ? ' ⓘ' : ''}
        </Text>
      )}
      {perkCount !== undefined && (
        <Text style={styles.perkUnderDrawn}>perks {perkCount}</Text>
      )}
    </Animated.View>
  );
  return onDeckPress ? (
    <Pressable onPress={onDeckPress}>{body}</Pressable>
  ) : (
    body
  );
};

export const GameScreen = ({
  state,
  dispatch,
  onHome,
  kicker,
  maxUndos = Infinity,
}: Props) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [bonusDetailIdx, setBonusDetailIdx] = useState<number | null>(null);
  const [deckPreviewOpen, setDeckPreviewOpen] = useState(false);
  const deckPeekAllowed = canPreviewDeck(state.difficulty);
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const [anim, setAnim] = useState<AnimSpec | null>(null);
  const [undoWarnOpen, setUndoWarnOpen] = useState(false);
  const [slideGhost, setSlideGhost] = useState<Set<number> | null>(null);
  const slideGhostKeyRef = useRef<string>('');
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const haptic = useHaptic();
  const playSound = useSound();
  const { settings, update: updateSettings } = useSettings();

  // Undo button state. Hidden in challenge mode (maxUndos === 0); greyed when
  // there's nothing on the snapshot stack or we've hit the per-mode cap.
  const undoState: UndoStateKind =
    maxUndos === 0
      ? 'hidden'
      : state.past.length === 0 || state.undoCount >= maxUndos
      ? 'unavailable'
      : 'available';

  const doUndo = () => {
    haptic('light');
    playSound('tap');
    setSelectedSlot(null);
    dispatch({ type: 'UNDO' });
  };

  const handleUndoPress = () => {
    if (settings.undoWarningSeen) {
      doUndo();
      return;
    }
    setUndoWarnOpen(true);
  };

  const confirmUndoWarning = () => {
    updateSettings({ undoWarningSeen: true });
    setUndoWarnOpen(false);
    doUndo();
  };

  useEffect(() => {
    if (state.phase.kind === 'awaiting-action') setSelectedSlot(null);
  }, [state.phase.kind]);

  // Cancel any pending animation if we unmount.
  useEffect(() => () => {
    if (animTimer.current) clearTimeout(animTimer.current);
  }, []);

  // Intro animation: when the game first mounts, replay the place animations
  // for the cards the reducer auto-placed at start (the seeded center card
  // plus any jokers drawn before the first interactive card). Skips entirely
  // when reduce-motion is on.
  const introPlayedRef = useRef(false);
  useEffect(() => {
    if (introPlayedRef.current) return;
    introPlayedRef.current = true;
    if (settings.reduceMotion) return;
    const placed: Array<{ slot: number; card: NonNullable<GameState['grid'][number]> }> = [];
    for (const slot of SPIRAL_ORDER) {
      const c = state.grid[slot];
      if (c) placed.push({ slot, card: c });
      else break;
    }
    if (placed.length === 0) return;
    let delay = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    placed.forEach(({ slot, card }) => {
      const isJk = isJoker(card);
      const spec: AnimSpec = isJk
        ? { kind: 'joker-place', card, toSlot: slot }
        : { kind: 'place', card, toSlot: slot };
      const sound: 'place' | 'joker' = isJk ? 'joker' : 'place';
      const dur = ANIM_DURATION[spec.kind];
      timers.push(setTimeout(() => {
        playSound(sound);
        setAnim(spec);
      }, delay));
      delay += dur + 80;
    });
    // Clear the overlay after the last animation finishes.
    timers.push(setTimeout(() => setAnim(null), delay));
    return () => timers.forEach(clearTimeout);
    // Only run on mount; we explicitly don't want this to re-run on every
    // render that updates state.grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mid-game joker auto-place: the reducer's drawNext silently lands the
  // joker on the spiral and continues drawing, so the UI never sees a
  // "joker drawn" beat. Watch the grid for a freshly arrived joker and
  // play the special animation + sound on top of the (already updated) cell.
  // hiddenSlotsFor('joker-place') hides the static cell while the overlay
  // performs the entrance.
  const prevJokerSlotRef = useRef<number | null | 'uninit'>('uninit');
  useEffect(() => {
    let current: number | null = null;
    for (let i = 0; i < state.grid.length; i++) {
      const c = state.grid[i];
      if (c && isJoker(c)) {
        current = i;
        break;
      }
    }
    const prev = prevJokerSlotRef.current;
    prevJokerSlotRef.current = current;
    // First run: just record the starting slot. The intro effect handles any
    // joker that was seeded at mount time.
    if (prev === 'uninit') return;
    // Only fire when a joker just appeared at a NEW slot.
    if (current === null || current === prev) return;
    if (settings.reduceMotion) return;
    const card = state.grid[current];
    if (!card) return;
    playSound('joker');
    haptic('joker');
    setAnim({ kind: 'joker-place', card, toSlot: current });
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(null), ANIM_DURATION['joker-place']);
  }, [state.grid, settings.reduceMotion, playSound, haptic]);

  const liveScore = useMemo(
    () =>
      scoreGrid(state.grid, state.bonusCards, {
        deckRemaining: state.deck.length,
        ignoreIncompletePenalty: true,
        discards: state.discards,
        perkSpent: state.perkSpent,
      }).total,
    [
      state.grid,
      state.bonusCards,
      state.deck.length,
      state.discards,
      state.perkSpent,
    ]
  );

  // Shapley-value attribution of the bonus contribution, so multiple cards
  // stacking multiplicatively don't each "claim" the joint multiplier. Sum of
  // these values = live score − live score with no bonuses (no double-count).
  const bonusValues = useMemo(
    () =>
      bonusShapleyValues(state.grid, state.bonusCards, {
        deckRemaining: state.deck.length,
        ignoreIncompletePenalty: true,
        discards: state.discards,
        perkSpent: state.perkSpent,
      }),
    [
      state.grid,
      state.bonusCards,
      state.deck.length,
      state.discards,
      state.perkSpent,
    ]
  );

  const nextSlot = useMemo(() => nextSpiralSlot(state.grid), [state.grid]);

  const drawn = state.drawn;
  const suitOK =
    state.phase.kind === 'awaiting-action' &&
    suitActionAvailable(
      drawn,
      state.grid,
      state.bonusDeck.length,
      state.bonusCards.length,
      state.noSwap
    );

  // Trigger an animation, then dispatch the action when it ends.
  const performAnimated = (spec: AnimSpec, action: Action) => {
    const duration = ANIM_DURATION[spec.kind];
    if (settings.reduceMotion) {
      dispatch(action);
      return;
    }
    setAnim(spec);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => {
      dispatch(action);
      setAnim(null);
    }, duration);
  };

  const handlePlace = () => {
    if (!state.drawn || nextSlot === null) return;
    haptic('place');
    playSound('place');
    performAnimated({ kind: 'place', card: state.drawn, toSlot: nextSlot }, { type: 'PLACE' });
  };

  // Shared slide commit. Reused by the tap-on-dest path and the drag-release
  // path so they produce identical animations and dispatches.
  const commitSlide = (from: number, direction: Direction, distance: number) => {
    const chainSlots = slideChain(state.grid, from, direction);
    const step =
      direction === 'up' ? -GRID_SIZE
      : direction === 'down' ? GRID_SIZE
      : direction === 'left' ? -1
      : 1;
    const cards = chainSlots
      .map(slot => ({
        card: state.grid[slot],
        from: slot,
        to: slot + step * distance,
      }))
      .filter((c): c is { card: Card; from: number; to: number } => c.card !== null);
    haptic('slide');
    playSound('slide');
    // The drag path skips the explicit "select source" tap, so when we arrive
    // here the phase is still awaiting-target-slide-source — the reducer
    // would reject the RESOLVE_SLIDE. Move into the dest phase first; React
    // batches both dispatches and the queued RESOLVE_SLIDE fires once the
    // animation timer expires, with the phase already transitioned.
    if (state.phase.kind === 'awaiting-target-slide-source') {
      dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: from });
    }
    performAnimated(
      { kind: 'slide', cards },
      { type: 'RESOLVE_SLIDE', from, direction, distance }
    );
    setSelectedSlot(null);
  };

  const handleSlotPress = (idx: number) => {
    if (anim) return;
    const p = state.phase;
    if (p.kind === 'awaiting-target-hop') {
      if (selectedSlot === null) {
        if (p.pairs.some(([a, b]) => a === idx || b === idx)) {
          haptic('light');
          playSound('tap');
          setSelectedSlot(idx);
        }
      } else if (idx === selectedSlot) {
        setSelectedSlot(null);
      } else {
        const pair = p.pairs.find(
          ([a, b]) => (a === selectedSlot && b === idx) || (a === idx && b === selectedSlot)
        );
        if (pair) {
          const cardA = state.grid[pair[0]];
          const cardB = state.grid[pair[1]];
          if (cardA && cardB) {
            haptic('swap');
            playSound('swap');
            performAnimated(
              { kind: 'swap', cardA, slotA: pair[0], cardB, slotB: pair[1] },
              { type: 'RESOLVE_HOP', i: pair[0], j: pair[1] }
            );
            setSelectedSlot(null);
          }
        }
      }
    } else if (p.kind === 'awaiting-target-slide-source') {
      if (p.sources.includes(idx)) {
        haptic('light');
        playSound('tap');
        dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: idx });
        setSelectedSlot(idx);
      }
    } else if (p.kind === 'awaiting-target-slide-dest') {
      const valid = p.moves.find(m => m.leadingDest === idx);
      if (valid) {
        commitSlide(valid.from, valid.direction, valid.distance);
      }
    } else if (p.kind === 'awaiting-target-destroy') {
      if (p.targets.includes(idx)) {
        const card = state.grid[idx];
        if (card) {
          haptic('destroy');
          playSound('destroy');
          performAnimated(
            { kind: 'destroy', card, slot: idx },
            { type: 'RESOLVE_DESTROY', slot: idx }
          );
        }
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

  // Soft chime on every new drawn card so the rhythm of the game is audible.
  const prevDrawnSig = useRef(drawnKey);
  useEffect(() => {
    if (drawnKey !== prevDrawnSig.current && drawnKey !== 'none') {
      playSound('draw');
    }
    prevDrawnSig.current = drawnKey;
  }, [drawnKey, playSound]);

  // ---- Drag-to-slide ---------------------------------------------------
  // Pan a valid source card and release in a direction; the chain commits.
  // Quick taps fall through to the existing onSlotPress handler because Pan
  // requires ≥6px of movement before activating.
  const dragSourceRef = useRef<number | null>(null);
  const clearDragRef = () => { dragSourceRef.current = null; };

  // Inverse of slotXY() in AnimationLayer / GridView. Coords are relative to
  // the GestureDetector's view (the grid stack).
  const slotFromXY = (x: number, y: number): number | null => {
    const HEADER = 20;
    const CELL = gridCellSize;
    const col = Math.floor((x - HEADER) / CELL);
    const row = Math.floor((y - HEADER) / CELL);
    if (row < 0 || row > 4 || col < 0 || col > 4) return null;
    return row * 5 + col;
  };

  const onDragStart = (x: number, y: number) => {
    const p = state.phase;
    if (p.kind !== 'awaiting-target-slide-source' || anim) {
      dragSourceRef.current = null;
      return;
    }
    const slot = slotFromXY(x, y);
    if (slot === null || !p.sources.includes(slot)) {
      dragSourceRef.current = null;
      return;
    }
    dragSourceRef.current = slot;
    haptic('light');
    playSound('tap');
  };

  // Mid-drag preview: compute where the chain will land at the current
  // direction + distance and surface the slots to GridView as ghost
  // outlines. State updates are gated on the slot-set actually changing so
  // we don't re-render the grid every gesture frame.
  const setSlideGhostIfChanged = (next: Set<number> | null) => {
    const key = next ? Array.from(next).sort((a, b) => a - b).join(',') : '';
    if (key === slideGhostKeyRef.current) return;
    slideGhostKeyRef.current = key;
    setSlideGhost(next);
  };

  const onDragUpdate = (dx: number, dy: number) => {
    const source = dragSourceRef.current;
    if (source === null) {
      setSlideGhostIfChanged(null);
      return;
    }
    if (state.phase.kind !== 'awaiting-target-slide-source') {
      setSlideGhostIfChanged(null);
      return;
    }
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Below the activeOffset threshold there's no committed direction yet.
    if (absX < 18 && absY < 18) {
      setSlideGhostIfChanged(null);
      return;
    }
    const direction: Direction =
      absX > absY
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up';
    const moves = slideDestinationsFrom(state.grid, source)
      .filter(m => m.direction === direction);
    if (moves.length === 0) {
      setSlideGhostIfChanged(null);
      return;
    }
    const CELL = gridCellSize;
    const draggedCells = Math.max(
      1,
      Math.round(
        (direction === 'left' || direction === 'right' ? absX : absY) / CELL
      )
    );
    const move =
      moves.find(m => m.distance === draggedCells) ??
      moves.reduce((max, m) => (m.distance > max.distance ? m : max));
    // Project every chain member's landing slot — the whole chain moves
    // together, so the preview shows the full footprint, not just where
    // the leading card ends up.
    const chainSlots = slideChain(state.grid, source, direction);
    const step =
      direction === 'left' ? -1 :
      direction === 'right' ? 1 :
      direction === 'up' ? -5 : 5;
    const landings = new Set(chainSlots.map(s => s + step * move.distance));
    setSlideGhostIfChanged(landings);
  };

  const onDragEnd = (dx: number, dy: number) => {
    const source = dragSourceRef.current;
    dragSourceRef.current = null;
    setSlideGhostIfChanged(null);
    if (source === null) return;
    if (state.phase.kind !== 'awaiting-target-slide-source') return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // A small drag = tap; surface as source selection so the player can
    // tap-tap from there.
    if (absX < 18 && absY < 18) {
      dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: source });
      setSelectedSlot(source);
      return;
    }

    const direction: Direction =
      absX > absY
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up';

    const moves = slideDestinationsFrom(state.grid, source)
      .filter(m => m.direction === direction);
    if (moves.length === 0) {
      // Bias toward a usable outcome: just select the source so the player
      // can finish the move with a tap on a destination.
      dispatch({ type: 'SLIDE_SELECT_SOURCE', slot: source });
      setSelectedSlot(source);
      return;
    }

    const CELL = gridCellSize;
    const draggedCells = Math.max(
      1,
      Math.round((direction === 'left' || direction === 'right' ? absX : absY) / CELL)
    );
    const exact = moves.find(m => m.distance === draggedCells);
    const move =
      exact ??
      moves.reduce((max, m) => (m.distance > max.distance ? m : max));

    commitSlide(move.from, move.direction, move.distance);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .activeOffsetY([-6, 6])
        .onBegin(e => {
          'worklet';
          runOnJS(onDragStart)(e.x, e.y);
        })
        .onUpdate(e => {
          'worklet';
          runOnJS(onDragUpdate)(e.translationX, e.translationY);
        })
        .onEnd(e => {
          'worklet';
          runOnJS(onDragEnd)(e.translationX, e.translationY);
        })
        .onFinalize(() => {
          'worklet';
          // Ensure stale refs / ghost slots don't survive a cancel.
          runOnJS(clearDragRef)();
          runOnJS(setSlideGhostIfChanged)(null);
        }),
    // We intentionally rebuild the gesture per relevant state change so the
    // onDragStart / onDragUpdate / onDragEnd closures see fresh values.
    [state.phase, state.grid, anim]
  );

  return (
    <View style={styles.root}>
      <ScoreBar
        target={state.target}
        liveScore={liveScore}
        onInfoPress={() => setScoringOpen(true)}
        onHomePress={onHome}
        kicker={kicker}
        onUndoPress={handleUndoPress}
        undoState={undoState}
      />
      <BonusCardStrip
        cards={state.bonusCards}
        values={bonusValues}
        onCardPress={i => setBonusDetailIdx(i)}
      />

      <View style={styles.gridWrap}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.gridStack}>
            <GridView
              grid={state.grid}
              highlight={highlightedSlots}
              hiddenSlots={hiddenSlotsFor(anim)}
              selected={selectedSlot}
              nextSlotHint={state.phase.kind === 'awaiting-action' ? nextSlot : null}
              slideGhostSlots={slideGhost ?? undefined}
              onSlotPress={handleSlotPress}
              onLinePress={(kind, index) => setInspectLine({ kind, index })}
            />
            <AnimationLayer anim={anim} />
          </View>
        </GestureDetector>
      </View>

      <View style={styles.bottom}>
        {renderBottom(
          state,
          handlePlace,
          dispatch,
          haptic,
          playSound,
          suitOK,
          drawnKey,
          !!anim,
          settings.colorBlindAssist,
          deckPeekAllowed ? () => setDeckPreviewOpen(true) : undefined
        )}
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
      <BonusCardDetailModal
        visible={bonusDetailIdx !== null}
        card={bonusDetailIdx !== null ? state.bonusCards[bonusDetailIdx] ?? null : null}
        currentValue={bonusDetailIdx !== null ? bonusValues[bonusDetailIdx] : undefined}
        onClose={() => setBonusDetailIdx(null)}
      />
      <RemainingDeckModal
        visible={deckPreviewOpen}
        onClose={() => setDeckPreviewOpen(false)}
        deck={state.deck}
        grid={state.grid}
        discards={state.discards}
        perkSpent={state.perkSpent}
      />
      <UndoWarningModal
        visible={undoWarnOpen}
        onCancel={() => setUndoWarnOpen(false)}
        onConfirm={confirmUndoWarning}
      />
    </View>
  );
};

const UndoWarningModal = ({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <Pressable style={undoModalStyles.backdrop} onPress={onCancel}>
      <Pressable style={undoModalStyles.sheet} onPress={() => {}}>
        <Text style={undoModalStyles.title}>Heads up — undo is for practice</Text>
        <Text style={undoModalStyles.body}>
          Using undo marks this run as a practice run. It won't count as a win or
          loss and no score will be saved to your stats.
        </Text>
        <Text style={undoModalStyles.bodySecondary}>
          You'll only see this warning once.
        </Text>
        <View style={undoModalStyles.btnRow}>
          <NeonButton label="Cancel" variant="secondary" onPress={onCancel} />
          <NeonButton label="Undo anyway" variant="primary" onPress={onConfirm} />
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);

const undoModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.warn, 18, 0.3),
  },
  title: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textShadowColor: colors.warn,
    textShadowRadius: 4,
  },
  body: {
    color: colors.textHi,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  bodySecondary: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});

const renderBottom = (
  state: GameState,
  onPlace: () => void,
  dispatch: (a: Action) => void,
  haptic: (k: import('../haptics').HapticKind) => void,
  playSound: (k: 'tap' | 'place' | 'swap' | 'slide' | 'destroy' | 'bonus') => void,
  suitOK: boolean,
  drawnKey: string,
  animating: boolean,
  colorBlindAssist: boolean,
  onDeckPress?: () => void
) => {
  const p = state.phase;
  const disabled = animating;

  if (p.kind === 'awaiting-action') {
    if (!state.drawn) return null;
    const isJk = isJoker(state.drawn);
    const suit = !isJk ? (state.drawn as any).suit : null;
    return (
      <View style={styles.actionRow}>
        <DrawnArea
          drawnKey={drawnKey}
          deckCount={state.deck.length}
          perkCount={state.perkSpent.length}
          onDeckPress={onDeckPress}
        >
          <Text style={styles.drawnLabel}>Drawn</Text>
          {animating ? (
            <View style={{ width: 88, height: 88 }} />
          ) : (
            <CardTile card={state.drawn} size="lg" />
          )}
        </DrawnArea>
        <View style={styles.btnCol}>
          <NeonButton
            label="Place"
            variant="primary"
            disabled={disabled}
            onPress={onPlace}
            style={styles.stackedBtn}
          />
          {!isJk && suitOK && suit && (
            <NeonButton
              label={SUIT_PERK_LABEL[suit]}
              variant={SUIT_PERK_VARIANT[suit]}
              disabled={disabled}
              onPress={() => {
                haptic('light');
                playSound('tap');
                dispatch({ type: 'BEGIN_SUIT_ACTION' });
              }}
              style={styles.stackedBtn}
            />
          )}
          {!isJk && (
            <NeonButton
              label="Discard"
              variant="secondary"
              disabled={disabled}
              onPress={() => {
                haptic('light');
                playSound('tap');
                dispatch({ type: 'DISCARD_NONE' });
              }}
              style={styles.stackedBtn}
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
        <DrawnArea
          drawnKey={drawnKey + '-hop'}
          deckCount={state.deck.length}
          perkCount={state.perkSpent.length}
          onDeckPress={onDeckPress}
        >
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
        <DrawnArea
          drawnKey={drawnKey + '-slide'}
          deckCount={state.deck.length}
          perkCount={state.perkSpent.length}
          onDeckPress={onDeckPress}
        >
          <Text style={[styles.drawnLabel, { color: colors.suitS }]}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>
            Tap a card and tap the destination, OR drag from a card in the direction you want.
          </Text>
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
        <DrawnArea
          drawnKey={drawnKey + '-slide-dest'}
          deckCount={state.deck.length}
          perkCount={state.perkSpent.length}
          onDeckPress={onDeckPress}
        >
          <Text style={[styles.drawnLabel, { color: colors.suitS }]}>♠ Slide</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap a glowing destination.</Text>
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
        <DrawnArea
          drawnKey={drawnKey + '-destroy'}
          deckCount={state.deck.length}
          perkCount={state.perkSpent.length}
          onDeckPress={onDeckPress}
        >
          <Text style={[styles.drawnLabel, { color: colors.suitD }]}>♦ Destroy</Text>
          <CardTile card={state.drawn} size="lg" />
        </DrawnArea>
        <View style={styles.btnCol}>
          <Text style={styles.hint}>Tap any card on the grid to destroy it.</Text>
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
          {p.drawn.map((b, i) => {
            const s = bonusStyleFor(b);
            return (
              <Pressable
                key={i}
                style={[styles.bonusPick, { borderColor: s.borderColor }, glow(s.borderColor, 8, 0.4)]}
                onPress={() => {
                  haptic('bonus');
                  playSound('bonus');
                  dispatch(
                    atMax
                      ? { type: 'BONUS_SELECT_NEW', idx: i }
                      : { type: 'BONUS_KEEP', idx: i }
                  );
                }}
              >
                {colorBlindAssist && (
                  <Text style={[styles.bonusIcon, { color: s.iconColor, textShadowColor: s.iconColor }]}>
                    {s.icon}
                  </Text>
                )}
                <Text
                  style={[styles.bonusName, { color: s.titleColor, textShadowColor: s.titleColor }]}
                  numberOfLines={2}
                >
                  {b.title} <Text style={styles.bonusMult}>{b.mult}</Text>
                </Text>
                <Text style={styles.bonusDesc} numberOfLines={4}>{b.description}</Text>
              </Pressable>
            );
          })}
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
          {state.bonusCards.map((b, i) => {
            const s = bonusStyleFor(b);
            return (
              <Pressable
                key={i}
                style={[styles.bonusPick, { borderColor: s.borderColor }, glow(s.borderColor, 8, 0.4)]}
                onPress={() => {
                  haptic('bonus');
                  playSound('bonus');
                  dispatch({ type: 'BONUS_REPLACE', oldIdx: i });
                }}
              >
                {colorBlindAssist && (
                  <Text style={[styles.bonusIcon, { color: s.iconColor, textShadowColor: s.iconColor }]}>
                    {s.icon}
                  </Text>
                )}
                <Text
                  style={[styles.bonusName, { color: s.titleColor, textShadowColor: s.titleColor }]}
                  numberOfLines={2}
                >
                  {b.title} <Text style={styles.bonusMult}>{b.mult}</Text>
                </Text>
                <Text style={styles.bonusDesc} numberOfLines={4}>{b.description}</Text>
              </Pressable>
            );
          })}
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
  gridStack: { position: 'relative' },
  bottom: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  // Stacked column of action buttons on the right of the drawn card. The
  // three buttons (Place, suit perk, Discard) all share this style so their
  // heights match.
  btnCol: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  stackedBtn: {
    height: 48,
  },
  // Used by the bonus-card-resolving and bonus-card-replacing flows. Bonus
  // choice cards stack vertically beneath a title.
  actionCol: {
    gap: spacing.sm,
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
  },
  drawnBlock: { alignItems: 'center', gap: spacing.xs },
  deckUnderDrawn: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  deckUnderDrawnLink: {
    color: colors.accent,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  perkUnderDrawn: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: -2,
  },
  drawnLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 2,
  },
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
    // borderColor + glow set inline from the card's category tone.
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.sm,
    maxWidth: 170,
  },
  bonusIcon: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    textShadowRadius: 4,
    marginBottom: 2,
  },
  bonusName: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    // color + textShadowColor set inline from category tone.
    letterSpacing: 0.5,
    textShadowRadius: 4,
  },
  bonusMult: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
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
