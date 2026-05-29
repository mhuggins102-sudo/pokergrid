import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { anyPerkAvailable, slideDestinationsFrom, suitActionAvailable } from '../../game/actions';
import { Card, isJoker } from '../../game/cards';
import { BONUS_HAND_LIMIT, SPOTLIGHT_ID } from '../../game/bonusCards';
import {
  Direction,
  GRID_SIZE,
  LineKind,
  nextSpiralSlot,
  slideChain,
  SPIRAL_ORDER,
} from '../../game/grid';
import { bonusShapleyValues, INCOMPLETE_LINE_PENALTY, scoreGrid } from '../../game/scoring';
import { Action, canPreviewDeck, GameState } from '../../game/state';
import {
  ANIM_DURATION,
  AnimationLayer,
  AnimSpec,
  hiddenSlotsFor,
} from '../components/AnimationLayer';
import { categoryOf, styleFor as bonusStyleFor } from '../bonusCardCategory';
import { BonusCardDetailModal } from '../components/BonusCardDetailModal';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { RemainingDeckModal } from '../components/RemainingDeckModal';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { HintArrow, Rect as HintAnchorRect } from '../components/HintArrow';
import { LineDetailModal } from '../components/LineDetailModal';
import { NeonButton } from '../components/NeonButton';
import { ScoreBar, UndoState as UndoStateKind } from '../components/ScoreBar';
import { ScoringReferenceModal } from '../components/ScoringReferenceModal';
import { TierBreakdownModal } from '../components/TierBreakdownModal';
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
  // True for Targets-Up mode — tells the tier-breakdown popup to show
  // the per-tier reward column (A: advance, S: 1 supercharge, SS: 2).
  // Other modes don't have tier-based rewards so the column is hidden.
  showTierRewards?: boolean;
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

// First-time contextual hints. Each fires exactly once per device the first
// time the corresponding state appears mid-run, then is silenced via the
// matching `seen*Hint` settings flag (see settings.ts).
type HintId =
  | 'joker'
  | 'bonus-cap'
  | 'grid-effect'
  | 'hearts-swap'
  | 'spades-slide'
  | 'diamonds-destroy'
  | 'clubs-bonus'
  | 'bonus-held'
  | 'first-scoring-line'
  | 'low-deck';

const HINT_TITLE: Record<HintId, string> = {
  joker: 'Meet the joker',
  'bonus-cap': 'Bonus hand is full',
  'grid-effect': 'Grid achievement is live',
  'hearts-swap': '♥ Swap',
  'spades-slide': '♠ Slide',
  'diamonds-destroy': '♦ Destroy',
  'clubs-bonus': '♣ Bonus',
  'bonus-held': 'Your first bonus card',
  'first-scoring-line': 'First scoring line',
  'low-deck': 'Deck running low',
};

const HINT_BODY: Record<HintId, string> = {
  joker:
    'A joker is wild — its row and its column each score as the best 5-card hand they can. Jokers auto-place when drawn and can\'t be discarded normally; only a ♦ Destroy removes one. Easy difficulty ships two jokers in the deck, Medium / Hard one, Extreme none.',
  'bonus-cap':
    'You\'re holding 3 bonus cards — the maximum. On this difficulty, drawing another ♣ Bonus forces you to swap one out (no decline allowed).',
  'grid-effect':
    'A grid achievement (purple border) is now satisfying its condition — it multiplies your TOTAL score at game end, on top of any per-line bonuses.',
  'hearts-swap':
    '♥ swaps two cards that share a row OR a column. Tap one card and then its partner — or drag one straight onto the other (a green outline shows where it\'ll land). The drawn ♥ is then spent.',
  'spades-slide':
    '♠ slides a chain of cards in one direction. Tap a card to see valid landings, then tap one — or drag the card the way you want it to go. Cards keep their relative order.',
  'diamonds-destroy':
    '♦ removes any card from the grid (joker included). The slot becomes empty; if you can\'t refill it before the run ends it costs -25 at scoring time, so use ♦ deliberately.',
  'clubs-bonus':
    '♣ draws 2 bonus cards from a separate deck — pick one to keep. Multipliers stack MULTIPLICATIVELY: two ×2 cards on the same line is ×4, not ×3.',
  'bonus-held':
    'Bonus cards modify your score. Border tone tells you when they pay out: yellow = pays out per line during the run, purple = multiplies the final total at game end. Tap any held card for full details.',
  'first-scoring-line':
    'Nice — your first scoring line. Each completed row and column scores as a 5-card poker hand. Pair and above pay out; High Card scores 0. Bonus cards modify these per-line totals.',
  'low-deck':
    'The deck is almost empty. The run ends when the deck runs out or the grid fills up. Lines you haven\'t completed by then cost -25 each, so plan your last few placements carefully.',
};

// Lower bound on cards-placed before the grid-effect hint can fire.
// Easy / Medium ship a free starter bonus card and several of those
// (Frugal, No Flushes, etc.) are already-satisfied on turn 1, which
// would make the hint pop up before the player has done anything
// "wrong" and tie the lesson to a confusing example. Waiting a few
// turns gives the player time to interact and ensures the hint
// arrives at a moment when the gameplay actually caused the trigger.
const GRID_EFFECT_MIN_TURNS = 5;

// Delay before any first-game hint actually shows after its trigger
// condition first becomes true. Lets the underlying animation +
// sound (joker landing, scoring flash, bonus card draw) finish so the
// player has registered what just happened before the popup explains
// it.
const HINT_REVEAL_DELAY_MS = 700;

const HINT_SETTING_KEY: Record<HintId, keyof import('../settings').Settings> = {
  joker: 'seenJokerHint',
  'bonus-cap': 'seenBonusCapHint',
  'grid-effect': 'seenGridEffectHint',
  'hearts-swap': 'seenHeartsSwapHint',
  'spades-slide': 'seenSpadesSlideHint',
  'diamonds-destroy': 'seenDiamondsDestroyHint',
  'clubs-bonus': 'seenClubsBonusHint',
  'bonus-held': 'seenBonusHeldHint',
  'first-scoring-line': 'seenFirstScoringLineHint',
  'low-deck': 'seenLowDeckHint',
};

// Drawn-card area: card fades + scales in on every change so each new draw
// reads as a beat. The duration is intentionally slow so placing feels weighty.
const DrawnArea = ({
  drawnKey,
  children,
  deckCount,
  perkCount,
  onDeckPress,
  deckCountRef,
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
  // First-game hint plumbing — when set, the deck-count label gets
  // this ref so the low-deck hint can anchor its arrow on the count.
  deckCountRef?: React.Ref<Text>;
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
          ref={deckCountRef}
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
  showTierRewards = false,
}: Props) => {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [tierBreakdownOpen, setTierBreakdownOpen] = useState(false);
  const [bonusDetailIdx, setBonusDetailIdx] = useState<number | null>(null);
  const [deckPreviewOpen, setDeckPreviewOpen] = useState(false);
  const deckPeekAllowed = canPreviewDeck(state.difficulty);
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const [anim, setAnim] = useState<AnimSpec | null>(null);
  const [undoWarnOpen, setUndoWarnOpen] = useState(false);
  const [dragGhost, setDragGhost] = useState<Set<number> | null>(null);
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  // Anchor rect (in screen coords) for the currently active hint. Null
  // while measurement is in flight or when the hint has no anchor —
  // HintModal falls back to a centered modal with no arrow in that case.
  const [hintAnchor, setHintAnchor] = useState<HintAnchorRect | null>(null);
  const dragGhostKeyRef = useRef<string>('');
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs on the regions a hint can point at. We measureInWindow these
  // on demand when a hint activates so the popup can position itself
  // relative to the relevant element and the spotlight can punch a
  // hole at the right place.
  //
  // Region wrappers (existing): used for whole-area anchors and for
  // resolving more specific child positions below.
  const scoreBarRef = useRef<View>(null);
  const bonusStripRef = useRef<View>(null);
  const gridWrapRef = useRef<View>(null);
  const bottomRef = useRef<View>(null);
  // Per-element anchors:
  // - bonusCardRefs[i] points at the i-th chip in the bonus strip, so
  //   the "first bonus card" + "specific grid-achievement card" hints
  //   can highlight just that chip instead of the whole row.
  // - gridCellRefs[idx] points at a single grid cell, used for the
  //   joker hint (anchor on the joker's tile) and to compute the
  //   bounds of a full row/column for the first-scoring-line hint.
  // - perkButtonRef points at the active suit-perk action button so
  //   the suit hint fires when the BUTTON first appears (not after
  //   the player taps it).
  // - deckCountRef points at the "deck N" text under the drawn card.
  const bonusCardRefs = useRef<(View | null)[]>([]);
  const gridCellRefs = useRef<(View | null)[]>([]);
  const perkButtonRef = useRef<View>(null);
  const deckCountRef = useRef<Text>(null);

  // Pending-hint timer — we delay the popup by HINT_REVEAL_DELAY_MS so
  // the triggering animation/sound has time to land. Stored in a ref
  // so the dismiss handler can also cancel it if needed.
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const liveReport = useMemo(
    () =>
      scoreGrid(state.grid, state.bonusCards, {
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
  const liveScore = liveReport.total;

  // Endgame penalty preview for the ScoreBar. The live score ignores the
  // incomplete-line penalty (it's optimistic), so a player can be blindsided
  // by the -25/line hit at game-over. Surface it only as the run nears its
  // end — when the deck is low OR few grid slots remain — so early-game play
  // isn't cluttered with a warning about lines they still have plenty of time
  // to fill. Patience negates the penalty entirely, so the cue stays hidden
  // while it's held.
  const hasPatience = state.bonusCards.some(c => c.negatesIncompletePenalty);
  const emptySlots = state.grid.filter(c => c === null).length;
  const nearEnd = state.deck.length <= 5 || emptySlots <= 5;
  const openLines =
    hasPatience || !nearEnd
      ? 0
      : liveReport.lines.filter(l => l.incomplete).length;
  const openPenalty = openLines * INCOMPLETE_LINE_PENALTY;

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

  // Determine which first-time hint (if any) the current state should
  // fire. Returns null when no hint is wanted or the current hint has
  // already been seen. Phase-anchored hints (suit perks) fire when
  // their option BUTTON first appears — i.e. the player has a card
  // drawn whose suit perk is available — NOT after they've already
  // selected it. State-based hints (joker, scoring, bonus, deck) fire
  // when their state condition first becomes true.
  const selectPendingHint = (): HintId | null => {
    if (state.phase.kind !== 'awaiting-action') return null;

    // Suit perks — fire when the button itself is visible. suitOK
    // already encodes "phase=awaiting-action + the perk has at least
    // one valid target" so the button is on screen. Skipped under
    // Short Circuit: the perk is randomized so the drawn card's suit
    // doesn't predict what fires, and the player has presumably
    // already learned all four perks in earlier modes.
    const drawn = state.drawn;
    if (drawn && !isJoker(drawn) && !state.randomPerks) {
      const perkAvailable = suitActionAvailable(
        drawn,
        state.grid,
        state.bonusDeck.length,
        state.bonusCards.length,
        state.noSwap
      );
      if (perkAvailable) {
        const s = drawn.suit;
        if (s === 'H' && !settings.seenHeartsSwapHint) return 'hearts-swap';
        if (s === 'S' && !settings.seenSpadesSlideHint) return 'spades-slide';
        if (s === 'D' && !settings.seenDiamondsDestroyHint) return 'diamonds-destroy';
        if (s === 'C' && !settings.seenClubsBonusHint) return 'clubs-bonus';
      }
    }

    if (!settings.seenJokerHint && state.grid.some(c => c !== null && isJoker(c))) {
      return 'joker';
    }
    if (!settings.seenBonusHeldHint && state.bonusCards.length >= 1) {
      return 'bonus-held';
    }
    if (!settings.seenBonusCapHint && state.bonusCards.length >= BONUS_HAND_LIMIT) {
      return 'bonus-cap';
    }
    if (!settings.seenFirstScoringLineHint &&
        liveReport.lines.some(l => l.hand !== null)) {
      return 'first-scoring-line';
    }
    if (!settings.seenGridEffectHint &&
        (liveReport.gridMultiplier !== 1 || liveReport.gridFlat !== 0)) {
      // Skip grid-effect on the early turns when a free starter bonus
      // card (Frugal / No Flushes / etc.) trivially satisfies its own
      // condition on turn 1 — the lesson lands better when the
      // multiplier shows up as a CONSEQUENCE of play, not as part of
      // the starting state.
      const placed = state.grid.filter(c => c !== null).length;
      if (placed >= GRID_EFFECT_MIN_TURNS) return 'grid-effect';
    }
    if (!settings.seenLowDeckHint &&
        state.deck.length > 0 && state.deck.length <= 5) {
      return 'low-deck';
    }
    return null;
  };

  // Find the index of the held bonus card most plausibly responsible
  // for the current grid-wide multiplier — used as the anchor for the
  // 'grid-effect' hint. Picks a grid-category card whose Shapley value
  // is non-zero (i.e. it's actually contributing); falls back to the
  // first grid-category card if none are scoring yet.
  const gridContributingCardIdx = (): number => {
    let fallback = -1;
    for (let i = 0; i < state.bonusCards.length; i++) {
      const card = state.bonusCards[i];
      // Both end-game multiplier categories (grid achievements + deck
      // management) trigger the same "grid-effect" hint, so widen the
      // filter to include either.
      const cat = categoryOf(card);
      if (cat !== 'grid' && cat !== 'deck-management') continue;
      if (fallback < 0) fallback = i;
      if ((bonusValues[i] ?? 0) !== 0) return i;
    }
    return fallback;
  };

  // Resolve the anchor rect (in screen coords) for a given hint. Some
  // anchors are computed (joker tile, scoring line) and some come
  // directly from a ref's measureInWindow. Returns null if the
  // target element isn't currently on screen.
  const resolveHintAnchor = (hint: HintId): Promise<HintAnchorRect | null> => {
    const measure = (v: View | Text | null): Promise<HintAnchorRect | null> =>
      new Promise(resolve => {
        if (!v) return resolve(null);
        v.measureInWindow((x, y, w, h) => {
          if (w === 0 || h === 0) resolve(null);
          else resolve({ x, y, w, h });
        });
      });

    switch (hint) {
      case 'bonus-held':
        return measure(bonusCardRefs.current[0]);
      case 'bonus-cap':
        // Span all three chips together — the lesson IS that the hand
        // is full, so highlighting the whole row reads better than
        // singling out one chip.
        return measure(bonusStripRef.current);
      case 'grid-effect': {
        const idx = gridContributingCardIdx();
        if (idx >= 0) return measure(bonusCardRefs.current[idx]);
        return measure(bonusStripRef.current);
      }
      case 'joker': {
        const slot = state.grid.findIndex(c => c !== null && isJoker(c));
        if (slot < 0) return Promise.resolve(null);
        return measure(gridCellRefs.current[slot]);
      }
      case 'first-scoring-line': {
        const line = liveReport.lines.find(l => l.hand !== null);
        if (!line) return Promise.resolve(null);
        // Bounds = first cell ∪ last cell of the line. measureInWindow
        // both endpoints and union them so the spotlight covers the
        // whole row/column, not just one tile.
        const firstSlot = line.kind === 'row'
          ? line.index * GRID_SIZE
          : line.index;
        const lastSlot = line.kind === 'row'
          ? line.index * GRID_SIZE + (GRID_SIZE - 1)
          : line.index + (GRID_SIZE - 1) * GRID_SIZE;
        return Promise.all([
          measure(gridCellRefs.current[firstSlot]),
          measure(gridCellRefs.current[lastSlot]),
        ]).then(([a, b]) => {
          if (!a || !b) return a ?? b;
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const x2 = Math.max(a.x + a.w, b.x + b.w);
          const y2 = Math.max(a.y + a.h, b.y + b.h);
          return { x, y, w: x2 - x, h: y2 - y };
        });
      }
      case 'hearts-swap':
      case 'spades-slide':
      case 'diamonds-destroy':
      case 'clubs-bonus':
        return measure(perkButtonRef.current);
      case 'low-deck':
        return measure(deckCountRef.current);
    }
  };

  // First-time contextual hints — fire after HINT_REVEAL_DELAY_MS so
  // the underlying placement / scoring / draw animation has time to
  // settle before the popup explains it. The dep array re-runs the
  // effect on any state change relevant to a hint trigger; the
  // setTimeout cleanup cancels the pending fire if the player acts
  // before it elapses, and on fire we measure the anchor.
  useEffect(() => {
    if (activeHint !== null) return;
    if (anim) return;
    const desired = selectPendingHint();
    if (!desired) return;
    let canceled = false;
    const id = setTimeout(async () => {
      // resolveHintAnchor is async (it awaits measureInWindow). If the
      // effect cleaned up between schedule and the async resolve, we
      // must NOT set state — otherwise a hint can fire for a state
      // the player has already left.
      const rect = await resolveHintAnchor(desired);
      if (canceled) return;
      setHintAnchor(rect);
      setActiveHint(desired);
    }, HINT_REVEAL_DELAY_MS);
    hintTimerRef.current = id;
    return () => {
      canceled = true;
      clearTimeout(id);
      if (hintTimerRef.current === id) hintTimerRef.current = null;
    };
  }, [
    activeHint,
    anim,
    state.phase.kind,
    state.grid,
    state.drawn,
    state.bonusCards.length,
    state.bonusDeck.length,
    state.deck.length,
    state.noSwap,
    liveReport.gridMultiplier,
    liveReport.gridFlat,
    liveReport.lines,
    settings.seenJokerHint,
    settings.seenBonusCapHint,
    settings.seenGridEffectHint,
    settings.seenHeartsSwapHint,
    settings.seenSpadesSlideHint,
    settings.seenDiamondsDestroyHint,
    settings.seenClubsBonusHint,
    settings.seenBonusHeldHint,
    settings.seenFirstScoringLineHint,
    settings.seenLowDeckHint,
  ]);

  const dismissHint = () => {
    if (activeHint) updateSettings({ [HINT_SETTING_KEY[activeHint]]: true });
    setActiveHint(null);
    setHintAnchor(null);
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  };

  const nextSlot = useMemo(() => nextSpiralSlot(state.grid), [state.grid]);

  const drawn = state.drawn;
  // "Is the perk button shown?" — in Short Circuit the drawn suit
  // doesn't gate the perk (the reducer will pick a random suit
  // anyway), so we just need ANY perk to be currently runnable.
  // Outside Short Circuit the behavior is unchanged.
  const suitOK =
    state.phase.kind === 'awaiting-action' &&
    !!drawn &&
    !isJoker(drawn) &&
    (state.randomPerks
      ? anyPerkAvailable(
          state.grid,
          state.bonusDeck.length,
          state.bonusCards.length,
          state.noSwap
        )
      : suitActionAvailable(
          drawn,
          state.grid,
          state.bonusDeck.length,
          state.bonusCards.length,
          state.noSwap
        ));

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
  // The drag pointer's position relative to the grid view. onDragStart
  // captures the absolute origin (e.x, e.y at gesture begin); onUpdate
  // adds the translation so we know which slot the finger is currently
  // over for swap-target detection.
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const clearDragRef = () => {
    dragSourceRef.current = null;
    dragOriginRef.current = null;
  };

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
    if (anim) {
      dragSourceRef.current = null;
      return;
    }
    const slot = slotFromXY(x, y);
    if (slot === null) {
      dragSourceRef.current = null;
      return;
    }
    // Slide: only valid sources (chains that can move) are draggable.
    if (p.kind === 'awaiting-target-slide-source') {
      if (!p.sources.includes(slot)) {
        dragSourceRef.current = null;
        return;
      }
      dragSourceRef.current = slot;
      dragOriginRef.current = { x, y };
      haptic('light');
      playSound('tap');
      return;
    }
    // Swap: any slot that appears in at least one pair is a valid source.
    if (p.kind === 'awaiting-target-hop') {
      const inPairs = p.pairs.some(([a, b]) => a === slot || b === slot);
      if (!inPairs) {
        dragSourceRef.current = null;
        return;
      }
      dragSourceRef.current = slot;
      dragOriginRef.current = { x, y };
      haptic('light');
      playSound('tap');
      return;
    }
    dragSourceRef.current = null;
  };

  // Mid-drag preview: compute where the dragged card will land (slide
  // chain footprint, or swap partner) and surface the slots to GridView
  // as ghost outlines. State updates are gated on the slot-set actually
  // changing so we don't re-render the grid every gesture frame.
  const setDragGhostIfChanged = (next: Set<number> | null) => {
    const key = next ? Array.from(next).sort((a, b) => a - b).join(',') : '';
    if (key === dragGhostKeyRef.current) return;
    dragGhostKeyRef.current = key;
    setDragGhost(next);
  };

  const onDragUpdate = (dx: number, dy: number) => {
    const source = dragSourceRef.current;
    if (source === null) {
      setDragGhostIfChanged(null);
      return;
    }
    const phase = state.phase;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Below the activeOffset threshold no direction / hover has settled yet.
    if (absX < 18 && absY < 18) {
      setDragGhostIfChanged(null);
      return;
    }

    if (phase.kind === 'awaiting-target-slide-source') {
      const direction: Direction =
        absX > absY
          ? dx > 0 ? 'right' : 'left'
          : dy > 0 ? 'down' : 'up';
      const moves = slideDestinationsFrom(state.grid, source)
        .filter(m => m.direction === direction);
      if (moves.length === 0) {
        setDragGhostIfChanged(null);
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
      setDragGhostIfChanged(landings);
      return;
    }

    if (phase.kind === 'awaiting-target-hop') {
      // Hover detection — which slot is the finger over right now?
      const origin = dragOriginRef.current;
      if (!origin) {
        setDragGhostIfChanged(null);
        return;
      }
      const hoverSlot = slotFromXY(origin.x + dx, origin.y + dy);
      if (hoverSlot === null || hoverSlot === source) {
        setDragGhostIfChanged(null);
        return;
      }
      // The slot is a valid swap partner iff [source, hover] (in either
      // order) is in the pairs list — i.e., they share a row OR column.
      const isPartner = phase.pairs.some(
        ([a, b]) =>
          (a === source && b === hoverSlot) || (a === hoverSlot && b === source)
      );
      setDragGhostIfChanged(isPartner ? new Set([hoverSlot]) : null);
      return;
    }

    setDragGhostIfChanged(null);
  };

  const onDragEnd = (dx: number, dy: number) => {
    const source = dragSourceRef.current;
    const origin = dragOriginRef.current;
    dragSourceRef.current = null;
    dragOriginRef.current = null;
    setDragGhostIfChanged(null);
    if (source === null) return;
    const phase = state.phase;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (phase.kind === 'awaiting-target-slide-source') {
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
      return;
    }

    if (phase.kind === 'awaiting-target-hop') {
      // Small drag = tap → fall through to the tap-tap-tap path by just
      // selecting the source.
      if (absX < 18 && absY < 18 || !origin) {
        setSelectedSlot(source);
        return;
      }
      const hoverSlot = slotFromXY(origin.x + dx, origin.y + dy);
      if (hoverSlot === null || hoverSlot === source) {
        setSelectedSlot(source);
        return;
      }
      const pair = phase.pairs.find(
        ([a, b]) =>
          (a === source && b === hoverSlot) || (a === hoverSlot && b === source)
      );
      if (!pair) {
        // Released over a non-partner slot — leave the source selected so
        // the player can still tap a valid target instead of losing the
        // intent entirely.
        setSelectedSlot(source);
        return;
      }
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
          runOnJS(setDragGhostIfChanged)(null);
        }),
    // We intentionally rebuild the gesture per relevant state change so the
    // onDragStart / onDragUpdate / onDragEnd closures see fresh values.
    [state.phase, state.grid, anim]
  );

  return (
    <View style={styles.root}>
      <View ref={scoreBarRef} collapsable={false}>
        <ScoreBar
          target={state.target}
          liveScore={liveScore}
          onInfoPress={() => setScoringOpen(true)}
          onHomePress={onHome}
          onScorePress={() => setTierBreakdownOpen(true)}
          kicker={kicker}
          onUndoPress={handleUndoPress}
          undoState={undoState}
          openLines={openLines}
          openPenalty={openPenalty}
        />
      </View>
      {!state.noBonusCards && (
        <View ref={bonusStripRef} collapsable={false}>
          <BonusCardStrip
            cards={state.bonusCards}
            values={bonusValues}
            onCardPress={i => setBonusDetailIdx(i)}
            cardRefs={bonusCardRefs}
          />
        </View>
      )}

      <View ref={gridWrapRef} style={styles.gridWrap} collapsable={false}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.gridStack}>
            <GridView
              grid={state.grid}
              highlight={highlightedSlots}
              hiddenSlots={hiddenSlotsFor(anim)}
              selected={selectedSlot}
              nextSlotHint={state.phase.kind === 'awaiting-action' ? nextSlot : null}
              ghostSlots={dragGhost ?? undefined}
              onSlotPress={handleSlotPress}
              onLinePress={(kind, index) => setInspectLine({ kind, index })}
              cellRefs={gridCellRefs}
            />
            <AnimationLayer anim={anim} />
          </View>
        </GestureDetector>
      </View>

      <View ref={bottomRef} style={styles.bottom} collapsable={false}>
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
          deckPeekAllowed ? () => setDeckPreviewOpen(true) : undefined,
          perkButtonRef,
          deckCountRef
        )}
      </View>

      <TierBreakdownModal
        visible={tierBreakdownOpen}
        target={state.target}
        showRewards={showTierRewards}
        onClose={() => setTierBreakdownOpen(false)}
      />
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
      <HintModal
        hint={activeHint}
        anchor={hintAnchor}
        bonusDeclineAllowed={state.bonusDeclineAllowed}
        onDismiss={dismissHint}
      />
    </View>
  );
};

// Look up a hint's body text, with one difficulty-dependent override:
// the bonus-cap message changes depending on whether the current
// difficulty lets the player decline at cap (Easy) or forces the swap
// (Medium / Hard / Extreme).
const hintBodyFor = (hint: HintId, bonusDeclineAllowed: boolean): string => {
  if (hint === 'bonus-cap') {
    return bonusDeclineAllowed
      ? 'You\'re holding 3 bonus cards — the maximum. On this difficulty, you can still decline a ♣ Bonus draw at the cap if neither offered card is worth swapping for.'
      : 'You\'re holding 3 bonus cards — the maximum. On this difficulty, drawing another ♣ Bonus forces you to swap one out (no decline allowed).';
  }
  return HINT_BODY[hint];
};

// Spotlight inflation — extra px around the measured anchor rect that
// stays undimmed. The anchor refs are on wrapper Views (grid cell
// Pressable, bonus card slot, perk button wrap) which already match
// the visible element, so we don't add inflation here — keeping the
// spotlight tight prevents the dim hole from spilling into the edge
// of an adjacent card / button.
const SPOTLIGHT_PAD = 0;
// Distance between the popup edge and the spotlighted anchor — leaves
// room for the arrow to actually draw and keeps the chrome from
// kissing the highlighted element.
const POPUP_ANCHOR_GAP = 22;
// Outer margin keeping the popup away from screen edges.
const POPUP_SCREEN_MARGIN = 16;
// Minimum time the hint stays interactive before taps can dismiss it.
// Guards against accidental dismisses where the player taps just as
// the popup appears and hasn't had time to read it.
const HINT_DISMISS_LOCKOUT_MS = 2000;

const HintModal = ({
  hint,
  anchor,
  bonusDeclineAllowed,
  onDismiss,
}: {
  hint: HintId | null;
  anchor: HintAnchorRect | null;
  bonusDeclineAllowed: boolean;
  onDismiss: () => void;
}) => {
  // The popup needs its own rect in screen coords so the arrow can
  // start from its edge AND so we can position it next to the
  // anchor rather than always centering. Captured via onLayout — on
  // first render we draw at the screen center hidden, then re-render
  // at the computed position once we know the popup's size.
  const [popupSize, setPopupSize] = useState<{ w: number; h: number } | null>(null);
  // Brief lockout right after the popup appears — prevents the player
  // from accidentally tap-dismissing before they've registered that
  // the popup even opened.
  const [dismissArmed, setDismissArmed] = useState(false);

  // Reset measurement + arm the dismiss lockout when a new hint opens
  // (or this one closes).
  useEffect(() => {
    if (hint === null) {
      setPopupSize(null);
      setDismissArmed(false);
      return;
    }
    setDismissArmed(false);
    const id = setTimeout(() => setDismissArmed(true), HINT_DISMISS_LOCKOUT_MS);
    return () => clearTimeout(id);
  }, [hint]);

  const guardedDismiss = () => {
    if (!dismissArmed) return;
    onDismiss();
  };

  const win = Dimensions.get('window');
  // The popup never exceeds 340 wide or the viewport (less margins),
  // whichever is smaller. Set explicitly so onLayout reports a stable
  // size on the first pass.
  const popupWidth = Math.min(340, win.width - POPUP_SCREEN_MARGIN * 2);

  // Compute popup position. If we have both an anchor and the popup's
  // measured size, place it on whichever side of the anchor has more
  // room (with a small gap for the arrow). Otherwise center. While
  // popupSize is still null we render off-screen so the user doesn't
  // see a flash at the center.
  let popupLeft = -9999;
  let popupTop = -9999;
  let popupRect: HintAnchorRect | null = null;
  if (popupSize) {
    if (anchor) {
      const aboveSpace = anchor.y - POPUP_SCREEN_MARGIN;
      const belowSpace = win.height - (anchor.y + anchor.h) - POPUP_SCREEN_MARGIN;
      const needsH = popupSize.h + POPUP_ANCHOR_GAP;
      const placeAbove =
        aboveSpace >= needsH ? true :
        belowSpace >= needsH ? false :
        aboveSpace > belowSpace; // neither fits cleanly — pick the bigger half
      popupTop = placeAbove
        ? Math.max(POPUP_SCREEN_MARGIN, anchor.y - POPUP_ANCHOR_GAP - popupSize.h)
        : Math.min(
            win.height - popupSize.h - POPUP_SCREEN_MARGIN,
            anchor.y + anchor.h + POPUP_ANCHOR_GAP
          );
      // Horizontally align with anchor center, then clamp to viewport.
      popupLeft = Math.max(
        POPUP_SCREEN_MARGIN,
        Math.min(
          win.width - popupSize.w - POPUP_SCREEN_MARGIN,
          anchor.x + anchor.w / 2 - popupSize.w / 2
        )
      );
    } else {
      popupLeft = (win.width - popupSize.w) / 2;
      popupTop = (win.height - popupSize.h) / 2;
    }
    popupRect = { x: popupLeft, y: popupTop, w: popupSize.w, h: popupSize.h };
  }

  // Inflated anchor for the spotlight cutout — gives the highlighted
  // element a breathing halo of undimmed pixels.
  const spotlight = anchor
    ? {
        x: Math.max(0, anchor.x - SPOTLIGHT_PAD),
        y: Math.max(0, anchor.y - SPOTLIGHT_PAD),
        w: Math.min(win.width, anchor.w + SPOTLIGHT_PAD * 2),
        h: Math.min(win.height, anchor.h + SPOTLIGHT_PAD * 2),
      }
    : null;

  return (
    <Modal
      visible={hint !== null}
      transparent
      animationType="fade"
      onRequestClose={guardedDismiss}
    >
      {/* Full-screen tap catcher — taps anywhere off the popup dismiss
          the hint, but only after the dismiss lockout elapses so an
          accidental tap as the popup appears doesn't immediately
          close it. The dim layers stack on top with pointerEvents none
          so touches still reach this. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={guardedDismiss}>
        {spotlight ? (
          // Four dim rectangles forming a "hole" around the anchor so
          // the spotlighted element stays at full brightness while
          // everything else fades back. Each rect uses pointerEvents
          // none so the underlying tap-catcher still dismisses.
          <>
            <View
              pointerEvents="none"
              style={[
                hintModalStyles.dim,
                { top: 0, left: 0, right: 0, height: spotlight.y },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                hintModalStyles.dim,
                { top: spotlight.y + spotlight.h, left: 0, right: 0, bottom: 0 },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                hintModalStyles.dim,
                { top: spotlight.y, left: 0, width: spotlight.x, height: spotlight.h },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                hintModalStyles.dim,
                {
                  top: spotlight.y,
                  left: spotlight.x + spotlight.w,
                  right: 0,
                  height: spotlight.h,
                },
              ]}
            />
          </>
        ) : (
          // No anchor → uniform dim across the whole screen.
          <View pointerEvents="none" style={[hintModalStyles.dim, StyleSheet.absoluteFillObject]} />
        )}

        {/* Popup — absolutely positioned. Wrapped in its own Pressable
            so taps on the chrome don't bubble up to the dismiss
            handler on the backdrop. */}
        <Pressable
          collapsable={false}
          onPress={() => {}}
          onLayout={e => {
            const { width: w, height: h } = e.nativeEvent.layout;
            // Only set when dimensions stabilise — avoids a re-render
            // loop if the popup is wrapped by a slowly-laying-out
            // ancestor.
            if (!popupSize || popupSize.w !== w || popupSize.h !== h) {
              setPopupSize({ w, h });
            }
          }}
          style={[
            hintModalStyles.sheet,
            {
              left: popupLeft,
              top: popupTop,
              width: popupWidth,
              opacity: popupSize ? 1 : 0,
            },
          ]}
        >
          <Text style={hintModalStyles.kicker}>· FIRST TIME ·</Text>
          <Text style={hintModalStyles.title}>{hint ? HINT_TITLE[hint] : ''}</Text>
          <Text style={hintModalStyles.body}>
            {hint ? hintBodyFor(hint, bonusDeclineAllowed) : ''}
          </Text>
          <View style={hintModalStyles.btnRow}>
            <NeonButton
              label="Got it"
              variant="primary"
              size="sm"
              disabled={!dismissArmed}
              onPress={guardedDismiss}
            />
          </View>
        </Pressable>

        {popupRect && anchor && (
          <HintArrow popup={popupRect} anchor={anchor} color={colors.accent} />
        )}
      </Pressable>
    </Modal>
  );
};

const hintModalStyles = StyleSheet.create({
  // One of four spotlight strips that together form a "hole" around
  // the anchor. backgroundColor stays consistent regardless of which
  // strip; only position differs per strip.
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
  },
  sheet: {
    position: 'absolute',
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 14, 0.35),
  },
  kicker: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: colors.accent,
    textShadowRadius: 6,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});

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
  onDeckPress?: () => void,
  // First-game hint plumbing — refs the awaiting-action layout wires
  // up so the suit-perk hint can anchor on the perk button and the
  // low-deck hint can anchor on the "deck N" text.
  perkButtonRef?: React.Ref<View>,
  deckCountRef?: React.Ref<Text>
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
          deckCountRef={deckCountRef}
        >
          <Text style={styles.drawnLabel}>Drawn</Text>
          {animating ? (
            <View style={{ width: 88, height: 88 }} />
          ) : (
            <CardTile card={state.drawn} size="lg" />
          )}
        </DrawnArea>
        <View style={styles.btnArea}>
          <View style={styles.btnRow}>
            <NeonButton
              label="Place"
              variant="primary"
              disabled={disabled}
              onPress={onPlace}
              style={styles.squareBtn}
              noGlow
            />
            {!isJk && suitOK && suit && (
              <View ref={perkButtonRef} collapsable={false} style={styles.squareBtnWrap}>
                <NeonButton
                  // Short Circuit hides which perk you'll get behind a
                  // generic label + warn tint — the drawn card's suit
                  // doesn't predict the outcome, so showing the suit's
                  // perk name would be a lie.
                  label={state.randomPerks ? 'Perk ?' : SUIT_PERK_LABEL[suit]}
                  variant={state.randomPerks ? 'warn' : SUIT_PERK_VARIANT[suit]}
                  disabled={disabled}
                  onPress={() => {
                    haptic('light');
                    playSound('tap');
                    dispatch({ type: 'BEGIN_SUIT_ACTION' });
                  }}
                  style={styles.squareBtn}
                  noGlow
                />
              </View>
            )}
            {!isJk && !state.noDiscards && (
              <NeonButton
                label="Discard"
                variant="secondary"
                disabled={disabled}
                onPress={() => {
                  haptic('light');
                  playSound('tap');
                  dispatch({ type: 'DISCARD_NONE' });
                }}
                style={styles.squareBtn}
                noGlow
              />
            )}
          </View>
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
          {!state.randomPerks && (
            <NeonButton
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
            />
          )}
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
          {!state.randomPerks && (
            <NeonButton
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
            />
          )}
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
          {!state.randomPerks && (
            <NeonButton
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => dispatch({ type: 'CANCEL_ACTION' })}
            />
          )}
        </View>
      </View>
    );
  }

  if (p.kind === 'bonus-card-resolving') {
    const atMax = state.bonusCards.length >= BONUS_HAND_LIMIT;
    // Spotlight is exclusive — it can't share the hand with any other bonus
    // card (see enforceSpotlight in state.ts). The eviction happens silently
    // on keep/swap, so warn before the player commits and loses cards by
    // surprise. Two directions:
    //  - a drawn card IS Spotlight while you hold other cards → keeping it
    //    drops the rest of your hand.
    //  - you already hold Spotlight and a drawn card ISN'T → keeping that one
    //    drops your Spotlight.
    const holdsSpotlight = state.bonusCards.some(c => c.id === SPOTLIGHT_ID);
    const holdsOthers = state.bonusCards.some(c => c.id !== SPOTLIGHT_ID);
    const drawnHasSpotlight = p.drawn.some(c => c.id === SPOTLIGHT_ID);
    const drawnHasOther = p.drawn.some(c => c.id !== SPOTLIGHT_ID);
    const spotlightWarning =
      drawnHasSpotlight && holdsOthers
        ? 'Spotlight is exclusive — keeping it discards every other bonus card you hold.'
        : holdsSpotlight && drawnHasOther
        ? 'You hold Spotlight (exclusive) — keeping any card here discards your Spotlight.'
        : null;
    return (
      <View style={styles.actionCol}>
        <Text style={[styles.drawnLabel, { color: colors.suitC, textAlign: 'center' }]}>
          ♣ Bonus
        </Text>
        <Text style={styles.hint}>
          {atMax
            ? 'You\'re at 3 bonus cards. Pick one to swap in — the card you replace is gone for good.'
            : 'Pick one of the drawn bonus cards to keep, or decline.'}
        </Text>
        {spotlightWarning && (
          <Text style={styles.spotlightWarning}>{spotlightWarning}</Text>
        )}
        <View style={styles.bonusRow}>
          {p.drawn.map((b, i) => {
            const s = bonusStyleFor(b);
            // Spotlight at the cap skips the bonus-card-replacing
            // step. The "pick which held card to replace" UI is
            // pointless when the answer is "all of them" — Spotlight
            // evicts every other held card on pickup. Dispatch
            // BONUS_KEEP directly; the reducer's cap check has a
            // matching Spotlight bypass.
            const isSpotlight = b.id === SPOTLIGHT_ID;
            const action: Action =
              atMax && !isSpotlight
                ? { type: 'BONUS_SELECT_NEW', idx: i }
                : { type: 'BONUS_KEEP', idx: i };
            return (
              <Pressable
                key={i}
                style={[styles.bonusPick, { borderColor: s.borderColor }, glow(s.borderColor, 8, 0.4)]}
                onPress={() => {
                  haptic('bonus');
                  playSound('bonus');
                  dispatch(action);
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
        {!state.randomPerks && (!atMax || state.bonusDeclineAllowed) && (
          // Short Circuit hides "Decline both" entirely — the random
          // perk roll committed the player to taking a bonus card,
          // so the only out is to keep one (or, at cap, swap one).
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
    // At the cap, bringing Spotlight in evicts ALL other held cards (not just
    // the one tapped to replace), and bringing a non-Spotlight card in while
    // you hold Spotlight evicts the Spotlight. Either way the player can lose
    // more than the single card they think they're swapping — warn first.
    const newIsSpotlight = newCard?.id === SPOTLIGHT_ID;
    const holdsSpotlight = state.bonusCards.some(c => c.id === SPOTLIGHT_ID);
    const spotlightWarning = newIsSpotlight
      ? 'Spotlight is exclusive — swapping it in discards all your other bonus cards, not just the one you tap.'
      : holdsSpotlight
      ? 'You hold Spotlight (exclusive) — swapping in this card discards your Spotlight too.'
      : null;
    return (
      <View style={styles.actionCol}>
        <Text style={[styles.drawnLabel, { color: colors.suitC, textAlign: 'center' }]}>
          ♣ Bonus — Replace
        </Text>
        <Text style={styles.hint}>
          Tap one of your 3 to replace with "{newCard?.name}". The old one is gone for good.
        </Text>
        {spotlightWarning && (
          <Text style={styles.spotlightWarning}>{spotlightWarning}</Text>
        )}
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
  // Stacked column used by the suit-action phases (hop / slide /
  // destroy / bonus). Those phases show one informational button at
  // most, so stacking still makes sense.
  btnCol: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  stackedBtn: {
    height: 48,
  },
  // Awaiting-action layout: a horizontal row of chunky, near-square
  // buttons sitting next to the drawn card. Vertical stacking made
  // it easy to mash the wrong button (Place / Perk / Discard are
  // close in size); a row spreads them apart so each one is its own
  // tap target. btnArea wraps the row + the optional "Joker must
  // be placed" caption beneath it so both stay in the right-hand
  // column of the action area.
  //
  // marginBottom offsets the "deck N" + "perks N" text that hangs
  // beneath the card inside DrawnArea — without it, actionRow's
  // alignItems: 'center' centers the buttons against the WHOLE
  // drawn block (card + meta text), which visually lands a few px
  // below the card's centerline. Inflating btnArea's outer box
  // downward shifts the visible content up to match the card.
  btnArea: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'stretch',
  },
  squareBtn: {
    flex: 1,
    height: 60,
  },
  // Wrapper around the perk button — the button itself takes the
  // squareBtn style; this View carries the ref for the first-game
  // hint to anchor against.
  squareBtnWrap: {
    flex: 1,
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
  spotlightWarning: {
    color: colors.warn,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 183, 74, 0.10)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warn,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
