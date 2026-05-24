import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
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

const BannerHero = ({
  won,
  score,
  target,
  kicker,
}: {
  won: boolean;
  score: number;
  target: number;
  kicker?: string;
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
    </Animated.View>
  );
};

export const ResultScreen = ({ state, context, onReplay, onHome, onAdvance }: Props) => {
  const [inspectLine, setInspectLine] = useState<{ kind: LineKind; index: number } | null>(null);
  const [bonusDetailIdx, setBonusDetailIdx] = useState<number | null>(null);
  const { record, recordTargetsUp, recordChallenge } = useStats();
  const recorded = useRef(false);

  const report = useMemo(
    () => scoreGrid(state.grid, state.bonusCards, {
      deckRemaining: state.deck.length,
      trash: state.trash,
    }),
    [state.grid, state.bonusCards, state.deck.length, state.trash]
  );

  const bonusValues = useMemo(
    () =>
      bonusShapleyValues(state.grid, state.bonusCards, {
        deckRemaining: state.deck.length,
        trash: state.trash,
      }),
    [state.grid, state.bonusCards, state.deck.length, state.trash]
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
    ? challengeWon(challenge, state.grid, report)
    : total >= state.target;

  const kicker =
    context.mode === 'targets-up'
      ? `LEVEL ${context.level}`
      : context.mode === 'challenge'
      ? `CHALLENGE · ${challenge!.name.toUpperCase()}`
      : context.difficulty.toUpperCase();

  // Record the run exactly once on mount — applying the correct stats
  // method based on the play context.
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    switch (context.mode) {
      case 'free':
        record({
          ts: Date.now(),
          difficulty: state.difficulty,
          score: total,
          target: state.target,
          won,
        });
        break;
      case 'targets-up':
        if (won) recordTargetsUp(context.level);
        break;
      case 'challenge':
        if (won) recordChallenge(context.id);
        break;
    }
  }, [record, recordTargetsUp, recordChallenge, context, state.difficulty, state.target, total, won]);

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
      <BannerHero won={won} score={total} target={state.target} kicker={kicker} />

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

      <BonusCardStrip
        cards={state.bonusCards}
        values={bonusValues}
        onCardPress={i => setBonusDetailIdx(i)}
      />
      <View style={styles.gridArea}>
        <GridView
          grid={state.grid}
          onLinePress={(kind, index) => setInspectLine({ kind, index })}
        />
      </View>

      <View style={styles.breakdownBlock}>
        <Text style={styles.sectionLabel}>Per-line</Text>
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
            label={`Next · Level ${context.level + 1}`}
            variant="primary"
            size="lg"
            onPress={onAdvance}
            style={{ flex: 1 }}
          />
        ) : (
          <NeonButton
            label={
              context.mode === 'free'
                ? `Replay · ${state.difficulty}`
                : context.mode === 'targets-up'
                ? 'Try Again'
                : 'Try Again'
            }
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
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 2,
    borderRadius: radius.lg,
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
  bannerScore: {
    fontFamily: fonts.mono,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowRadius: 18,
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
  breakdownBlock: { marginTop: spacing.md },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.bgPanel,
    marginBottom: 3,
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
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
