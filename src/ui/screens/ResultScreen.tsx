import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import type { PlayContext } from '../../../App';
import { BonusCard, powerUpBonusCard } from '../../game/bonusCards';
import { Card, isJoker, Supercharge } from '../../game/cards';
import { challengeWon, findChallenge } from '../../game/challenges';
import { LineKind } from '../../game/grid';
import { HandRank } from '../../game/hands';
import { bonusShapleyValues, scoreGrid } from '../../game/scoring';
import { GameState } from '../../game/state';
import { styleFor as bonusStyleFor } from '../bonusCardCategory';
import { BonusCardDetailModal } from '../components/BonusCardDetailModal';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { NeonButton } from '../components/NeonButton';
import { useHaptic } from '../haptics';
import { useSettings } from '../settings';
import { useSound } from '../sound';
import { useStats } from '../stats';
import { useTUSave } from '../targetsUpSave';
import { buildShareUrl, shareUrl } from '../share';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  state: GameState;
  context: PlayContext;
  onReplay: () => void;
  onHome: () => void;
  // For TU mode, the cumulative powered bonus extras + S-tier
  // supercharged deck cards are passed through so the next level
  // starts with the full carry-over state.
  onAdvance: (
    deckExtras?: BonusCard[],
    superchargedDeckCards?: Card[],
    lastKeptBaseId?: string | null
  ) => void;
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

type Tier = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';

const tierFor = (score: number, target: number, won: boolean): Tier => {
  const ratio = score / Math.max(1, target);
  if (won) {
    if (ratio >= 1.6) return 'SS';
    if (ratio >= 1.3) return 'S';
    return 'A';
  }
  if (ratio >= 0.85) return 'B';
  if (ratio >= 0.5) return 'C';
  return 'D';
};

const TIER_COLOR: Record<Tier, string> = {
  D: colors.danger,
  C: colors.warn,
  B: colors.accent,
  A: colors.success,
  S: colors.success,
  SS: colors.joker,
};

const TIER_LABEL: Record<Tier, string> = {
  D: 'D · Survived',
  C: 'C · Close',
  B: 'B · So Close',
  A: 'A · Win',
  S: 'S · Strong',
  SS: 'SS · Perfect',
};

const CONFETTI_COLORS = [
  colors.suitH,
  colors.suitS,
  colors.suitD,
  colors.suitC,
  colors.joker,
];

interface ParticleSpec {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}

const Particle = ({ spec }: { spec: ParticleSpec }) => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(spec.delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [t, spec.delay]);
  const style = useAnimatedStyle(() => {
    const eased = t.value;
    const x = Math.cos(spec.angle) * spec.distance * eased;
    const y = Math.sin(spec.angle) * spec.distance * eased + eased * eased * 60;
    return {
      transform: [{ translateX: x }, { translateY: y }],
      opacity: 1 - eased,
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        { backgroundColor: spec.color, width: spec.size, height: spec.size },
        style,
      ]}
    />
  );
};

const ConfettiBurst = () => {
  const specs = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        angle: (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
        distance: 70 + Math.random() * 90,
        size: 5 + Math.random() * 4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 120,
      })),
    []
  );
  return (
    <View pointerEvents="none" style={styles.confettiContainer}>
      {specs.map((s, i) => (
        <Particle key={i} spec={s} />
      ))}
    </View>
  );
};

const BannerHero = ({
  won,
  score,
  target,
  kicker,
  tier,
  isNewBest,
}: {
  won: boolean;
  score: number;
  target: number;
  kicker?: string;
  tier: Tier;
  isNewBest: boolean;
}) => {
  const { settings } = useSettings();
  const haptic = useHaptic();
  const playSound = useSound();
  const fade = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const fired = useRef(false);

  useEffect(() => {
    if (settings.reduceMotion) {
      fade.value = 1;
      scale.value = 1;
    } else {
      fade.value = withTiming(1, { duration: 280 });
      scale.value = withSequence(
        withTiming(1.08, { duration: 280 }),
        withTiming(1, { duration: 220 })
      );
    }
    if (!fired.current) {
      haptic(won ? 'success' : 'error');
      playSound(won ? 'win' : 'lose');
      fired.current = true;
    }
  }, [won, fade, scale, settings.reduceMotion, haptic, playSound]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }],
  }));

  const accent = won ? colors.success : colors.danger;
  const tierColor = TIER_COLOR[tier];
  // Confetti only on A+ tiers, and only when reduce-motion is off.
  const showConfetti = (tier === 'A' || tier === 'S' || tier === 'SS') && !settings.reduceMotion;

  return (
    <Animated.View style={[styles.banner, { borderColor: accent }, glow(accent, 18, 0.55), animStyle]}>
      {kicker && <Text style={styles.bannerMode}>{kicker}</Text>}
      <Text style={[styles.bannerKicker, { color: accent, textShadowColor: accent }]}>
        {won ? '· WIN ·' : '· DEFEAT ·'}
      </Text>
      <Text style={[styles.bannerScore, { color: accent, textShadowColor: accent }]}>
        {score}
      </Text>
      <Text style={styles.bannerTarget}>target {target}</Text>
      <View style={[styles.tierBadge, { borderColor: tierColor }, glow(tierColor, 10, 0.5)]}>
        <Text style={[styles.tierText, { color: tierColor, textShadowColor: tierColor }]}>
          {TIER_LABEL[tier]}
        </Text>
      </View>
      {isNewBest && (
        <View style={[styles.bestBadge, glow(colors.warn, 10, 0.55)]}>
          <Text style={styles.bestBadgeText}>★ NEW BEST ★</Text>
        </View>
      )}
      {showConfetti && <ConfettiBurst />}
    </Animated.View>
  );
};

// Picker chip with a mount-time "power-up" animation: scale pulses up
// briefly + a bright glow flash, then settles into its resting state.
// The glow color matches the card's category tone so the visual reads
// in step with the rest of the chip styling. Reduce-motion disables the
// animation but the chip still shows the new (post-boost) value.
//
// `blocked` is the no-consecutive-same-card constraint: this chip's
// base id matches the card the player kept last round, so they can't
// keep it again. The chip still animates (its multiplier did get
// powered up) but it's greyed out, unselectable, and carries a small
// "kept last round" tag.
const PickerChip = ({
  card,
  selected,
  dimmed,
  blocked,
  onPress,
}: {
  card: BonusCard;
  selected: boolean;
  dimmed: boolean;
  blocked: boolean;
  onPress: () => void;
}) => {
  const { settings } = useSettings();
  const tone = bonusStyleFor(card);
  const scale = useSharedValue(settings.reduceMotion ? 1 : 0.85);
  const glowOpacity = useSharedValue(settings.reduceMotion ? 0.3 : 0);

  useEffect(() => {
    if (settings.reduceMotion) {
      scale.value = 1;
      glowOpacity.value = 0.3;
      return;
    }
    scale.value = withSequence(
      withTiming(1.12, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 260 })
    );
    glowOpacity.value = withSequence(
      withTiming(1, { duration: 320 }),
      withTiming(0.3, { duration: 540 })
    );
  }, [scale, glowOpacity, settings.reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: glowOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.pickerCard,
        { borderColor: tone.borderColor, shadowColor: tone.borderColor, shadowRadius: 10 },
        selected && styles.pickerCardSelected,
        dimmed && styles.pickerCardDimmed,
        blocked && styles.pickerCardBlocked,
        animStyle,
      ]}
    >
      <Pressable
        onPress={blocked ? undefined : onPress}
        style={styles.pickerCardInner}
      >
        <Text
          style={[styles.pickerCardTitle, { color: tone.titleColor, textShadowColor: tone.titleColor }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {card.title}
        </Text>
        <Text style={styles.pickerCardMult} numberOfLines={1} adjustsFontSizeToFit>
          {card.mult}
        </Text>
        {blocked ? (
          <Text style={styles.pickerCardBlockedTag}>picked last round</Text>
        ) : card.baseMultValue !== undefined && card.baseMultValue !== card.multValue ? (
          <Text style={styles.pickerCardWas}>was ×{card.baseMultValue}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

// Supercharge reveal text: fades + scales in when the player taps a card
// on the grid and the wild/double coin flip resolves. Anchored under the
// "S-tier reward" prompt so the player's attention is pulled from the
// grid tap to the rolled outcome.
const SuperchargeReveal = ({ supercharge }: { supercharge: Supercharge }) => {
  const { settings } = useSettings();
  const opacity = useSharedValue(settings.reduceMotion ? 1 : 0);
  const scale = useSharedValue(settings.reduceMotion ? 1 : 0.8);
  useEffect(() => {
    if (settings.reduceMotion) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 360 });
    scale.value = withSequence(
      withTiming(1.18, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220 })
    );
  }, [opacity, scale, settings.reduceMotion, supercharge]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.Text style={[styles.superchargeRevealText, animStyle]}>
      {supercharge === 'wild'
        ? '✦ WILD — suit is now flexible for flush / straight flush.'
        : '×2 DOUBLE — counts as 2 same-rank cards.'}
    </Animated.Text>
  );
};

export const ResultScreen = ({ state, context, onReplay, onHome, onAdvance }: Props) => {
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const [bonusDetailIdx, setBonusDetailIdx] = useState<number | null>(null);
  const [linesExpanded, setLinesExpanded] = useState(false);
  const { stats, record, recordTargetsUp, recordChallenge } = useStats();
  const { saveProgress: saveTUProgress, clearProgress: clearTUProgress } = useTUSave();
  const recorded = useRef(false);
  // Snapshot stats on first render so the "NEW BEST" check compares against
  // the player's prior best — not the post-record best (which would always
  // tie or beat itself on win runs).
  const statsAtMount = useRef<typeof stats | undefined>(undefined);
  if (!statsAtMount.current) statsAtMount.current = stats;
  const prevStats = statsAtMount.current;

  const report = useMemo(
    () => scoreGrid(state.grid, state.bonusCards, {
      deckRemaining: state.deck.length,
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

  const bonusValues = useMemo(
    () =>
      bonusShapleyValues(state.grid, state.bonusCards, {
        deckRemaining: state.deck.length,
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
  const {
    lines: scoredLines,
    subtotal,
    incompletePenalty,
    gridMultiplier,
    gridFlat,
    total,
  } = report;
  // Whether the run was a "win" depends on the play context.
  //  - Free play: total ≥ target.
  //  - Targets-Up: total ≥ target for the current level.
  //  - Challenge: total ≥ challenge target AND the challenge's structural
  //    condition is met.
  const challenge = context.mode === 'challenge' ? findChallenge(context.id) : null;
  const won = challenge
    ? challengeWon(challenge, state, report)
    : total >= state.target;

  const kicker =
    context.mode === 'targets-up'
      ? `LEVEL ${context.level}`
      : context.mode === 'challenge'
      ? `CHALLENGE · ${challenge!.name.toUpperCase()}`
      : context.difficulty.toUpperCase();

  // Practice runs: any UNDO during the run "taints" it for stats. We skip
  // recording entirely so undos can't be used to game the leaderboard.
  const tainted = state.undoCount > 0;

  const tier = tierFor(total, state.target, won);

  // ---- Targets-Up reward gating --------------------------------------
  // Upgrades are now tied to tier:
  //   A   — no upgrades (the level still advances; cards in hand simply
  //         don't carry forward, and no grid card gets supercharged).
  //   S   — the player picks ONE of the two upgrades (keep-one bonus
  //         power-up OR grid supercharge).
  //   SS  — BOTH upgrades, sequentially (keep-one first, then grid).
  const isTUWin = context.mode === 'targets-up' && won;
  const requiresTierChoice = isTUWin && tier === 'S';
  const [tierChoice, setTierChoice] = useState<'bonus' | 'grid' | null>(null);
  const showTierChoice = requiresTierChoice && tierChoice === null;
  const showBonusPicker =
    isTUWin && (tier === 'SS' || (tier === 'S' && tierChoice === 'bonus'));
  const showGridPicker =
    isTUWin && (tier === 'SS' || (tier === 'S' && tierChoice === 'grid'));

  // If the player has no bonus cards in hand at S tier, the bonus
  // option isn't viable — auto-resolve the choice to grid so the
  // player doesn't get stuck on a picker that can't render.
  useEffect(() => {
    if (!requiresTierChoice || tierChoice !== null) return;
    if (state.bonusCards.length === 0) setTierChoice('grid');
  }, [requiresTierChoice, tierChoice, state.bonusCards.length]);

  const poweredCards = useMemo<BonusCard[]>(
    () => (showBonusPicker ? state.bonusCards.map(c => powerUpBonusCard(c)) : []),
    [showBonusPicker, state.bonusCards]
  );
  const [keptIdx, setKeptIdx] = useState<number | null>(null);

  // No consecutive same-card upgrade: any chip whose base id matches
  // the card the player kept last round is blocked. Each chip's base
  // id is the id with the -pwrN suffix stripped so Pair ×4 and Pair
  // ×4.8 register as the same card.
  const lastKeptBaseId = context.mode === 'targets-up'
    ? (context.lastKeptBaseId ?? null)
    : null;
  const baseIdOf = (c: BonusCard): string => c.id.replace(/-pwr\d+$/, '');
  const blockedIndices = useMemo(() => {
    if (!lastKeptBaseId) return new Set<number>();
    return new Set(
      poweredCards
        .map((c, i) => (baseIdOf(c) === lastKeptBaseId ? i : -1))
        .filter(i => i >= 0)
    );
  }, [poweredCards, lastKeptBaseId]);
  const allBlocked = isTUWin && poweredCards.length > 0
    && blockedIndices.size === poweredCards.length;

  // Base id passed forward as next round's `lastKeptBaseId`. null when
  // the player picked nothing (0-card hand, all blocked, or never
  // resolved the picker) so next round has no constraint. Declared
  // before the picker-state useEffects so they can reference it via
  // their dependency arrays without hitting a temporal-dead-zone
  // ReferenceError at render time.
  const nextLastKeptBaseId =
    keptIdx !== null && poweredCards[keptIdx]
      ? baseIdOf(poweredCards[keptIdx])
      : null;

  // Single-card hands auto-pick (the player has no real choice — keep
  // the one card they had) UNLESS that single card is the blocked one,
  // in which case the round just yields no keep. 0-card hands skip
  // the picker entirely.
  useEffect(() => {
    if (poweredCards.length === 1 && keptIdx === null && !blockedIndices.has(0)) {
      setKeptIdx(0);
    }
  }, [poweredCards.length, keptIdx, blockedIndices]);

  // Cumulative deck extras for TU runs: previous levels' supercharged
  // bonus cards plus the ONE the player picked this round (if any).
  // Cards the player didn't pick are simply discarded — no carry-over.
  const prevDeckExtras = context.mode === 'targets-up'
    ? (context.deckExtras ?? [])
    : [];
  const newDeckExtras = useMemo<BonusCard[]>(
    () => (keptIdx === null ? [] : [poweredCards[keptIdx]]),
    [poweredCards, keptIdx]
  );
  const allDeckExtras = useMemo<BonusCard[]>(
    () => [...prevDeckExtras, ...newDeckExtras],
    [prevDeckExtras, newDeckExtras]
  );

  // Persist the picker outcome as it happens — so if the player closes
  // the app between picking and tapping Next, they still resume with
  // their carry-over intact. Preserve any prior supercharged-deck cards
  // (from earlier S-tier wins) on this write; the supercharge picker's
  // own useEffect re-saves with the new pick once it resolves.
  useEffect(() => {
    if (!isTUWin || keptIdx === null) return;
    saveTUProgress(
      context.level + 1,
      context.wins + 1,
      allDeckExtras,
      context.mode === 'targets-up' ? context.superchargedDeckCards : undefined,
      nextLastKeptBaseId
    );
  }, [
    isTUWin,
    keptIdx,
    allDeckExtras,
    context,
    nextLastKeptBaseId,
    saveTUProgress,
  ]);

  // When every chip is blocked (all 3 would repeat last round) we also
  // overwrite the save's lastKeptBaseId to null so the player gets a
  // clean slate next round — otherwise they'd carry the same block
  // forward forever.
  useEffect(() => {
    if (!isTUWin || !allBlocked) return;
    saveTUProgress(
      context.level + 1,
      context.wins + 1,
      allDeckExtras,
      context.mode === 'targets-up' ? context.superchargedDeckCards : undefined,
      null
    );
  }, [isTUWin, allBlocked, allDeckExtras, context, saveTUProgress]);

  // ---- S/SS-tier grid supercharge picker -----------------------------
  // Visibility is gated on `showGridPicker` computed above with the
  // tier-choice logic: SS shows it unconditionally, S only shows it
  // when the player chose 'grid' over the bonus power-up.
  const [superchargedSlot, setSuperchargedSlot] = useState<number | null>(null);
  const [supercharge, setSupercharge] = useState<Supercharge | null>(null);
  const handleGridPick = (slot: number) => {
    if (!showGridPicker || superchargedSlot !== null) return;
    const target = state.grid[slot];
    if (!target || isJoker(target)) return;
    // Roll a fresh wild vs double for this pick. Coin flip.
    const roll: Supercharge = Math.random() < 0.5 ? 'wild' : 'double';
    setSuperchargedSlot(slot);
    setSupercharge(roll);
  };

  const superchargedCard: Card | undefined = useMemo(() => {
    if (superchargedSlot === null || supercharge === null) return undefined;
    const c = state.grid[superchargedSlot];
    if (!c || isJoker(c)) return undefined;
    return { ...c, supercharge };
  }, [superchargedSlot, supercharge, state.grid]);

  // Apply the picked supercharge to the displayed grid so the suit glyph
  // (or ×2 badge) updates immediately when the player taps a card.
  const gridForDisplay = useMemo(() => {
    if (!superchargedCard || superchargedSlot === null) return state.grid;
    const next = [...state.grid];
    next[superchargedSlot] = superchargedCard;
    return next;
  }, [state.grid, superchargedCard, superchargedSlot]);

  // Cumulative supercharged-deck list = previous-level supercharges +
  // this level's pick (if any).
  const prevSupercharged = context.mode === 'targets-up'
    ? (context.superchargedDeckCards ?? [])
    : [];
  const allSuperchargedDeckCards: Card[] = useMemo(
    () => (superchargedCard ? [...prevSupercharged, superchargedCard] : prevSupercharged),
    [prevSupercharged, superchargedCard]
  );

  // Update the save once the player completes the supercharge pick so
  // closing the app between picking and Next preserves it.
  useEffect(() => {
    if (!isTUWin) return;
    if (!showGridPicker) return;
    if (superchargedSlot === null) return;
    saveTUProgress(
      context.level + 1,
      context.wins + 1,
      allDeckExtras,
      allSuperchargedDeckCards,
      // Preserve the bonus-supercharge picker's effect on
      // lastKeptBaseId — if we omitted this, the save default would
      // null it out and undo the cooldown the bonus picker just set.
      nextLastKeptBaseId !== null
        ? nextLastKeptBaseId
        : (context.lastKeptBaseId ?? null)
    );
  }, [
    isTUWin,
    showGridPicker,
    superchargedSlot,
    allDeckExtras,
    allSuperchargedDeckCards,
    context,
    nextLastKeptBaseId,
    saveTUProgress,
  ]);

  // TU win blocks the Next button until the picker(s) resolve. For all
  // other modes (loss, free play, challenge) Next/Replay are immediate.
  // `allBlocked` short-circuits the keep picker: every chip matched
  // last round's pick so no choice is possible — the round forfeits
  // its kept-card boost and proceeds.
  const keepPickerDone =
    !showBonusPicker || keptIdx !== null || poweredCards.length === 0 || allBlocked;
  const superchargePickerDone = !showGridPicker || superchargedSlot !== null;
  const pickerComplete = !showTierChoice && keepPickerDone && superchargePickerDone;

  // Personal-best detection. Tainted runs don't count — they wouldn't be
  // recorded either, so flagging them as "new best" would be misleading.
  const isNewBest = ((): boolean => {
    if (tainted || !won) return false;
    switch (context.mode) {
      case 'free': {
        const prev = prevStats.byDifficulty[state.difficulty].best;
        return prev === null || total > prev;
      }
      case 'targets-up':
        return context.level > prevStats.targetsUpBest;
      case 'challenge':
        return !prevStats.challengesDone.includes(context.id);
      default:
        return false;
    }
  })();

  // Record the run exactly once on mount — applying the correct stats
  // method based on the play context. Tainted runs are skipped.
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    if (tainted) return;
    // Per-card attribution: pair every held bonus card with its Shapley
    // value so recordRun can fold them into the all-time aggregate that
    // powers the StatsScreen's bonus-card analytics. Strip any "-pwrN"
    // suffix so a powered-up variant aggregates under its base card id
    // (a Pair ×4 and a Pair ×4.8 still share the "Pair" stats row).
    const bonusCardsForRecord = state.bonusCards.map((card, i) => ({
      cardId: card.id.replace(/-pwr\d+$/, ''),
      shapley: bonusValues[i] ?? 0,
    }));
    switch (context.mode) {
      case 'free':
        record({
          ts: Date.now(),
          difficulty: state.difficulty,
          score: total,
          target: state.target,
          won,
          bonusCards: bonusCardsForRecord,
        });
        break;
      case 'targets-up':
        if (won) {
          recordTargetsUp(context.level);
          // Initial save: roll the run forward to the next level
          // immediately so closing the app preserves at least the level
          // progress. Carries previous context's lastKeptBaseId forward
          // so the no-consecutive-same-card cooldown survives even when
          // a round forfeits its upgrades (A tier, or S/SS where the
          // player bails before picking). Pickers re-save with their
          // own results once they resolve.
          saveTUProgress(
            context.level + 1,
            context.wins + 1,
            context.deckExtras ?? [],
            context.superchargedDeckCards ?? [],
            context.lastKeptBaseId ?? null
          );
        } else {
          // A losing TU level ends the run; wipe the save so Home goes
          // back to "Start at Level 1" instead of resuming into a dead
          // run state.
          clearTUProgress();
        }
        break;
      case 'challenge':
        if (won) recordChallenge(context.id);
        break;
    }
  }, [record, recordTargetsUp, recordChallenge, saveTUProgress, clearTUProgress, context, state.difficulty, state.target, total, won, tainted, state.bonusCards, bonusValues]);

  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const handleShare = async () => {
    const url = buildShareUrl({
      score: total,
      mode: context.mode,
      difficulty: context.mode === 'free' ? state.difficulty : undefined,
      grid: state.grid,
    });
    const title = `I scored ${total} on PokerGrid. Can you beat me?`;
    const result = await shareUrl(url, title);
    if (result.outcome === 'copied') {
      setShareLabel('Link copied!');
      setTimeout(() => setShareLabel(null), 2200);
    }
  };

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
      <BannerHero
        won={won}
        score={total}
        target={state.target}
        kicker={kicker}
        tier={tier}
        isNewBest={isNewBest}
      />

      {context.mode === 'targets-up' && (
        <Text style={styles.modeNote}>
          {won
            ? `Cleared Level ${context.level}. Next target: ${state.target + 50}.`
            : `Run ended at Level ${context.level}. Wins this run: ${context.wins}.`}
        </Text>
      )}
      {context.mode === 'challenge' && (
        <Text style={styles.modeNote}>{challenge!.goal}</Text>
      )}
      {tainted && (
        <Text style={styles.taintedNote}>
          Practice run · {state.undoCount} undo{state.undoCount === 1 ? '' : 's'} used · score not recorded
        </Text>
      )}

      <BonusCardStrip
        cards={state.bonusCards}
        values={bonusValues}
        onCardPress={i => setBonusDetailIdx(i)}
      />
      <View style={styles.gridArea}>
        <GridView
          grid={gridForDisplay}
          onLinePress={(kind, index) => setInspectLine({ kind, index })}
          onSlotPress={
            showGridPicker && keepPickerDone && superchargedSlot === null
              ? handleGridPick
              : undefined
          }
          highlight={
            showGridPicker && keepPickerDone && superchargedSlot === null
              ? new Set(
                  state.grid
                    .map((c, i) => (c && !isJoker(c) ? i : -1))
                    .filter(i => i >= 0)
                )
              : showGridPicker && superchargedSlot !== null
                ? new Set([superchargedSlot])
                : undefined
          }
          compact
        />
      </View>

      <View style={styles.breakdownBlock}>
        <Text style={styles.sectionLabel}>Score Breakdown</Text>

        <Pressable
          style={styles.accordionHeader}
          onPress={() => setLinesExpanded(v => !v)}
        >
          <Text style={styles.accordionLabel}>
            {linesExpanded ? '▼' : '▶'} Per-line scores
          </Text>
          <Text style={styles.accordionHint}>
            {scoredLines.filter(l => l.total !== 0).length} of 10 scoring
          </Text>
        </Pressable>

        {linesExpanded && scoredLines.map(line => (
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
              {line.kind === 'row' ? `R${line.index + 1}` : `C${line.index + 1}`}
            </Text>
            <Text style={styles.lineHand}>
              {line.hand ? HAND_LABEL[line.hand] : line.incomplete ? 'Incomplete' : '—'}
            </Text>
            <Text
              style={[
                styles.lineScore,
                line.total < 0 && styles.lineScorePenalty,
                line.total > 0 && styles.lineScoreActive,
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
            <Text style={styles.totalLabel}>Incomplete (in subtotal)</Text>
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
          <Text style={[styles.totalScore, won && styles.totalScoreWon]}>{total}</Text>
        </View>
      </View>

      {showTierChoice && (
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerLabel}>S-tier reward · Pick one to supercharge</Text>
          <Text style={styles.pickerHint}>
            Score an S to supercharge one card; an SS supercharges both. Choose carefully — once you tap, it's locked in for this round.
          </Text>
          <View style={styles.tierChoiceRow}>
            <Pressable
              onPress={() => setTierChoice('bonus')}
              style={[styles.tierChoiceCard, { borderColor: colors.warn }, glow(colors.warn, 8, 0.4)]}
            >
              <Text style={[styles.tierChoiceTitle, { color: colors.warn, textShadowColor: colors.warn }]}>
                Supercharge a bonus card
              </Text>
              <Text style={styles.tierChoiceBody}>
                Pick one of your held cards. It gets ×1.2 power and joins the bonus deck for the rest of the run.
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTierChoice('grid')}
              style={[styles.tierChoiceCard, { borderColor: colors.joker }, glow(colors.joker, 8, 0.4)]}
            >
              <Text style={[styles.tierChoiceTitle, { color: colors.joker, textShadowColor: colors.joker }]}>
                Supercharge a grid card
              </Text>
              <Text style={styles.tierChoiceBody}>
                Pick any non-joker card on the grid. A coin flip turns it into a wild or a double for the rest of the run.
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {showBonusPicker && poweredCards.length >= 1 && (
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerLabel}>Supercharge a bonus card</Text>
          <Text style={styles.pickerHint}>
            Pick one of your held cards. It gets ×1.2 power and joins the bonus deck for the rest of the run; the others are discarded. You can't supercharge the same card type two rounds in a row.
          </Text>
          {allBlocked && (
            <Text style={styles.pickerAllBlocked}>
              All three cards match last round's pick — no card supercharged this round, but you can repeat any of them next round.
            </Text>
          )}
          <View style={styles.pickerRow}>
            {poweredCards.map((c, i) => (
              <PickerChip
                key={i}
                card={c}
                selected={keptIdx === i}
                dimmed={keptIdx !== null && keptIdx !== i}
                blocked={blockedIndices.has(i)}
                onPress={() => setKeptIdx(i)}
              />
            ))}
          </View>
        </View>
      )}

      {showGridPicker && keepPickerDone && (
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerLabel}>
            S-tier reward · Supercharge a card
          </Text>
          {superchargedSlot === null ? (
            <Text style={styles.pickerHint}>
              Tap any non-joker card on the grid above. A coin flip
              decides whether it becomes WILD (✦, any suit for flush)
              or DOUBLE (×2, counts twice for pair-class hands). The
              supercharge follows the card into the next level's deck.
            </Text>
          ) : (
            supercharge && <SuperchargeReveal supercharge={supercharge} />
          )}
        </View>
      )}

      <View style={styles.btnRow}>
        {context.mode === 'targets-up' && won ? (
          <NeonButton
            label={pickerComplete ? 'Next' : 'Pick to continue'}
            variant="primary"
            size="lg"
            disabled={!pickerComplete}
            onPress={() =>
              onAdvance(
                allDeckExtras,
                allSuperchargedDeckCards,
                // Only overwrite the cooldown when the bonus picker
                // actually resolved (player picked, or all blocked).
                // Otherwise carry the prior lastKeptBaseId forward so
                // A tier and S-tier-grid wins don't lose the cooldown.
                showBonusPicker
                  ? nextLastKeptBaseId
                  : context.mode === 'targets-up'
                    ? (context.lastKeptBaseId ?? null)
                    : null
              )
            }
            style={{ flex: 1 }}
          />
        ) : (
          <NeonButton
            label="Replay"
            variant="primary"
            size="lg"
            onPress={onReplay}
            style={{ flex: 1 }}
          />
        )}
        <NeonButton
          label="Home"
          variant="secondary"
          size="lg"
          onPress={onHome}
          style={{ flex: 1 }}
        />
        <NeonButton
          label={shareLabel ?? 'Share'}
          variant="secondary"
          size="lg"
          onPress={handleShare}
          style={{ flex: 1 }}
        />
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
      <BonusCardDetailModal
        visible={bonusDetailIdx !== null}
        card={bonusDetailIdx !== null ? state.bonusCards[bonusDetailIdx] ?? null : null}
        currentValue={bonusDetailIdx !== null ? bonusValues[bonusDetailIdx] : undefined}
        onClose={() => setBonusDetailIdx(null)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { paddingBottom: spacing.xxl, paddingHorizontal: spacing.md },
  banner: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 2,
    borderRadius: radius.lg,
    // Narrow the hero box to roughly match the width of the three bonus chips
    // beneath it (and the breakdown block further down). Looks less like a
    // full-screen sheet and more like a stat tile.
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  tierBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.bgBase,
  },
  tierText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textShadowRadius: 4,
  },
  bestBadge: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warn,
    backgroundColor: colors.bgBase,
  },
  bestBadgeText: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textShadowColor: colors.warn,
    textShadowRadius: 4,
  },
  confettiContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
  },
  particle: {
    position: 'absolute',
    borderRadius: 2,
  },
  bannerMode: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 2,
  },
  bannerKicker: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 4,
    textShadowRadius: 8,
    marginBottom: spacing.xs,
  },
  modeNote: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 17,
  },
  taintedNote: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    textShadowColor: colors.warn,
    textShadowRadius: 3,
  },
  bannerScore: {
    fontFamily: fonts.mono,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowRadius: 14,
  },
  bannerTarget: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textLow,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  gridArea: { paddingVertical: spacing.xs },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 2,
    fontWeight: '800',
  },
  // Narrower than the rest of the page so the breakdown reads less like a
  // full-screen sheet. The button row uses the same maxWidth so it visually
  // pairs with the breakdown block beneath the grid.
  breakdownBlock: {
    marginTop: spacing.md,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  accordionLabel: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  accordionHint: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgPanel,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  lineRowActive: {
    backgroundColor: 'rgba(92, 255, 154, 0.06)',
    borderColor: 'rgba(92, 255, 154, 0.4)',
  },
  lineRowPenalty: {
    backgroundColor: 'rgba(255, 100, 100, 0.07)',
    borderColor: 'rgba(255, 100, 100, 0.4)',
  },
  lineLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    width: 32,
    letterSpacing: 1,
  },
  lineHand: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    flex: 1,
    marginLeft: spacing.sm,
  },
  lineScore: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    width: 50,
    textAlign: 'right',
  },
  lineScoreActive: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  lineScorePenalty: {
    color: colors.danger,
    textShadowColor: colors.danger,
    textShadowRadius: 4,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: 2,
  },
  subtotalValue: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopColor: colors.outline,
    borderTopWidth: 1,
    marginTop: spacing.xs,
  },
  totalLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  totalScore: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  totalScoreWon: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 10,
  },
  penaltyValue: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  // TU power-up keep-one picker. Sits between the score breakdown and the
  // action buttons; only rendered on TU wins with at least 2 held bonus
  // cards (1-card hands auto-keep, 0-card hands skip entirely).
  pickerBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    borderTopWidth: 1,
    borderTopColor: colors.outlineSoft,
  },
  pickerLabel: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 4,
    marginBottom: spacing.xs,
  },
  pickerHint: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tierChoiceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  tierChoiceCard: {
    flex: 1,
    backgroundColor: colors.bgGlass,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 96,
    justifyContent: 'center',
  },
  tierChoiceTitle: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowRadius: 4,
    textAlign: 'center',
    marginBottom: 4,
  },
  tierChoiceBody: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  pickerCard: {
    flex: 1,
    backgroundColor: colors.bgGlass,
    borderWidth: 1.5,
    borderRadius: radius.md,
    minHeight: 76,
  },
  pickerCardInner: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCardSelected: {
    borderWidth: 2.5,
  },
  pickerCardDimmed: {
    opacity: 0.45,
  },
  pickerCardBlocked: {
    opacity: 0.4,
    borderStyle: 'dashed',
  },
  pickerCardBlockedTag: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontStyle: 'italic',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: 'center',
  },
  pickerAllBlocked: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    marginBottom: spacing.sm,
    textShadowColor: colors.warn,
    textShadowRadius: 3,
  },
  pickerCardTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowRadius: 3,
    textAlign: 'center',
  },
  pickerCardMult: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 4,
    textAlign: 'center',
    marginTop: 2,
  },
  pickerCardWas: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  superchargeRevealText: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: colors.joker,
    textShadowRadius: 5,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  // Mirror the breakdownBlock width so the buttons sit directly beneath it.
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
});
