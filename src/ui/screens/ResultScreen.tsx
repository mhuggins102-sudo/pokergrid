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
import { BONUS_DECK_POOL, BonusCard } from '../../game/bonusCards';
import { Card, isJoker } from '../../game/cards';
import {
  ACHIEVEMENTS,
  Achievement,
  achievementEarned,
  CHALLENGES_TOTAL,
  MilestoneInputs,
} from '../../game/achievements';
import { challengeWon, findChallenge } from '../../game/challenges';
import { LineKind } from '../../game/grid';
import { HandRank } from '../../game/hands';
import { bonusShapleyValues, scoreGrid } from '../../game/scoring';
import { GameState } from '../../game/state';
import { BonusCardDetailModal } from '../components/BonusCardDetailModal';
import { BonusCardStrip } from '../components/BonusCardStrip';
import { GridView } from '../components/GridView';
import { LineDetailModal } from '../components/LineDetailModal';
import { NeonButton } from '../components/NeonButton';
import { RewardsFlow, RewardsResult } from '../components/RewardsFlow';
import { useHaptic } from '../haptics';
import { useSettings } from '../settings';
import { useSound } from '../sound';
import { tierForRun, useStats } from '../stats';
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

export const ResultScreen = ({ state, context, onReplay, onHome, onAdvance }: Props) => {
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const [bonusDetailIdx, setBonusDetailIdx] = useState<number | null>(null);
  const [linesExpanded, setLinesExpanded] = useState(false);
  const {
    stats,
    record,
    recordTargetsUp,
    recordChallenge,
    recordAchievement,
  } = useStats();
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

  // ---- Targets Up rewards (S / SS) -----------------------------------
  // Rewards now run through the RewardsFlow modal instead of the
  // inline picker chain. A-tier wins skip the modal entirely; S/SS
  // wins surface a "Rewards →" button on the result screen that
  // opens the modal. The modal handles both pick categories itself
  // (single-step for S, sequential for SS) and reports back with a
  // single RewardsResult, which we turn into the save args + the
  // next-level carry-overs below.
  const isTUWin = context.mode === 'targets-up' && won;
  const tierRequiresRewards = isTUWin && (tier === 'S' || tier === 'SS');
  const [rewards, setRewards] = useState<RewardsResult | null>(null);
  const [rewardsOpen, setRewardsOpen] = useState(false);

  // baseIdOf strips the -pwrN suffix so Pair ×4 and Pair ×4.8 register
  // as the same card for the no-repeat cooldown. Shared with the
  // modal via the `lastKeptBaseId` prop we hand it.
  const lastKeptBaseId = context.mode === 'targets-up'
    ? (context.lastKeptBaseId ?? null)
    : null;
  const baseIdOf = (c: BonusCard): string => c.id.replace(/-pwr\d+$/, '');

  // Derived carry-overs from the rewards result.
  const prevDeckExtras = context.mode === 'targets-up'
    ? (context.deckExtras ?? [])
    : [];
  const prevSupercharged = context.mode === 'targets-up'
    ? (context.superchargedDeckCards ?? [])
    : [];

  // Build the supercharged grid card from the rewards pick (used for
  // the next-level deck splice AND for displaying the supercharge
  // badge on the result-screen grid once the modal closes).
  const superchargedCard: Card | undefined = useMemo(() => {
    if (rewards?.gridSlot === undefined || rewards.gridSupercharge === undefined) {
      return undefined;
    }
    const c = state.grid[rewards.gridSlot];
    if (!c || isJoker(c)) return undefined;
    return { ...c, supercharge: rewards.gridSupercharge };
  }, [rewards, state.grid]);

  const gridForDisplay = useMemo(() => {
    if (!superchargedCard || rewards?.gridSlot === undefined) return state.grid;
    const next = [...state.grid];
    next[rewards.gridSlot] = superchargedCard;
    return next;
  }, [state.grid, superchargedCard, rewards]);

  const allDeckExtras = useMemo<BonusCard[]>(
    () => (rewards?.bonusCard ? [...prevDeckExtras, rewards.bonusCard] : prevDeckExtras),
    [prevDeckExtras, rewards]
  );
  const allSuperchargedDeckCards: Card[] = useMemo(
    () => (superchargedCard ? [...prevSupercharged, superchargedCard] : prevSupercharged),
    [prevSupercharged, superchargedCard]
  );
  const nextLastKeptBaseId =
    rewards?.bonusCard !== undefined ? baseIdOf(rewards.bonusCard) : null;

  // Persist as soon as the modal completes so closing the app between
  // picking rewards and tapping Next preserves the carry-over. Falls
  // through to no-op for A-tier wins (rewards stays null).
  useEffect(() => {
    if (!isTUWin || rewards === null) return;
    saveTUProgress(
      context.level + 1,
      context.wins + 1,
      allDeckExtras,
      allSuperchargedDeckCards,
      // If the player picked a bonus card, set the new cooldown.
      // Otherwise carry the prior round's cooldown forward so SS-with-
      // only-grid wins (rare edge case where the bonus picker auto-
      // resolved to unavailable) don't accidentally clear it.
      nextLastKeptBaseId !== null
        ? nextLastKeptBaseId
        : lastKeptBaseId
    );
  }, [
    isTUWin,
    rewards,
    allDeckExtras,
    allSuperchargedDeckCards,
    context,
    nextLastKeptBaseId,
    lastKeptBaseId,
    saveTUProgress,
  ]);

  // The Next button is ready when: it's not a TU win OR rewards
  // aren't required OR the modal already completed.
  const advanceReady = !tierRequiresRewards || rewards !== null;

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

  // Achievements earned during this run that the player didn't already
  // have on file. Memoized so the surrounding render + the record
  // useEffect see the same list.
  //
  // Per-tier gating (handled inside achievementEarned):
  //   - 'easy' / 'hard-extreme' : Free Play only, single-difficulty.
  //   - 'milestone'             : cumulative; fires when the post-run
  //                               stats cross the threshold. Free Play
  //                               wins drive most; the "Challenge
  //                               Sweep" milestone fires after a
  //                               Challenge win that completes the
  //                               last entry in the catalog.
  //
  // Tainted runs (any undo used) earn nothing — undos make every
  // structural check trivially exploitable.
  const newlyEarnedAchievements: Achievement[] = useMemo(() => {
    if (tainted) return [];
    // Tiered achievements (easy / hard-extreme) only fire on Free Play
    // wins. Milestones can fire on Free Play OR Challenge runs.
    const isFree = context.mode === 'free';
    const isChallenge = context.mode === 'challenge';
    if (!isFree && !isChallenge) return [];
    // Project the stats forward to "what they'll look like once this
    // run is recorded". Milestones check the post-run state — i.e.
    // "win 25 games" fires on the qualifying 25th win, not the run
    // after.
    const tier = tierForRun({
      ts: Date.now(),
      difficulty: state.difficulty,
      score: total,
      target: state.target,
      won,
    });
    const winInc = isFree && won ? 1 : 0;
    const ssInc = isFree && won && tier === 'SS' ? 1 : 0;
    const winsByDifficulty: Record<typeof state.difficulty, number> = {
      easy: prevStats.byDifficulty.easy.wins,
      medium: prevStats.byDifficulty.medium.wins,
      hard: prevStats.byDifficulty.hard.wins,
      extreme: prevStats.byDifficulty.extreme.wins,
    };
    winsByDifficulty[state.difficulty] += winInc;
    const ssByDifficulty: Record<typeof state.difficulty, number> = {
      easy: prevStats.tierCounts.easy.SS,
      medium: prevStats.tierCounts.medium.SS,
      hard: prevStats.tierCounts.hard.SS,
      extreme: prevStats.tierCounts.extreme.SS,
    };
    ssByDifficulty[state.difficulty] += ssInc;
    const challengesCompleted =
      prevStats.challengesDone.length +
      (isChallenge && won && !prevStats.challengesDone.includes(
        // findChallenge is non-null at this point because mode === 'challenge'
        (context as { id: import('../../game/challenges').ChallengeId }).id
      ) ? 1 : 0);
    // Full Slate: count distinct cards from BONUS_DECK_POOL that have
    // ever scored points (Shapley > 0). Combine the all-time aggregate
    // with the current run's per-card contributions to get the
    // post-run set. Specials / placeholders never get a positive
    // Shapley so they're naturally excluded.
    const scoredIds = new Set<string>();
    for (const [id, s] of Object.entries(prevStats.bonusCardStats)) {
      if (s.totalShapley > 0) scoredIds.add(id);
    }
    for (let i = 0; i < state.bonusCards.length; i++) {
      const v = bonusValues[i] ?? 0;
      if (v > 0) {
        scoredIds.add(state.bonusCards[i].id.replace(/-pwr\d+$/, ''));
      }
    }
    const milestone: MilestoneInputs = {
      winsByDifficulty,
      ssByDifficulty,
      totalWins: prevStats.wins + winInc,
      challengesCompleted,
      totalChallenges: CHALLENGES_TOTAL,
      runBonusShapley: bonusValues,
      runWasFreePlay: isFree && won,
      uniqueBonusCardsScored: scoredIds.size,
      totalBonusCardsInPool: BONUS_DECK_POOL.length,
    };
    return ACHIEVEMENTS.filter(
      a =>
        achievementEarned(a, { state, report, milestone, mode: context.mode }) &&
        !prevStats.achievementsDone.includes(a.id)
    );
  }, [
    tainted,
    context,
    state,
    report,
    total,
    won,
    prevStats,
    bonusValues,
  ]);

  // Record the run exactly once on mount — applying the correct stats
  // method based on the play context. Tainted runs skip the stats /
  // achievement bookkeeping below, BUT we still tear down the Targets
  // Up save on loss so Home doesn't show "Continue" pointing at a
  // dead run. Without this guard a tainted TU loss would dangle the
  // save and the player would see the resume option for a level
  // they've already failed.
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    if (context.mode === 'targets-up' && !won) {
      clearTUProgress();
    }
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
    // Achievements fire across every mode, gated only on Hard / Extreme
    // difficulty and the per-achievement structural condition. Tainted
    // runs (any undo used) still don't qualify — undos make every
    // structural check trivially exploitable.
    if (!tainted) {
      for (const a of newlyEarnedAchievements) {
        recordAchievement(a.id);
      }
    }
  }, [record, recordTargetsUp, recordChallenge, recordAchievement, saveTUProgress, clearTUProgress, context, state.difficulty, state.target, total, won, tainted, state.bonusCards, bonusValues, newlyEarnedAchievements]);

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

  // Stash the most recently inspected line so the LineDetailModal's
  // fade-out animation keeps rendering valid kind/index/cards after
  // the parent clears inspectLine on close.
  const lastInspectLineRef = useRef<{ kind: LineKind; index: number } | null>(null);
  if (inspectLine) lastInspectLineRef.current = inspectLine;
  const stableInspectLine = inspectLine ?? lastInspectLineRef.current;

  const inspectCards = useMemo(() => {
    // LineDetailModal calls evaluateLine which throws unless the
    // array is exactly 5 slots long. Initial render (no inspectLine
    // yet) gets a 5-null placeholder; the modal is invisible then.
    if (!stableInspectLine) return [null, null, null, null, null];
    if (stableInspectLine.kind === 'row') {
      return state.grid.slice(stableInspectLine.index * 5, stableInspectLine.index * 5 + 5);
    }
    const out = [];
    for (let r = 0; r < 5; r++) out.push(state.grid[r * 5 + stableInspectLine.index]);
    return out;
  }, [state.grid, stableInspectLine]);

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

      {newlyEarnedAchievements.length > 0 && (
        <View style={styles.achievementBlock}>
          <Text style={styles.achievementHeading}>
            ✦ Achievement{newlyEarnedAchievements.length === 1 ? '' : 's'} earned
          </Text>
          {newlyEarnedAchievements.map(a => (
            <View key={a.id} style={styles.achievementRow}>
              <Text style={styles.achievementName}>{a.name}</Text>
              <Text style={styles.achievementDesc}>{a.description}</Text>
            </View>
          ))}
        </View>
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
          // Once a grid supercharge is picked the resulting slot is
          // highlighted on the result-screen grid so the player can
          // see what they got. No more inline tap-to-pick.
          highlight={
            rewards?.gridSlot !== undefined
              ? new Set([rewards.gridSlot])
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

      <View style={styles.btnRow}>
        {context.mode === 'targets-up' ? (
          won ? (
            // For S/SS the button label switches between "Rewards →" and
            // "Next →" depending on whether the modal has run; for A it
            // just reads "Next →" since there are no rewards to pick.
            // Tap behavior mirrors that — Rewards opens the modal, Next
            // calls onAdvance with the carry-overs we computed up top.
            tierRequiresRewards && rewards === null ? (
              <NeonButton
                label="Rewards →"
                variant="primary"
                size="lg"
                onPress={() => setRewardsOpen(true)}
                style={{ flex: 1 }}
              />
            ) : (
              <NeonButton
                label="Next"
                variant="primary"
                size="lg"
                disabled={!advanceReady}
                onPress={() =>
                  onAdvance(
                    allDeckExtras,
                    allSuperchargedDeckCards,
                    nextLastKeptBaseId !== null
                      ? nextLastKeptBaseId
                      : lastKeptBaseId
                  )
                }
                style={{ flex: 1 }}
              />
            )
          ) : null
        ) : (
          // Free Play and Challenges keep the Replay button; only the
          // Targets-Up loss case suppresses it so the player can't retry
          // a level they just failed.
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

      <LineDetailModal
        visible={inspectLine !== null}
        onClose={() => setInspectLine(null)}
        kind={stableInspectLine?.kind ?? 'row'}
        index={stableInspectLine?.index ?? 0}
        cards={inspectCards}
        bonusCards={state.bonusCards}
      />
      <BonusCardDetailModal
        visible={bonusDetailIdx !== null}
        card={bonusDetailIdx !== null ? state.bonusCards[bonusDetailIdx] ?? null : null}
        currentValue={bonusDetailIdx !== null ? bonusValues[bonusDetailIdx] : undefined}
        onClose={() => setBonusDetailIdx(null)}
      />
      {tierRequiresRewards && (tier === 'S' || tier === 'SS') && (
        <RewardsFlow
          visible={rewardsOpen}
          tier={tier}
          grid={state.grid}
          bonusCards={state.bonusCards}
          lastKeptBaseId={lastKeptBaseId}
          onComplete={result => {
            setRewards(result);
            setRewardsOpen(false);
          }}
          onCancel={() => setRewardsOpen(false)}
        />
      )}
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
  // Achievement-earned callout. Joker-violet to match the SS-tier
  // celebration and stand out from the score banner above. Sits
  // between the banner / tainted notice and the bonus card strip so
  // the player sees it before scanning their final grid.
  achievementBlock: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgPanel,
    borderColor: colors.joker,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...glow(colors.joker, 10, 0.5),
  },
  achievementHeading: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    textShadowColor: colors.joker,
    textShadowRadius: 4,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  achievementRow: {
    marginTop: 4,
  },
  achievementName: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  achievementDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
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
