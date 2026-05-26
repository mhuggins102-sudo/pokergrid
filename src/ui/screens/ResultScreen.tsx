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
import { useHaptic } from '../haptics';
import { useSettings } from '../settings';
import { useSound } from '../sound';
import { useStats } from '../stats';
import { buildShareUrl, shareUrl } from '../share';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  state: GameState;
  context: PlayContext;
  onReplay: () => void;
  onHome: () => void;
  onAdvance: () => void;
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
  const { stats, record, recordTargetsUp, recordChallenge } = useStats();
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
    // powers the StatsScreen's bonus-card analytics.
    const bonusCardsForRecord = state.bonusCards.map((card, i) => ({
      cardId: card.id,
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
        if (won) recordTargetsUp(context.level);
        break;
      case 'challenge':
        if (won) recordChallenge(context.id);
        break;
    }
  }, [record, recordTargetsUp, recordChallenge, context, state.difficulty, state.target, total, won, tainted, state.bonusCards, bonusValues]);

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
          grid={state.grid}
          onLinePress={(kind, index) => setInspectLine({ kind, index })}
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
        {context.mode === 'targets-up' && won ? (
          <NeonButton
            label="Next"
            variant="primary"
            size="lg"
            onPress={onAdvance}
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
