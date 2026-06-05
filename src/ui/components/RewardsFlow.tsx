import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BonusCard, powerUpBonusCard } from '../../game/bonusCards';
import { Card, isJoker, Supercharge } from '../../game/cards';
import { Grid } from '../../game/grid';
import { styleFor as bonusStyleFor } from '../bonusCardCategory';
import { useSettings } from '../settings';
import { useSound } from '../sound';
import { colors, fonts, glow, radius, spacing } from '../theme';
import { GridView } from './GridView';
import { NeonButton } from './NeonButton';

// Strip the -pwrN suffix powerUpBonusCard appends so Pair ×4 and
// Pair ×4.8 read as the same base card for the "no consecutive
// duplicates" cooldown.
const baseIdOf = (c: BonusCard): string => c.id.replace(/-pwr\d+$/, '');

// What the player chose during the flow. For tier S exactly one of
// the two pick types is set; for tier SS both are set. ResultScreen
// turns this into the args it hands to the save + advance handlers.
export interface RewardsResult {
  // Grid supercharge — the slot the player tapped + the rolled
  // wild/double outcome. Both undefined if the player didn't pick
  // a grid card (S-tier bonus pick or the flow being skipped).
  gridSlot?: number;
  gridSupercharge?: Supercharge;
  // Bonus power-up — the index into the bonusCards array of the
  // card the player tapped, plus the already-powered version so
  // ResultScreen doesn't have to re-derive it.
  bonusIdx?: number;
  bonusCard?: BonusCard;
}

interface Props {
  visible: boolean;
  tier: 'S' | 'SS';
  grid: Grid;
  bonusCards: BonusCard[];
  // Base id the player picked last round, used to disable any
  // chip whose base id matches (so the same card can't be
  // supercharged two rounds in a row).
  lastKeptBaseId: string | null;
  // Called with the player's picks once the flow finishes.
  // ResultScreen turns this into save args + onAdvance call.
  onComplete: (result: RewardsResult) => void;
  // Called if the player dismisses the modal without finishing.
  // ResultScreen leaves the "Rewards →" button visible so they
  // can re-open it.
  onCancel: () => void;
}

// Same animation contract as the old inline picker — fades + scales
// the rolled wild/double word so the tap feels rewarding rather
// than transactional.
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
    <Animated.Text style={[styles.reveal, animStyle]}>
      {supercharge === 'wild'
        ? '✦ WILD — suit is now flexible for flush / straight flush.'
        : '×2 DOUBLE — counts as two same-rank cards.'}
    </Animated.Text>
  );
};

// Same chip used by the old inline bonus picker, repackaged. Renders
// a powered-up bonus card with selected / dimmed / blocked states so
// the player can read at a glance which chip they tapped and which
// ones are off-limits.
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
        styles.chip,
        { borderColor: tone.borderColor, shadowColor: tone.borderColor, shadowRadius: 10 },
        selected && styles.chipSelected,
        dimmed && styles.chipDimmed,
        blocked && styles.chipBlocked,
        animStyle,
      ]}
    >
      <Pressable
        onPress={blocked ? undefined : onPress}
        style={styles.chipInner}
      >
        <Text
          style={[styles.chipTitle, { color: tone.titleColor, textShadowColor: tone.titleColor }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {card.title}
        </Text>
        <Text style={styles.chipMult} numberOfLines={1} adjustsFontSizeToFit>
          {card.mult}
        </Text>
        {blocked ? (
          <Text style={styles.chipBlockedTag}>picked last round</Text>
        ) : card.baseMultValue !== undefined && card.baseMultValue !== card.multValue ? (
          <Text style={styles.chipWas}>was ×{card.baseMultValue}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

// Tier S step 1 + only step: pickers for BOTH categories visible at
// once. Tap one card in either section. The other section disables
// once a pick lands so the player can't pick "both" by accident.
//
// Tier SS step 1: grid only. Step 2: bonus only. Both required to
// finish.
//
// Rolling wild vs double is done here (Math.random) at tap time —
// keeping the randomness inside the flow keeps ResultScreen pure of
// roll state.
export const RewardsFlow = ({
  visible,
  tier,
  grid,
  bonusCards,
  lastKeptBaseId,
  onComplete,
  onCancel,
}: Props) => {
  const playSound = useSound();
  // Pre-power every held bonus card so the chips show what the
  // player would actually get (×1.2 of the current multValue, or
  // a Patience +5 bump). powerUpBonusCard is the same helper the
  // engine uses, so the displayed card and the one carried into
  // next level's deck are byte-identical.
  const poweredCards = bonusCards.map(c => powerUpBonusCard(c));
  const blockedIdx = (i: number): boolean =>
    !!lastKeptBaseId && baseIdOf(poweredCards[i]) === lastKeptBaseId;
  const allBlocked =
    poweredCards.length > 0 &&
    poweredCards.every((_, i) => blockedIdx(i));

  // SS-tier flow walks grid → bonus → done. Tier S finishes after
  // any single pick. `step` distinguishes them.
  const [step, setStep] = useState<'grid' | 'bonus' | 'done'>(
    tier === 'SS' ? 'grid' : 'grid' // S starts with both visible; 'step' just gates SS sequencing
  );
  const [gridSlot, setGridSlot] = useState<number | null>(null);
  const [gridSc, setGridSc] = useState<Supercharge | null>(null);
  const [bonusIdx, setBonusIdx] = useState<number | null>(null);
  const gridLocked = gridSlot !== null;
  const bonusLocked = bonusIdx !== null;

  // Reset whenever the modal closes / re-opens so a re-launch starts
  // fresh rather than carrying the previous run's partial state.
  useEffect(() => {
    if (!visible) {
      setStep(tier === 'SS' ? 'grid' : 'grid');
      setGridSlot(null);
      setGridSc(null);
      setBonusIdx(null);
    }
  }, [visible, tier]);

  // Auto-resolve the bonus pick when the player has 0 held cards
  // (nothing to power up) or every card is blocked by the cooldown.
  // ResultScreen still gets onComplete called; bonusIdx just stays
  // undefined in the result.
  const bonusUnavailable = poweredCards.length === 0 || allBlocked;

  // Tier S single-step: player picks ONE category. Done as soon as
  // either side has a pick.
  // Tier SS two-step: grid step needs a gridSlot, bonus step needs
  // a bonusIdx (or to be unavailable).
  const canFinish =
    tier === 'S'
      ? gridLocked || bonusLocked
      : gridLocked && (bonusLocked || (step === 'bonus' && bonusUnavailable));

  // Show the grid in tier-S mode and during SS grid step; hide it
  // during SS bonus step so the player focuses on the bonus pick.
  const showGrid = tier === 'S' || step === 'grid';
  const showBonus = tier === 'S' || step === 'bonus';

  const handleGridPick = (slot: number) => {
    if (gridLocked) return;
    const target = grid[slot];
    if (!target || isJoker(target)) return;
    const rolled: Supercharge = Math.random() < 0.5 ? 'wild' : 'double';
    setGridSlot(slot);
    setGridSc(rolled);
    // Match the sound the Three Tricks specials play when they apply
    // the same supercharge, so the audio cue for "wild" and "double"
    // is consistent across both modes.
    playSound(rolled === 'wild' ? 'sparkle' : 'thud');
  };

  const handleBonusPick = (i: number) => {
    if (bonusLocked || blockedIdx(i)) return;
    setBonusIdx(i);
  };

  const handlePrimary = () => {
    if (tier === 'SS' && step === 'grid' && gridLocked) {
      setStep('bonus');
      return;
    }
    onComplete({
      gridSlot: gridLocked ? gridSlot! : undefined,
      gridSupercharge: gridLocked ? gridSc! : undefined,
      bonusIdx: bonusLocked ? bonusIdx! : undefined,
      bonusCard: bonusLocked ? poweredCards[bonusIdx!] : undefined,
    });
  };

  // Compute the grid-for-display so the rolled supercharge actually
  // renders on the picked card (suit glyph → ✦ or +×2 badge). Done
  // here rather than passing the raw grid so ResultScreen never has
  // to know about the supercharge state.
  const displayGrid: Grid =
    gridLocked && gridSc !== null
      ? grid.map((c, i) => {
          if (i !== gridSlot || !c || isJoker(c)) return c;
          return { ...c, supercharge: gridSc } as Card;
        })
      : grid;

  // Primary button label varies by tier + state. SS step 1 → "Next
  // reward →" once grid done; SS step 2 / S → "Done" once a pick
  // lands.
  const primaryLabel =
    tier === 'SS' && step === 'grid'
      ? gridLocked ? 'Next reward →' : 'Tap a grid card'
      : canFinish
      ? 'Done'
      : tier === 'S'
      ? 'Tap a card to choose'
      : 'Tap a bonus card';

  const tappableSlots = new Set(
    grid
      .map((c, i) => (c && !isJoker(c) ? i : -1))
      .filter(i => i >= 0)
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>
              {tier === 'SS'
                ? step === 'grid'
                  ? '· Reward 1 of 2 ·'
                  : '· Reward 2 of 2 ·'
                : '· S-Tier Reward ·'}
            </Text>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>
            {tier === 'S'
              ? 'Pick a card to supercharge'
              : step === 'grid'
              ? 'Pick a grid card to supercharge'
              : 'Pick a bonus card to supercharge'}
          </Text>

          <ScrollView style={styles.scroll}>
            {showGrid && (
              <View style={styles.section}>
                {tier === 'S' && (
                  <Text style={styles.sectionLabel}>Grid</Text>
                )}
                <GridView
                  grid={displayGrid}
                  onSlotPress={gridLocked ? undefined : handleGridPick}
                  highlight={gridLocked ? undefined : tappableSlots}
                  compact
                />
                {gridLocked && gridSc !== null && (
                  <SuperchargeReveal supercharge={gridSc} />
                )}
              </View>
            )}

            {showBonus && (
              <View style={styles.section}>
                {tier === 'S' && (
                  <Text style={styles.sectionLabel}>Bonus cards</Text>
                )}
                {bonusUnavailable ? (
                  <Text style={styles.unavailableNote}>
                    {poweredCards.length === 0
                      ? 'No bonus cards in hand — nothing to supercharge this round.'
                      : 'Every held card matches last round\'s pick — none can be supercharged again. Pick a grid card instead.'}
                  </Text>
                ) : (
                  <View style={styles.chipRow}>
                    {poweredCards.map((c, i) => (
                      <PickerChip
                        key={i}
                        card={c}
                        selected={bonusIdx === i}
                        dimmed={bonusLocked && bonusIdx !== i}
                        blocked={blockedIdx(i)}
                        onPress={() => handleBonusPick(i)}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.btnRow}>
            <NeonButton
              label={primaryLabel}
              variant="primary"
              size="md"
              disabled={
                !(
                  (tier === 'SS' && step === 'grid' && gridLocked) ||
                  canFinish
                )
              }
              onPress={handlePrimary}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    backgroundColor: colors.bgPanel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.accent, 18, 0.3),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '800',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  scroll: { flexGrow: 0 },
  section: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    alignSelf: 'flex-start',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    minWidth: 96,
    maxWidth: 120,
    backgroundColor: colors.bgGlass,
    shadowOffset: { width: 0, height: 0 },
  },
  chipSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  chipDimmed: {
    opacity: 0.4,
  },
  chipBlocked: {
    opacity: 0.35,
  },
  chipInner: {
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  chipTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowRadius: 2,
    textAlign: 'center',
  },
  chipMult: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  chipWas: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    fontStyle: 'italic',
    marginTop: 2,
  },
  chipBlockedTag: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: 2,
  },
  reveal: {
    color: colors.joker,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: colors.joker,
    textShadowRadius: 3,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  unavailableNote: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
