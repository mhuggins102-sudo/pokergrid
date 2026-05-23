import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Card, Rank, StandardCard, Suit } from '../../game/cards';
import { Grid } from '../../game/grid';
import { scoreGrid, HAND_BASE_VALUE } from '../../game/scoring';
import {
  ANIM_DURATION,
  AnimationLayer,
  AnimSpec,
  hiddenSlotsFor,
} from '../components/AnimationLayer';
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

// ---- Helpers --------------------------------------------------------------

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });
const JOKER: Card = { kind: 'joker' };
const emptyGrid = (): Grid => Array.from({ length: 25 }, () => null);
const gridWith = (pairs: Array<[number, Card]>): Grid => {
  const g = emptyGrid();
  for (const [s, c] of pairs) g[s] = c;
  return g;
};

// Interactive demo: GridView + AnimationLayer + a Play button. Tap Play to
// replay the animation; the grid ends in the after-anim state so the user
// can see the result; tap again to reset and replay.
const DemoGrid = ({
  initialGrid,
  animSpec,
  afterAnim,
  highlight,
  selected,
}: {
  initialGrid: Grid;
  animSpec: AnimSpec;
  afterAnim: Grid;
  highlight?: Set<number>;
  selected?: number | null;
}) => {
  const [grid, setGrid] = useState<Grid>(initialGrid);
  const [anim, setAnim] = useState<AnimSpec | null>(null);

  const play = () => {
    if (anim) return;
    setGrid(initialGrid);
    setAnim(animSpec);
    setTimeout(() => {
      setAnim(null);
      setGrid(afterAnim);
    }, ANIM_DURATION[animSpec.kind] + 30);
  };

  return (
    <View style={demoStyles.wrap}>
      <View style={demoStyles.gridStack}>
        <GridView
          grid={grid}
          highlight={highlight}
          selected={selected}
          hiddenSlots={hiddenSlotsFor(anim)}
        />
        <AnimationLayer anim={anim} />
      </View>
      <View style={demoStyles.btnRow}>
        <NeonButton
          label={anim ? '▶ Playing…' : '▶ Play'}
          variant="primary"
          size="sm"
          onPress={play}
        />
      </View>
    </View>
  );
};

const Caption = ({ children }: { children: React.ReactNode }) => (
  <Text style={demoStyles.caption}>{children}</Text>
);

// ---- Slide visuals --------------------------------------------------------

const GoalVisual = () => {
  // Empty grid — sets the stage. The big card-back-style title is in the
  // header card above the visual.
  return (
    <View style={demoStyles.wrap}>
      <GridView grid={emptyGrid()} />
      <Caption>
        A 5×5 grid. One card drawn at a time. The deck has 52 cards plus a single joker.
      </Caption>
    </View>
  );
};

const SpiralVisual = () => {
  const initial = gridWith([
    [12, C('A', 'H')], // 1
    [13, C('K', 'C')], // 2
    [18, C('Q', 'D')], // 3
    [17, C('J', 'S')], // 4
    [16, C('10', 'H')], // 5
  ]);
  const after = gridWith([
    [12, C('A', 'H')],
    [13, C('K', 'C')],
    [18, C('Q', 'D')],
    [17, C('J', 'S')],
    [16, C('10', 'H')],
    [11, C('7', 'S')], // 6 — new card lands at slot 6
  ]);
  return (
    <View style={demoStyles.wrap}>
      <DemoGrid
        initialGrid={initial}
        animSpec={{ kind: 'place', card: C('7', 'S'), toSlot: 11 }}
        afterAnim={after}
      />
      <Caption>
        First card lands at the center (R3C3). Subsequent cards spiral clockwise outward — the
        cyan pulse marks the next slot.
      </Caption>
    </View>
  );
};

const SwapVisual = () => {
  const a = C('5', 'H');
  const b = C('K', 'C');
  // Row 3 with the two ends as our swap subjects, middle filled with junk so
  // the line is visually full.
  const initial = gridWith([
    [10, a],
    [11, C('3', 'D')],
    [12, C('8', 'S')],
    [13, C('J', 'D')],
    [14, b],
  ]);
  const after = gridWith([
    [10, b],
    [11, C('3', 'D')],
    [12, C('8', 'S')],
    [13, C('J', 'D')],
    [14, a],
  ]);
  return (
    <View style={demoStyles.wrap}>
      <DemoGrid
        initialGrid={initial}
        animSpec={{ kind: 'swap', cardA: a, slotA: 10, cardB: b, slotB: 14 }}
        afterAnim={after}
        highlight={new Set([10, 14])}
      />
      <Caption>
        Spend a ♥ to trade any two cards sharing a row or column. Useful for fixing a near-miss
        flush or rescuing a stranded joker.
      </Caption>
    </View>
  );
};

const SlideVisual = () => {
  const a = C('A', 'H');
  const b = C('K', 'C');
  const c = C('Q', 'D');
  // Column 4 (col index 3) with R2/R3/R4 filled, R1 empty.
  const initial = gridWith([
    [8, a],  // R2C4
    [13, b], // R3C4
    [18, c], // R4C4
  ]);
  const after = gridWith([
    [3, a],  // R1C4
    [8, b],  // R2C4
    [13, c], // R3C4
  ]);
  return (
    <View style={demoStyles.wrap}>
      <DemoGrid
        initialGrid={initial}
        animSpec={{
          kind: 'slide',
          cards: [
            { card: a, from: 8, to: 3 },
            { card: b, from: 13, to: 8 },
            { card: c, from: 18, to: 13 },
          ],
        }}
        afterAnim={after}
        selected={18}
        highlight={new Set([3])}
      />
      <Caption>
        Tap the back of the chain (R4 here) — every card in front slides together. Tap a
        different card to slide a shorter chain, or drag in any direction for the same result.
      </Caption>
    </View>
  );
};

const DestroyVisual = () => {
  const target = C('K', 'C');
  const initial = gridWith([
    [12, target],
    [11, C('5', 'C')],
    [13, C('A', 'H')],
  ]);
  const after = gridWith([
    [11, C('5', 'C')],
    [13, C('A', 'H')],
  ]);
  return (
    <View style={demoStyles.wrap}>
      <DemoGrid
        initialGrid={initial}
        animSpec={{ kind: 'destroy', card: target, slot: 12 }}
        afterAnim={after}
        highlight={new Set([12])}
      />
      <Caption>
        ♦ trashes any one card. Use sparingly — a slot left empty at game end costs{' '}
        <Text style={{ color: colors.danger }}>−25</Text> for the row AND another{' '}
        <Text style={{ color: colors.danger }}>−25</Text> for the column.
      </Caption>
    </View>
  );
};

const BonusVisual = () => (
  <View style={demoStyles.wrap}>
    <Text style={demoStyles.subsection}>Three categories</Text>
    <View style={demoStyles.bonusRow}>
      <View style={[demoStyles.bonusChip, glow(colors.warn, 8, 0.45)]}>
        <Text style={demoStyles.bonusName}>Pair ×4</Text>
        <Text style={demoStyles.bonusDesc}>Multiplies every line scoring a Pair.</Text>
      </View>
      <View style={[demoStyles.bonusChip, glow(colors.warn, 8, 0.45)]}>
        <Text style={demoStyles.bonusName}>Row 3 ×2</Text>
        <Text style={demoStyles.bonusDesc}>Multiplies row 3's total by 2.</Text>
      </View>
      <View style={[demoStyles.bonusChip, glow(colors.warn, 8, 0.45)]}>
        <Text style={demoStyles.bonusName}>×1.05 / deck card</Text>
        <Text style={demoStyles.bonusDesc}>Compounds 1.05 per deck card remaining at game end.</Text>
      </View>
    </View>
    <Caption>
      The bonus deck has 35 unique cards. ♣ Bonus draws 2 and lets you keep 1. You can hold up
      to 3; at the cap, ♣ forces a swap.
    </Caption>
    <Text style={demoStyles.subsection}>What kinds?</Text>
    <View style={demoStyles.kindList}>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Hand-type</Text> — multiplies lines scoring a
        specific hand (Pair, Straight, Flush, …).
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Row / Column</Text> — multiplies a specific line.
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Per-line conditional</Text> — Rainbow (4+ suits),
        Joker line, Royal touch (Ace in line), Spiral core (R3 + C3).
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Per-suit density</Text> — ×1.1 per card of a
        suit in the line.
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Grid achievements</Text> — multiply the final
        total: clean border, monochrome border, rainbow corners, cozy joker.
      </Text>
    </View>
  </View>
);

const JokerVisual = () => {
  // Joker at slot 12 (R3C3). Row 3 has hearts at four positions (joker acts as
  // the missing heart for a flush). Column 3 has consecutive ranks (joker fills
  // the gap for a straight).
  const grid = gridWith([
    [10, C('3', 'H')], [11, C('7', 'H')], [12, JOKER], [13, C('J', 'H')], [14, C('A', 'H')],
    [2, C('5', 'D')],
    [7, C('6', 'S')],
    [17, C('8', 'C')],
    [22, C('9', 'D')],
  ]);
  return (
    <View style={demoStyles.wrap}>
      <GridView grid={grid} highlight={new Set([12])} />
      <Caption>
        The joker is auto-placed and acts as a <Text style={{ color: colors.joker }}>wild</Text>{' '}
        in its row AND its column — independently. Here it completes the Flush of ♥ across row
        3 AND the Straight 5-6-7-8-9 down column 3.
      </Caption>
    </View>
  );
};

const ScoringLinesVisual = () => {
  // Full grid where row 0 is a Flush of ♥ and other lines vary.
  const grid = gridWith([
    [0,  C('A', 'H')], [1,  C('5', 'H')], [2,  C('8', 'H')], [3,  C('J', 'H')], [4,  C('K', 'H')],
    [5,  C('A', 'C')], [6,  C('2', 'D')], [7,  C('3', 'S')], [8,  C('6', 'C')], [9,  C('Q', 'S')],
    [10, C('4', 'D')], [11, C('9', 'C')], [12, C('5', 'D')], [13, C('7', 'S')], [14, C('10','D')],
    [15, C('3', 'C')], [16, C('K', 'D')], [17, C('Q', 'C')], [18, C('2', 'S')], [19, C('9', 'H')],
    [20, C('8', 'D')], [21, C('J', 'D')], [22, C('4', 'S')], [23, C('10','S')], [24, C('6', 'D')],
  ]);
  const report = useMemo(() => scoreGrid(grid, []), [grid]);
  return (
    <View style={demoStyles.wrap}>
      <GridView grid={grid} />
      <Text style={demoStyles.subsection}>Per-line breakdown</Text>
      <View style={demoStyles.scoreList}>
        {report.lines.map(l => {
          const label = l.kind === 'row' ? `R${l.index + 1}` : `C${l.index + 1}`;
          const handLabel = l.hand
            ? l.hand.replace(/_/g, ' ').toLowerCase()
            : 'incomplete';
          const valueClr = l.total > 0 ? colors.success : l.total < 0 ? colors.danger : colors.textLow;
          return (
            <View key={`${l.kind}-${l.index}`} style={demoStyles.scoreRow}>
              <Text style={demoStyles.scoreLabel}>{label}</Text>
              <Text style={demoStyles.scoreHand}>{handLabel}</Text>
              <Text style={[demoStyles.scoreValue, { color: valueClr }]}>{l.total}</Text>
            </View>
          );
        })}
        <View style={demoStyles.scoreTotal}>
          <Text style={demoStyles.scoreTotalLabel}>Subtotal</Text>
          <Text style={demoStyles.scoreTotalValue}>{report.subtotal}</Text>
        </View>
      </View>
      <Caption>
        Every row and every column scores its best 5-card hand. The values from each line are
        added together; grid achievements multiply the result.
      </Caption>
    </View>
  );
};

const HandValuesVisual = () => {
  const order: { rank: keyof typeof HAND_BASE_VALUE; name: string }[] = [
    { rank: 'PAIR', name: 'Pair' },
    { rank: 'TWO_PAIR', name: 'Two Pair' },
    { rank: 'THREE_OF_A_KIND', name: 'Three of a Kind' },
    { rank: 'STRAIGHT', name: 'Straight' },
    { rank: 'FLUSH', name: 'Flush' },
    { rank: 'FULL_HOUSE', name: 'Full House' },
    { rank: 'FOUR_OF_A_KIND', name: 'Four of a Kind' },
    { rank: 'STRAIGHT_FLUSH', name: 'Straight Flush' },
    { rank: 'ROYAL_FLUSH', name: 'Royal Flush' },
    { rank: 'FIVE_OF_A_KIND', name: 'Five of a Kind' },
  ];
  return (
    <View style={demoStyles.wrap}>
      <View style={demoStyles.valuesBlock}>
        {order.map(h => (
          <View key={h.rank} style={demoStyles.valuesRow}>
            <Text style={demoStyles.valuesName}>{h.name}</Text>
            <Text style={demoStyles.valuesValue}>{HAND_BASE_VALUE[h.rank]}</Text>
          </View>
        ))}
      </View>
      <Caption>
        High Card scores 0 — only Pair and above pay out. Five of a Kind is the apex (only
        possible when the joker shares a line with quads).
      </Caption>
    </View>
  );
};

const MultiplierMathVisual = () => {
  // A pair on row 3: 5♥ 5♠ 2♣ 8♦ 10♣. Show pair=5, ×Pair-4 = 20, ×Row3-2 = 40.
  const cards: Card[] = [C('5', 'H'), C('5', 'S'), C('2', 'C'), C('8', 'D'), C('10', 'C')];
  return (
    <View style={demoStyles.wrap}>
      <Text style={demoStyles.subsection}>Row 3 (with these two cards held)</Text>
      <View style={demoStyles.lineRow}>
        {cards.map((c, i) => (
          <View key={i} style={{ marginHorizontal: 1 }}>
            <CardTile card={c} size="sm" />
          </View>
        ))}
      </View>
      <View style={demoStyles.mathBlock}>
        <View style={demoStyles.mathRow}>
          <Text style={demoStyles.mathLabel}>Base · Pair</Text>
          <Text style={demoStyles.mathValue}>5</Text>
        </View>
        <View style={demoStyles.mathRow}>
          <Text style={demoStyles.mathLabel}>× Pair ×4</Text>
          <Text style={demoStyles.mathValue}>= 20</Text>
        </View>
        <View style={demoStyles.mathRow}>
          <Text style={demoStyles.mathLabel}>× Row 3 ×2</Text>
          <Text style={demoStyles.mathValue}>= 40</Text>
        </View>
        <View style={demoStyles.mathTotal}>
          <Text style={demoStyles.mathTotalLabel}>Line score</Text>
          <Text style={demoStyles.mathTotalValue}>40</Text>
        </View>
      </View>
      <Caption>
        Multipliers compose <Text style={{ color: colors.success }}>multiplicatively</Text>.
        Three ×2s on the same line = ×8, not ×6. Hand-type multipliers for Straight and above
        are capped at ×1.5; row/column and other cards can still push higher.
      </Caption>
    </View>
  );
};

const AchievementsVisual = () => {
  // Grid with NO face cards on the border — clean border ×1.2 satisfied.
  const grid = gridWith([
    [0, C('2', 'H')], [1, C('5', 'C')], [2, C('7', 'D')], [3, C('8', 'S')], [4, C('10', 'H')],
    [5, C('A', 'H')], [9, C('3', 'C')],
    [10, C('A', 'C')], [14, C('4', 'D')],
    [15, C('A', 'D')], [19, C('5', 'H')],
    [20, C('2', 'C')], [21, C('6', 'H')], [22, C('9', 'D')], [23, C('10', 'C')], [24, C('7', 'S')],
    // Inner some misc
    [6, C('3', 'D')], [7, C('4', 'H')], [8, C('6', 'S')],
    [11, C('K', 'S')], [12, JOKER], [13, C('J', 'C')],
    [16, C('K', 'H')], [17, C('Q', 'S')], [18, C('Q', 'D')],
  ]);
  return (
    <View style={demoStyles.wrap}>
      <GridView grid={grid} />
      <Caption>
        Eight grid-wide cards multiply the final total. Some reward grid shape —{' '}
        <Text style={{ color: colors.success }}>Clean border ×1.5</Text> (no face cards on the
        perimeter — satisfied above),{' '}
        <Text style={{ color: colors.success }}>Monochrome border ×1.5</Text>,{' '}
        <Text style={{ color: colors.success }}>Rainbow corners ×1.25</Text>,{' '}
        <Text style={{ color: colors.success }}>Cozy joker ×1.15</Text>. Others reward
        restraint — <Text style={{ color: colors.success }}>No Flushes ×1.25</Text>,{' '}
        <Text style={{ color: colors.success }}>No Straights ×1.25</Text>,{' '}
        <Text style={{ color: colors.success }}>Trash Joker ×1.25</Text>. And{' '}
        <Text style={{ color: colors.warn }}>×1.05 / deck card</Text> compounds with cards
        left in the deck.
      </Caption>
    </View>
  );
};

const PenaltyVisual = () => {
  // Full grid except for one slot — the penalty kicks in on both the row and the column.
  const grid = gridWith([
    [0,  C('A', 'H')], [1,  C('5', 'H')], [2,  C('8', 'H')], [3,  C('J', 'H')], [4,  C('K', 'H')],
    [5,  C('A', 'C')], [6,  C('2', 'D')], [7,  C('3', 'S')], [8,  C('6', 'C')], [9,  C('Q', 'S')],
    [10, C('4', 'D')],                    [12, C('5', 'D')], [13, C('7', 'S')], [14, C('10','D')],
    [15, C('3', 'C')], [16, C('K', 'D')], [17, C('Q', 'C')], [18, C('2', 'S')], [19, C('9', 'H')],
    [20, C('8', 'D')], [21, C('J', 'D')], [22, C('4', 'S')], [23, C('10','S')], [24, C('6', 'D')],
  ]);
  return (
    <View style={demoStyles.wrap}>
      <GridView grid={grid} highlight={new Set([11])} />
      <Caption>
        Slot 11 is empty at game end. Row 2 has 4 cards — <Text style={{ color: colors.danger }}>
        −25</Text>. Column 2 has 4 cards — another <Text style={{ color: colors.danger }}>−25</Text>.
        Total cost: 50. Trash freely, but think twice about destroys you can't refill.
      </Caption>
    </View>
  );
};

const TipsVisual = () => (
  <View style={demoStyles.wrap}>
    {[
      'Tap any row / column label to preview a line\'s hand and value mid-game.',
      'Suit-perk buttons hide when they have no legal target — useful as a hint.',
      'The joker is wild in row AND column independently. It can complete a Flush one way and a Straight the other.',
      'The live score assumes you\'ll fill every line. Anything blank at game end costs 25.',
      'Bonus card multipliers stack multiplicatively — three ×2s = ×8, not ×6.',
      '♦ Destroy is powerful but expensive: every empty slot it leaves costs both a row and a column at end.',
    ].map((t, i) => (
      <View key={i} style={demoStyles.tipRow}>
        <Text style={demoStyles.tipBullet}>·</Text>
        <Text style={demoStyles.tipText}>{t}</Text>
      </View>
    ))}
  </View>
);

// ---- Slides ---------------------------------------------------------------

interface Slide {
  kicker: string;
  title: string;
  copy: string;
  accent: string;
  Visual: React.ComponentType;
}

const STEPS: Slide[] = [
  {
    kicker: '01 · GOAL',
    title: 'Beat your target',
    copy: '5×5 poker solitaire. Place every drawn card on the grid; at game end, score the 5 rows and 5 columns as poker hands. Easy is 200, Medium 300, Hard 400.',
    accent: colors.accent,
    Visual: GoalVisual,
  },
  {
    kicker: '02 · PLACE',
    title: 'A spiral from the center',
    copy: 'Each turn you can place the drawn card, trash it, or spend it on its suit perk. Placing puts it in the next spiral slot — center first, then clockwise outward. The cyan-pulsing slot marks where the next card lands.',
    accent: colors.accent,
    Visual: SpiralVisual,
  },
  {
    kicker: '03 · ♥ SWAP',
    title: 'Hearts trade two cards',
    copy: 'Spend a heart to swap any two cards that share a row or a column. The heart goes to trash. Use it to rebuild a near-miss flush or move the joker.',
    accent: colors.suitH,
    Visual: SwapVisual,
  },
  {
    kicker: '04 · ♠ SLIDE',
    title: 'Spades slide a chain',
    copy: 'Pick a card; the cards in front slide together. The chain is the selected card plus every contiguous card in front of it. Drag a card in a direction for the same result.',
    accent: colors.suitS,
    Visual: SlideVisual,
  },
  {
    kicker: '05 · ♦ DESTROY',
    title: 'Diamonds blow it up',
    copy: 'Trash any one card on the grid — even the joker. Both the diamond AND the targeted card go to trash. Powerful but expensive: empty slots cost points at game end.',
    accent: colors.suitD,
    Visual: DestroyVisual,
  },
  {
    kicker: '06 · ♣ BONUS',
    title: 'Clubs draw bonus cards',
    copy: 'Spend a club to draw 2 from the bonus deck and keep 1. You can hold up to 3. At the cap, a ♣ forces a swap — the discarded one is gone for good.',
    accent: colors.suitC,
    Visual: BonusVisual,
  },
  {
    kicker: '07 · THE JOKER',
    title: 'The joker is wild',
    copy: "There's exactly one joker in the deck. It can't be trashed and auto-places into the next spiral slot. On the grid it takes whatever rank and suit make the best hand — independently for its row and its column.",
    accent: colors.joker,
    Visual: JokerVisual,
  },
  {
    kicker: '08 · SCORING',
    title: 'Every line scores',
    copy: 'At game end, each row and column is scored as a 5-card poker hand — its best one. Below is a sample grid with the per-line breakdown computed for real.',
    accent: colors.success,
    Visual: ScoringLinesVisual,
  },
  {
    kicker: '09 · HAND VALUES',
    title: 'What each hand pays',
    copy: 'Base values for each poker hand. Bonuses can multiply these; an unbonused Pair on a line is 5 points, a Royal Flush is 120.',
    accent: colors.success,
    Visual: HandValuesVisual,
  },
  {
    kicker: '10 · MULTIPLIERS',
    title: 'Bonuses stack multiplicatively',
    copy: "Active bonus cards multiply your line scores. Two ×2 cards on one line is ×4, not ×3. Here's a worked example.",
    accent: colors.warn,
    Visual: MultiplierMathVisual,
  },
  {
    kicker: '11 · ACHIEVEMENTS',
    title: 'Grid-wide multipliers',
    copy: 'Some bonus cards multiply your whole final score, not individual lines. They reward arranging the grid in specific shapes.',
    accent: colors.success,
    Visual: AchievementsVisual,
  },
  {
    kicker: '12 · PENALTY',
    title: 'Empty slots cost points',
    copy: 'Any line with fewer than 5 cards at game end scores -25 instead of 0. An empty slot is in both a row and a column — so one missing card is -50 net.',
    accent: colors.danger,
    Visual: PenaltyVisual,
  },
  {
    kicker: '13 · TIPS',
    title: 'Habits that help',
    copy: 'A few small things worth knowing.',
    accent: colors.warn,
    Visual: TipsVisual,
  },
];

interface Props {
  onDone: () => void;
}

export const TutorialScreen = ({ onDone }: Props) => {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;
  const Visual = step.Visual;

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
          <Visual />
        </Animated.View>
      </ScrollView>

      <View style={styles.actions}>
        <NeonButton
          label="Done"
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
    gap: 3,
    justifyContent: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },
  dot: {
    width: 18,
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

const demoStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    width: '100%',
  },
  gridStack: { position: 'relative' },
  btnRow: {
    marginTop: spacing.md,
  },
  caption: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  subsection: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  bonusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  bonusChip: {
    flex: 1,
    maxWidth: 110,
    backgroundColor: colors.bgGlass,
    borderColor: colors.warn,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bonusName: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    color: colors.warn,
    letterSpacing: 0.5,
  },
  bonusDesc: {
    fontFamily: fonts.sans,
    fontSize: 9,
    color: colors.textMid,
    marginTop: 3,
    lineHeight: 13,
  },
  kindList: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    width: '100%',
  },
  kindLine: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  scoreList: {
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  scoreLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    width: 36,
    letterSpacing: 1,
  },
  scoreHand: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    flex: 1,
    textTransform: 'capitalize',
  },
  scoreValue: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
  scoreTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
  },
  scoreTotalLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  scoreTotalValue: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  valuesBlock: {
    width: '100%',
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  valuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
  },
  valuesName: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  valuesValue: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  lineRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: spacing.xs,
  },
  mathBlock: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  mathLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  mathValue: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  mathTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopColor: colors.outlineSoft,
    borderTopWidth: 1,
  },
  mathTotalLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  mathTotalValue: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: colors.success,
    textShadowRadius: 6,
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
});
