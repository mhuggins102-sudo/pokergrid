import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Card, Rank, StandardCard, Suit } from '../../game/cards';
import { BONUS_DECK_POOL } from '../../game/bonusCards';
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
import { SoundKey, useSound } from '../sound';
import { colors, fonts, glow, radius, spacing } from '../theme';
import { BonusCardsScreen } from './BonusCardsScreen';

const TUTORIAL_SEEN_KEY = 'pokergrid:tutorial-seen:v1';

export const markTutorialSeen = () =>
  AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});

// Re-arm the first-run Rules popup so it shows again on next launch. Used by
// Settings → "Replay tutorial" so a player who skipped onboarding can get it
// back the same way a first-time player sees it.
export const clearTutorialSeen = () =>
  AsyncStorage.removeItem(TUTORIAL_SEEN_KEY).catch(() => {});

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
  sound,
}: {
  initialGrid: Grid;
  animSpec: AnimSpec;
  afterAnim: Grid;
  highlight?: Set<number>;
  selected?: number | null;
  // Fires when the player taps Play, in sync with the animation start. Use
  // the SoundKey that matches the in-game action so the tutorial feels like
  // the real thing.
  sound?: SoundKey;
}) => {
  const [grid, setGrid] = useState<Grid>(initialGrid);
  const [anim, setAnim] = useState<AnimSpec | null>(null);
  const playSound = useSound();

  const play = () => {
    if (anim) return;
    setGrid(initialGrid);
    setAnim(animSpec);
    if (sound) playSound(sound);
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
        A 5×5 grid. One card drawn at a time. The deck has 52 standard cards plus 0–2 jokers, depending on difficulty.
      </Caption>
    </View>
  );
};

// Sequential spiral placement: empty grid → press Play → first card lands in
// the center, then the next, then the next… settles after 6 cards. Each step
// uses the existing place anim so it matches the in-game feel.
const SPIRAL_DEMO: Array<{ slot: number; card: Card }> = [
  { slot: 12, card: C('A', 'H') },
  { slot: 13, card: C('K', 'C') },
  { slot: 18, card: C('Q', 'D') },
  { slot: 17, card: C('J', 'S') },
  { slot: 16, card: C('10', 'H') },
  { slot: 11, card: C('7', 'D') },
];

const SpiralVisual = () => {
  const [grid, setGrid] = React.useState<Grid>(emptyGrid());
  const [anim, setAnim] = React.useState<AnimSpec | null>(null);
  const [nextHint, setNextHint] = React.useState<number | null>(12);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const playSound = useSound();

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = () => {
    stop();
    setGrid(emptyGrid());
    setAnim(null);
    // Run through the spiral one card at a time, with the place sound on each.
    SPIRAL_DEMO.forEach(({ slot, card }, i) => {
      timers.current.push(
        setTimeout(() => {
          setAnim({ kind: 'place', card, toSlot: slot });
          playSound('place');
          // The cyan pulse should point at the NEXT slot once this one lands.
          const next = SPIRAL_DEMO[i + 1]?.slot ?? null;
          setNextHint(next);
        }, i * (ANIM_DURATION.place + 80))
      );
      timers.current.push(
        setTimeout(() => {
          setGrid(prev => {
            const g = prev.slice();
            g[slot] = card;
            return g;
          });
          setAnim(null);
        }, i * (ANIM_DURATION.place + 80) + ANIM_DURATION.place)
      );
    });
  };

  React.useEffect(() => stop, []);

  return (
    <View style={demoStyles.wrap}>
      <View style={demoStyles.gridStack}>
        <GridView
          grid={grid}
          hiddenSlots={hiddenSlotsFor(anim)}
          nextSlotHint={nextHint}
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
      <Caption>
        Tap Play. Cards drop in a clockwise spiral — center first, then to the right, then down,
        then around. The pulsing cyan ring always marks where the next placed card lands.
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
        sound="swap"
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
        sound="slide"
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
        sound="destroy"
      />
      <Caption>
        ♦ destroys any one card. Use sparingly — a slot left empty at game end costs{' '}
        <Text style={{ color: colors.danger }}>−25</Text> for the row AND another{' '}
        <Text style={{ color: colors.danger }}>−25</Text> for the column.
      </Caption>
    </View>
  );
};

// Tutorial slide 6's "see them all" button — opens the full Bonus Cards
// catalog as a modal so the player stays in the tutorial when they
// close it. Hoisted out of BonusVisual so it can be a stable component.
const BonusVisual: React.FC<TutorialVisualProps> = ({
  onSeeAllBonusCards: onSeeAll,
}) => (
  <View style={demoStyles.wrap}>
    <Text style={demoStyles.subsection}>Two tones</Text>
    <View style={demoStyles.bonusRow}>
      <View style={[demoStyles.bonusChip, glow(colors.warn, 8, 0.45)]}>
        <Text style={demoStyles.bonusName}>Pair ×4</Text>
        <Text style={demoStyles.bonusDesc}>Multiplies every line scoring a Pair (in-game).</Text>
      </View>
      <View
        style={[
          demoStyles.bonusChip,
          { borderColor: colors.joker },
          glow(colors.joker, 8, 0.45),
        ]}
      >
        <Text style={[demoStyles.bonusName, { color: colors.joker }]}>Clean Border</Text>
        <Text style={demoStyles.bonusDesc}>×1.15 per clean edge on the FINAL total (grid achievement).</Text>
      </View>
    </View>
    <Caption>
      Yellow chips pay out per line as you fill the board. Purple chips multiply the
      whole final score at game end. ♣ Bonus draws 2 from the bonus deck and lets you keep 1.
      You can hold up to 3; at the cap, ♣ forces a swap (Easy lets you decline instead).
    </Caption>
    <Text style={demoStyles.subsection}>Six families</Text>
    <View style={demoStyles.kindList}>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Hand-type</Text> — multiplies lines scoring a
        specific hand (Pair, Straight, Flush, …).
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Row / Column</Text> — multiplies a specific line
        (Row N, Col N, Spiral Core, Outer Edge).
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Per-line conditional</Text> — Rainbow (4+ suits),
        Joker line, Royal Touch (Ace in line), Highball, Lowball, Blackjack.
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.warn }}>Per-suit density</Text> — ×1.1 per card of a
        suit in the line.
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.joker }}>Grid achievement</Text> — multiplies the FINAL
        total based on the board's shape: Clean Border, Monochrome Border, Rainbow Corners,
        Diagonal, Symmetric Frame, Cozy Joker, Trash Joker, No Flushes, No Straights, Patience.
      </Text>
      <Text style={demoStyles.kindLine}>
        · <Text style={{ color: colors.joker }}>Deck management</Text> — multiplies the FINAL
        total based on HOW you played: Speedrun (deck cards saved), Burnout (lots of perks),
        Frugal (few perks), Spotlight (single bonus card focus).
      </Text>
    </View>
    <View style={demoStyles.seeAllRow}>
      <NeonButton
        label={`See all ${BONUS_DECK_POOL.length} cards →`}
        variant="secondary"
        size="sm"
        onPress={onSeeAll}
      />
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
  // Crafted to pay out across many lines so users see what "good scoring"
  // looks like:
  //   R1 → Royal Flush ♥, R2 → Three of a Kind 5s, R3 → Two Pair,
  //   R4 → Pair of 2s, R5 → Straight 3-7.
  //   C3 → Two Pair, C4 → Pair of Js.
  const grid = gridWith([
    [0,  C('A','H')], [1, C('K','H')], [2, C('Q','H')], [3, C('J','H')], [4, C('10','H')],
    [5,  C('5','H')], [6, C('5','S')], [7, C('5','D')], [8, C('7','C')], [9, C('K','C')],
    [10, C('8','D')], [11,C('8','C')], [12,C('Q','D')], [13,C('Q','S')], [14,C('4','H')],
    [15, C('2','C')], [16,C('2','S')], [17,C('7','D')], [18,C('J','C')], [19,C('A','C')],
    [20, C('3','H')], [21,C('4','C')], [22,C('5','C')], [23,C('6','S')], [24,C('7','S')],
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

// Multiplier worked example. Press Play to highlight Row 3, light up the two
// bonus cards that match, and roll through the multiplicative math.
const MultiplierMathVisual = () => {
  const [active, setActive] = React.useState(false);

  // Full grid with a Pair on Row 3 (slots 10-14, user-facing "R3"). Other
  // rows are filler that doesn't pair / straight / flush.
  const grid: Grid = gridWith([
    [0,  C('A','C')], [1, C('3','H')], [2, C('8','D')], [3, C('J','S')], [4, C('10','S')],
    [5,  C('K','D')], [6, C('7','C')], [7, C('4','H')], [8, C('9','S')], [9, C('Q','C')],
    [10, C('5','H')], [11,C('5','S')], [12,C('2','C')], [13,C('8','D')], [14,C('10','C')],
    [15, C('A','H')], [16,C('K','S')], [17,C('6','D')], [18,C('J','C')], [19,C('3','S')],
    [20, C('9','D')], [21,C('Q','H')], [22,C('7','S')], [23,C('4','C')], [24,C('2','H')],
  ]);
  const row3Slots = new Set([10, 11, 12, 13, 14]);

  return (
    <View style={demoStyles.wrap}>
      <GridView grid={grid} highlight={active ? row3Slots : undefined} />

      <Text style={demoStyles.subsection}>Bonus cards held</Text>
      <View style={demoStyles.heldRow}>
        <View
          style={[
            demoStyles.held,
            active && demoStyles.heldActive,
          ]}
        >
          <Text style={demoStyles.heldName}>Pair ×4</Text>
          <Text style={demoStyles.heldDesc}>Multiplies any Pair line.</Text>
        </View>
        <View
          style={[
            demoStyles.held,
            active && demoStyles.heldActive,
          ]}
        >
          <Text style={demoStyles.heldName}>Row 3 ×2</Text>
          <Text style={demoStyles.heldDesc}>Multiplies whatever Row 3 scores.</Text>
        </View>
      </View>

      {active && (
        <View style={demoStyles.mathBlock}>
          <View style={demoStyles.mathRow}>
            <Text style={demoStyles.mathLabel}>R3 · Pair (base)</Text>
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
            <Text style={demoStyles.mathTotalLabel}>R3 score</Text>
            <Text style={demoStyles.mathTotalValue}>40</Text>
          </View>
        </View>
      )}

      <View style={demoStyles.btnRow}>
        <NeonButton
          label={active ? '▶ Reset' : '▶ Score Row 3'}
          variant="primary"
          size="sm"
          onPress={() => setActive(a => !a)}
        />
      </View>

      <Caption>
        Multipliers compose <Text style={{ color: colors.success }}>multiplicatively</Text>.
        Both held bonuses apply to R3's Pair: 5 × 4 × 2 = 40. Three ×2s on one line would be
        ×8, not ×6.
      </Caption>
    </View>
  );
};

// Compact list of end-game bonuses, grouped by what they reward so
// the caption isn't a wall of commas. Reads top-to-bottom: shape
// (board composition), restraint (what you DIDN'T do on the board),
// deck management (how you spent the deck + perks), and Patience as
// the lone safety net.
const ACHIEVEMENT_GROUPS: { label: string; entries: string[] }[] = [
  {
    label: 'Shape',
    entries: [
      'Clean Border ×1.15 each edge',
      'Monochrome Border ×1.1 each edge',
      'Rainbow Corners ×1.25',
      'Cozy Joker ×1.15 each',
      'Diagonal ×1.25 each',
      'Symmetric Frame ×1.25 each',
    ],
  },
  {
    label: 'Restraint',
    entries: [
      'No Flushes ×1.25',
      'No Straights ×1.25',
      'Trash Joker ×1.25 each',
    ],
  },
  {
    label: 'Deck management',
    entries: [
      'Speedrun ×1.05 / deck card saved',
      'Burnout ×1.5 (20+ perks)',
      'Frugal ×1.5 (≤14 perks)',
      'Spotlight ×1.5 (held as only bonus card)',
    ],
  },
  {
    label: 'Safety net',
    entries: [
      'Patience — cancels the −25 blank-line penalty',
    ],
  },
];

const AchievementsVisual = () => {
  // Grid with NO face cards on the border — Clean Border satisfied.
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
        End-game bonus cards multiply the final total — they reward board shape, restraint,
        or the way you spent the deck (and your perks) rather than a specific line.
      </Caption>
      <View style={demoStyles.achGroupBlock}>
        {ACHIEVEMENT_GROUPS.map(g => (
          <View key={g.label} style={demoStyles.achGroup}>
            <Text style={demoStyles.achGroupLabel}>{g.label}</Text>
            {g.entries.map(e => (
              <Text key={e} style={demoStyles.achEntry}>
                · <Text style={{ color: colors.joker }}>{e}</Text>
              </Text>
            ))}
          </View>
        ))}
      </View>
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
        One empty slot at game end costs{' '}
        <Text style={{ color: colors.danger }}>−50</Text> — the slot sits in both an incomplete
        row AND an incomplete column, and each scores <Text style={{ color: colors.danger }}>−25</Text>.
        Here that's R3 (4 cards) and C2 (4 cards). Discard freely, but think twice about destroys
        you can't refill.
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

// Visuals receive a small prop bag so slides can trigger tutorial-level
// actions (currently just the "See all bonus cards" modal on slide 6).
// All slide visuals accept this shape; most ignore it.
export interface TutorialVisualProps {
  onSeeAllBonusCards: () => void;
}

interface Slide {
  kicker: string;
  title: string;
  copy: string;
  accent: string;
  Visual: React.ComponentType<TutorialVisualProps>;
}

const STEPS: Slide[] = [
  {
    kicker: '01 · GOAL',
    title: 'Beat your target',
    copy: '5×5 poker solitaire. Place every drawn card on the grid; at game end, score the 5 rows and 5 columns as poker hands. Free Play targets: Easy 400, Medium 450, Hard 500, Extreme 450 (no jokers + no discards).',
    accent: colors.accent,
    Visual: GoalVisual,
  },
  {
    kicker: '02 · PLACE',
    title: 'A spiral from the center',
    copy: 'Each turn you can place the drawn card, discard it (Easy, Medium, Hard), or spend it on its suit perk. Placing puts it in the next spiral slot — center first, then clockwise outward. The cyan-pulsing slot marks where the next card lands.',
    accent: colors.accent,
    Visual: SpiralVisual,
  },
  {
    kicker: '03 · ♥ SWAP',
    title: 'Hearts trade two cards',
    copy: 'Spend a heart to swap any two cards that share a row or a column. The heart itself is spent. Use it to rebuild a near-miss flush or move the joker.',
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
    copy: 'Destroy any one card on the grid — even the joker. Both the diamond AND the targeted card leave play. Powerful but expensive: empty slots cost points at game end.',
    accent: colors.suitD,
    Visual: DestroyVisual,
  },
  {
    kicker: '06 · ♣ BONUS',
    title: 'Clubs draw bonus cards',
    copy: 'Spend a club to draw 2 from the bonus deck and keep 1. You can hold up to 3. At the cap, Medium / Hard / Extreme force a swap; Easy still lets you decline.',
    accent: colors.suitC,
    Visual: BonusVisual,
  },
  {
    kicker: '07 · THE JOKER',
    title: 'The joker is wild',
    copy: "Jokers auto-place into the next spiral slot and can't be discarded normally — only a ♦ Destroy removes one. On the grid a joker takes whatever rank and suit make the best hand, independently for its row and its column.",
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
    kicker: '11 · ENDGAME BONUSES',
    title: 'Grid-wide multipliers',
    copy: 'Some bonus cards multiply your whole final score, not individual lines. They reward arranging the grid in specific shapes — or playing in specific styles.',
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
  const [bonusCardsOpen, setBonusCardsOpen] = useState(false);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;
  const Visual = step.Visual;

  const finish = () => {
    markTutorialSeen();
    onDone();
  };

  const visualProps: TutorialVisualProps = {
    onSeeAllBonusCards: () => setBonusCardsOpen(true),
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
          <Visual {...visualProps} />
        </Animated.View>
      </ScrollView>

      {/* Render the catalog inline as an absolute overlay rather than
          via React Native's <Modal>. On react-native-web Modal portals
          to the document body, escaping the WebScaler's transform and
          spanning the full browser width on desktop; an in-tree
          overlay stays inside the scaled phone frame so it reads as
          portrait on every viewport. */}
      {bonusCardsOpen && (
        <View style={styles.bonusCardsOverlay}>
          <BonusCardsScreen onBack={() => setBonusCardsOpen(false)} />
        </View>
      )}

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
  // Full-bleed overlay for the "See all cards" catalog. Lives inside
  // the WebScaler's transform context so the desktop browser frames
  // it as the same scaled phone portrait the rest of the app uses.
  bonusCardsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgBase,
  },
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
    textAlign: 'left',
    alignSelf: 'stretch',
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
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
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
  seeAllRow: {
    alignItems: 'center',
    marginTop: spacing.md,
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
  heldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: 4,
  },
  held: {
    flex: 1,
    backgroundColor: colors.bgGlass,
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heldActive: {
    borderColor: colors.warn,
    borderWidth: 2,
    ...glow(colors.warn, 10, 0.7),
  },
  heldName: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heldDesc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 9,
    marginTop: 3,
    lineHeight: 12,
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
  // Slide 11 achievement groups — Shape / Restraint / Volume / Safety
  // net columns of small entries, easier to scan than the old run-on
  // comma list.
  achGroupBlock: {
    width: '100%',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  achGroup: { gap: 2 },
  achGroupLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  achEntry: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
  },
});
