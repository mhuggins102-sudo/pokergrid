import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Card, Rank, StandardCard, Suit } from '../../game/cards';
import { Grid, SPIRAL_POSITION } from '../../game/grid';
import { CardTile } from '../components/CardTile';
import { GridView } from '../components/GridView';
import { NeonButton } from '../components/NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

const TUTORIAL_SEEN_KEY = 'pokergrid:tutorial-seen:v1';

export const markTutorialSeen = () =>
  AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});

export const tutorialSeen = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
    return v === '1';
  } catch {
    return false;
  }
};

// Sample cards for the tutorial mini-grids — kept here so each slide can
// illustrate the rule it's teaching.
const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });
const emptyGrid = (): Grid => Array.from({ length: 25 }, () => null);

const gridWith = (pairs: Array<[number, Card]>): Grid => {
  const g = emptyGrid();
  for (const [s, c] of pairs) g[s] = c;
  return g;
};

// ============================================================================
// Slide content
// ============================================================================

interface Slide {
  kicker: string;
  title: string;
  copy: string;
  accent: string;
  visual: React.ReactNode;
}

const slotsForRow = (r: number): number[] => [r * 5, r * 5 + 1, r * 5 + 2, r * 5 + 3, r * 5 + 4];

const SpiralVisual = () => {
  // Show the first 5 cards filled to illustrate the spiral.
  const grid = gridWith([
    [12, C('A', 'H')], // 1
    [13, C('K', 'C')], // 2
    [18, C('Q', 'D')], // 3
    [17, C('J', 'S')], // 4
    [16, C('10', 'H')], // 5
  ]);
  return (
    <View style={styles.visualWrap}>
      <GridView grid={grid} nextSlotHint={11} />
      <Text style={styles.visualCaption}>
        First 5 cards land 1→5 in the center spiral.{' '}
        <Text style={{ color: colors.accent }}>Slot 6</Text> is next.
      </Text>
    </View>
  );
};

const SwapVisual = () => {
  const grid = gridWith([
    [10, C('A', 'H')], // R3C1
    [11, C('5', 'C')],
    [12, C('K', 'D')],
    [13, C('9', 'S')],
    [14, C('2', 'H')], // R3C5
  ]);
  return (
    <View style={styles.visualWrap}>
      <GridView grid={grid} highlight={new Set([10, 14])} />
      <Text style={styles.visualCaption}>
        Swap any two cards that share a row or column. Here the{' '}
        <Text style={{ color: colors.suitH }}>A♥</Text> and{' '}
        <Text style={{ color: colors.suitH }}>2♥</Text> trade places along row 3.
      </Text>
    </View>
  );
};

const SlideVisual = () => {
  const grid = gridWith([
    [8, C('A', 'H')],   // R2C4
    [13, C('K', 'C')],  // R3C4
    [18, C('Q', 'D')],  // R4C4
    [23, C('J', 'S')],  // R5C4
  ]);
  return (
    <View style={styles.visualWrap}>
      <GridView grid={grid} highlight={new Set([3])} selected={23} />
      <Text style={styles.visualCaption}>
        Tap a card — the cards in front of it slide together. Tapping{' '}
        <Text style={{ color: colors.suitS }}>R5C4</Text> here would slide all four cards up one,
        landing the J♠ at R4 and pushing the column into R1–R4.
      </Text>
    </View>
  );
};

const DestroyVisual = () => {
  const grid = gridWith([
    [12, C('A', 'H')],
    [11, C('5', 'C')],
    [13, C('K', 'D')],
  ]);
  return (
    <View style={styles.visualWrap}>
      <GridView grid={grid} highlight={new Set([12])} />
      <Text style={styles.visualCaption}>
        Spend a ♦ to trash any one card on the grid — even the joker.
      </Text>
    </View>
  );
};

const BonusVisual = () => (
  <View style={styles.visualWrap}>
    <View style={styles.bonusVisualRow}>
      <View style={[styles.bonusCard, glow(colors.warn, 8, 0.5)]}>
        <Text style={styles.bonusCardName}>Pair ×4</Text>
        <Text style={styles.bonusCardDesc}>Lines that score a Pair are multiplied by 4.</Text>
      </View>
      <View style={[styles.bonusCard, glow(colors.warn, 8, 0.5)]}>
        <Text style={styles.bonusCardName}>Row 3 ×2</Text>
        <Text style={styles.bonusCardDesc}>Row 3's score is multiplied by 2.</Text>
      </View>
      <View style={[styles.bonusCard, glow(colors.warn, 8, 0.5)]}>
        <Text style={styles.bonusCardName}>+10 / deck</Text>
        <Text style={styles.bonusCardDesc}>+10 flat per card left in the deck at game end.</Text>
      </View>
    </View>
    <Text style={styles.visualCaption}>
      Hold up to 3. Multipliers stack <Text style={{ color: colors.success }}>multiplicatively</Text>
       — a Pair on Row 3 with both cards above scores ×8.
    </Text>
  </View>
);

const ScoringVisual = () => {
  // Complete grid with a recognizable shape: row 0 = flush hearts, col 0 = pair of As.
  const grid = gridWith([
    [0,  C('A', 'H')], [1,  C('5', 'H')], [2,  C('8', 'H')], [3,  C('J', 'H')], [4,  C('K', 'H')],
    [5,  C('A', 'C')], [6,  C('2', 'D')], [7,  C('3', 'S')], [8,  C('6', 'C')], [9,  C('Q', 'S')],
    [10, C('4', 'D')], [11, C('9', 'C')], [12, C('5', 'D')], [13, C('7', 'S')], [14, C('10','D')],
    [15, C('3', 'C')], [16, C('K', 'D')], [17, C('Q', 'C')], [18, C('2', 'S')], [19, C('9', 'H')],
    [20, C('8', 'D')], [21, C('J', 'D')], [22, C('4', 'S')], [23, C('10','S')], [24, C('6', 'D')],
  ]);
  return (
    <View style={styles.visualWrap}>
      <GridView grid={grid} />
      <Text style={styles.visualCaption}>
        Score 5 rows + 5 columns as poker hands. Row 1 is a{' '}
        <Text style={{ color: colors.success }}>Flush of ♥</Text>; columns mostly score
        High Card. Incomplete lines (under 5 cards) cost{' '}
        <Text style={{ color: colors.danger }}>−25</Text> each.
      </Text>
    </View>
  );
};

const TipsVisual = () => (
  <View style={styles.visualWrap}>
    <View style={styles.tipRow}>
      <Text style={styles.tipBullet}>·</Text>
      <Text style={styles.tipText}>Tap row / column labels to preview a line's score mid-game.</Text>
    </View>
    <View style={styles.tipRow}>
      <Text style={styles.tipBullet}>·</Text>
      <Text style={styles.tipText}>
        Suit perks are hidden when they have no legal target. Trash a card for nothing if you
        want to thin the deck.
      </Text>
    </View>
    <View style={styles.tipRow}>
      <Text style={styles.tipBullet}>·</Text>
      <Text style={styles.tipText}>
        The joker is auto-placed and is a wild in its row and column — it can finish a flush in
        one direction and a straight in the other simultaneously.
      </Text>
    </View>
    <View style={styles.tipRow}>
      <Text style={styles.tipBullet}>·</Text>
      <Text style={styles.tipText}>
        Watch the live score: it assumes you'll fill every line. Empty lines at game end cost
        25 each.
      </Text>
    </View>
  </View>
);

const STEPS: Slide[] = [
  {
    kicker: '01 · PLACE',
    title: 'A spiral from the center',
    copy: 'Each turn you draw one card. Place it and it lands in the next spiral slot — center first, then clockwise outward. The cyan-pulsing slot shows where the next card goes.',
    accent: colors.accent,
    visual: <SpiralVisual />,
  },
  {
    kicker: '02 · ♥ SWAP',
    title: 'Hearts swap two cards',
    copy: 'Trade any two cards on the grid that share a row or a column. The heart you spent goes to trash. Use it to fix a near-miss flush or relocate the joker.',
    accent: colors.suitH,
    visual: <SwapVisual />,
  },
  {
    kicker: '03 · ♠ SLIDE',
    title: 'Spades slide a chain',
    copy: 'Pick a card and a direction. That card plus every card in front of it slides together, up to a wall or another card. Pick the chain by tapping the back-most card you want moved.',
    accent: colors.suitS,
    visual: <SlideVisual />,
  },
  {
    kicker: '04 · ♦ DESTROY',
    title: 'Diamonds blow it up',
    copy: 'Trash any one card on the grid — even the joker. The diamond itself is also trashed. Use sparingly: empty slots at game end cost 25 each if you can\'t refill them.',
    accent: colors.suitD,
    visual: <DestroyVisual />,
  },
  {
    kicker: '05 · ♣ BONUS',
    title: 'Clubs draw bonus cards',
    copy: 'Spend a club to draw 2 from the bonus deck and keep one. Hold up to 3. At the cap you must swap one out. Bonus multipliers stack — and they stack MULTIPLICATIVELY.',
    accent: colors.suitC,
    visual: <BonusVisual />,
  },
  {
    kicker: '06 · SCORE',
    title: 'Five rows, five columns',
    copy: 'At the end, every row and every column scores its best poker hand. Bonuses multiply lines; grid achievements (clean border, rainbow corners, cozy joker) multiply the total.',
    accent: colors.success,
    visual: <ScoringVisual />,
  },
  {
    kicker: '07 · TIPS',
    title: 'Things worth knowing',
    copy: 'A few habits that help most runs.',
    accent: colors.warn,
    visual: <TipsVisual />,
  },
];

interface Props {
  onDone: () => void;
}

export const TutorialScreen = ({ onDone }: Props) => {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  const finish = () => {
    markTutorialSeen();
    onDone();
  };

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        {STEPS.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx === i && { backgroundColor: step.accent, ...glow(step.accent, 6, 0.7) },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          key={i}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.card,
            { borderColor: step.accent },
            glow(step.accent, 14, 0.35),
          ]}
        >
          <Text style={[styles.kicker, { color: step.accent, textShadowColor: step.accent }]}>
            {step.kicker}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.copy}>{step.copy}</Text>
        </Animated.View>

        <Animated.View
          key={`v-${i}`}
          entering={FadeIn.duration(260).delay(60)}
          exiting={FadeOut.duration(100)}
        >
          {step.visual}
        </Animated.View>
      </ScrollView>

      <View style={styles.actions}>
        <NeonButton
          label="Skip"
          variant="ghost"
          size="sm"
          onPress={finish}
        />
        <View style={styles.spacer} />
        {i > 0 && (
          <NeonButton
            label="Back"
            variant="secondary"
            size="md"
            onPress={() => setI(i - 1)}
          />
        )}
        <NeonButton
          label={isLast ? 'Got it' : 'Next'}
          variant="primary"
          size="md"
          onPress={isLast ? finish : () => setI(i + 1)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  dot: {
    width: 22,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgRaised,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textShadowRadius: 6,
  },
  title: {
    fontFamily: fonts.mono,
    color: colors.textHi,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  copy: {
    fontFamily: fonts.sans,
    color: colors.textMid,
    fontSize: 13,
    lineHeight: 20,
  },
  visualWrap: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  visualCaption: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  bonusVisualRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  bonusCard: {
    flex: 1,
    maxWidth: 110,
    backgroundColor: colors.bgGlass,
    borderColor: colors.warn,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bonusCardName: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    color: colors.warn,
    letterSpacing: 0.5,
  },
  bonusCardDesc: {
    fontFamily: fonts.sans,
    fontSize: 9,
    color: colors.textMid,
    marginTop: 3,
    lineHeight: 13,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  tipBullet: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  tipText: {
    flex: 1,
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.outlineSoft,
  },
  spacer: { flex: 1 },
});
