import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Card } from '../../game/cards';
import { Direction, GRID_SIZE } from '../../game/grid';
import { colors, glow, gridCellSize } from '../theme';
import { CardTile } from './CardTile';

// Grid geometry constants. Must stay in sync with GridView.
const CELL = gridCellSize;
const HEADER = 20;

const slotXY = (slot: number) => {
  const r = Math.floor(slot / 5);
  const c = slot % 5;
  return {
    x: HEADER + c * CELL,
    y: HEADER + r * CELL,
  };
};

// ---------- Anim specs ----------

export type AnimSpec =
  | { kind: 'place'; card: Card; toSlot: number }
  | { kind: 'joker-place'; card: Card; toSlot: number }
  | {
      kind: 'swap';
      cardA: Card;
      slotA: number;
      cardB: Card;
      slotB: number;
    }
  | {
      kind: 'slide';
      cards: { card: Card; from: number; to: number }[];
    }
  // Slip & Slide — animates each chain member through every step of
  // the path. `cards` are the chain members in starting positions; the
  // animation interpolates them one cell at a time per path entry.
  | {
      kind: 'slip-slide';
      cards: { card: Card; from: number }[];
      path: Direction[];
    }
  // Jump, Jump — a single card lifts off, arcs to the destination, and
  // lands. Bigger lift + scale wobble than the regular swap arc.
  | { kind: 'jump'; card: Card; from: number; to: number }
  // Mega Destroy — the same ♦ destroy animation, fired sequentially on
  // each picked card with a per-step stagger. The whole animation
  // runs as one AnimSpec so the existing animTimer pipeline can drive
  // the eventual dispatch.
  | {
      kind: 'mega-destroy';
      items: { card: Card; slot: number }[];
      staggerMs: number;
    }
  | { kind: 'destroy'; card: Card; slot: number };

export const ANIM_DURATION = {
  place: 480,
  'joker-place': 900,
  swap: 480,
  slide: 360,
  destroy: 640,
  // Slip & Slide — each step in the path takes SLIP_SLIDE_STEP_MS, so
  // the full duration scales with path length. The base entry is used
  // by the GameScreen for the queued-action timer.
  'slip-slide': 0,
  jump: 600,
  // mega-destroy is dynamic: stagger * (n - 1) + per-card destroy.
  // The GameScreen computes the real duration when scheduling the
  // dispatch.
  'mega-destroy': 0,
} as const;

// Per-step duration for Slip & Slide. The whole anim runs for
// SLIP_SLIDE_STEP_MS * path.length, computed at performAnimated time.
export const SLIP_SLIDE_STEP_MS = 200;

// Returns the slots whose grid cells should be hidden while the animation
// plays — usually the cards that are moving (we draw them on the overlay).
export const hiddenSlotsFor = (anim: AnimSpec | null): Set<number> => {
  if (!anim) return new Set();
  switch (anim.kind) {
    case 'place':
      return new Set();
    case 'joker-place':
      // The reducer has already dropped the joker into the grid by the time
      // the UI plays this animation, so we hide the static cell while the
      // overlay performs the entrance.
      return new Set([anim.toSlot]);
    case 'swap':
      return new Set([anim.slotA, anim.slotB]);
    case 'slide':
      return new Set(anim.cards.map(c => c.from));
    case 'slip-slide':
      return new Set(anim.cards.map(c => c.from));
    case 'jump':
      // Hide both endpoints — the source vacates as the card lifts
      // off, and the dest gets occupied by the reducer the moment we
      // dispatch (so the static cell would show through under the
      // overlay).
      return new Set([anim.from, anim.to]);
    case 'mega-destroy':
      return new Set(anim.items.map(i => i.slot));
    case 'destroy':
      return new Set([anim.slot]);
  }
};

// ---------- Sub-animations ----------

const EASE = Easing.bezier(0.45, 0.05, 0.2, 1);

const PlaceAnim = ({ card, toSlot }: { card: Card; toSlot: number }) => {
  const { x, y } = slotXY(toSlot);
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withTiming(1, { duration: ANIM_DURATION.place, easing: EASE });
    opacity.value = withTiming(1, { duration: ANIM_DURATION.place * 0.5, easing: EASE });
    // Glow burst trailing the card materialization.
    ringScale.value = withDelay(120, withTiming(1.6, { duration: 360, easing: Easing.out(Easing.cubic) }));
    ringOpacity.value = withDelay(120, withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) }));
  }, [scale, opacity, ringScale, ringOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Animated.View
      style={[styles.absolute, { left: x, top: y, width: CELL, height: CELL }]}
    >
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={cardStyle}>
        <CardTile card={card} size="md" />
      </Animated.View>
    </Animated.View>
  );
};

// Joker auto-place: slower, more dramatic than a normal place. The card
// spirals in with a full rotation, a violet glow burst, and six radiating
// sparkles. Used both for the mid-game auto-place and in the intro animation
// when a joker was seeded before the first interactive turn.
const JOKER_GLOW = '#d18bff';
const JOKER_SPARKLE_COLORS = ['#ffd86b', '#ff5577', '#7ff0ff', '#d18bff'];

const JokerSparkle = ({ angle, color, delay }: { angle: number; color: string; delay: number }) => {
  const t = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 80 }));
    t.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    opacity.value = withDelay(delay + 80, withTiming(0, { duration: 540 }));
  }, [t, opacity, delay]);
  const style = useAnimatedStyle(() => {
    const dist = 42 * t.value;
    return {
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - t.value * 0.5 },
      ],
      opacity: opacity.value,
    };
  });
  return (
    <Animated.View
      style={[
        styles.sparkle,
        { backgroundColor: color, shadowColor: color },
        glow(color, 6, 0.95),
        style,
      ]}
    />
  );
};

const JokerPlaceAnim = ({ card, toSlot }: { card: Card; toSlot: number }) => {
  const { x, y } = slotXY(toSlot);
  const D = ANIM_DURATION['joker-place'];
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(-180);
  const ringScale = useSharedValue(0.4);
  const ringOpacity = useSharedValue(0.85);
  const ring2Scale = useSharedValue(0.4);
  const ring2Opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withTiming(1, { duration: D, easing: EASE });
    opacity.value = withTiming(1, { duration: D * 0.4, easing: EASE });
    rotate.value = withTiming(0, { duration: D, easing: Easing.out(Easing.cubic) });
    ringScale.value = withDelay(160, withTiming(2.0, { duration: D - 200, easing: Easing.out(Easing.cubic) }));
    ringOpacity.value = withDelay(160, withTiming(0, { duration: D - 200, easing: Easing.out(Easing.cubic) }));
    ring2Scale.value = withDelay(320, withTiming(2.6, { duration: D - 360, easing: Easing.out(Easing.cubic) }));
    ring2Opacity.value = withDelay(320, withTiming(0, { duration: D - 360, easing: Easing.out(Easing.cubic) }));
  }, [scale, opacity, rotate, ringScale, ringOpacity, ring2Scale, ring2Opacity, D]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.absolute, { left: x, top: y, width: CELL, height: CELL }]}
    >
      <Animated.View style={[styles.jokerRing, ringStyle]} />
      <Animated.View style={[styles.jokerRing, ring2Style]} />
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.particleAnchor}>
          <JokerSparkle
            angle={(i / 6) * Math.PI * 2 - Math.PI / 2}
            color={JOKER_SPARKLE_COLORS[i % JOKER_SPARKLE_COLORS.length]}
            delay={200 + i * 30}
          />
        </View>
      ))}
      <Animated.View style={cardStyle}>
        <CardTile card={card} size="md" />
      </Animated.View>
    </Animated.View>
  );
};

const MovingCard = ({
  card,
  from,
  to,
  duration,
  delay = 0,
  arc = false,
}: {
  card: Card;
  from: number;
  to: number;
  duration: number;
  delay?: number;
  arc?: boolean;
}) => {
  const a = slotXY(from);
  const b = slotXY(to);
  const t = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration, easing: EASE }));
    if (arc) {
      lift.value = withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: duration * 0.45, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: duration * 0.55, easing: Easing.in(Easing.cubic) })
        )
      );
    }
  }, [t, lift, duration, delay, arc]);

  const style = useAnimatedStyle(() => {
    const x = a.x + (b.x - a.x) * t.value;
    const y = a.y + (b.y - a.y) * t.value - lift.value * 22;
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale: 1 + lift.value * 0.06 }],
    };
  });

  return (
    <Animated.View style={[styles.absolute, { width: CELL, height: CELL }, style]}>
      <CardTile card={card} size="md" />
    </Animated.View>
  );
};

const SwapAnim = ({
  cardA,
  slotA,
  cardB,
  slotB,
}: {
  cardA: Card;
  slotA: number;
  cardB: Card;
  slotB: number;
}) => (
  <>
    <MovingCard card={cardA} from={slotA} to={slotB} duration={ANIM_DURATION.swap} arc />
    <MovingCard card={cardB} from={slotB} to={slotA} duration={ANIM_DURATION.swap} arc />
  </>
);

const SlideAnim = ({
  cards,
}: {
  cards: { card: Card; from: number; to: number }[];
}) => (
  <>
    {cards.map((c, i) => (
      <MovingCard
        key={`${c.from}-${c.to}-${i}`}
        card={c.card}
        from={c.from}
        to={c.to}
        duration={ANIM_DURATION.slide}
      />
    ))}
  </>
);

const stepOf = (d: Direction): number =>
  d === 'up' ? -GRID_SIZE
  : d === 'down' ? GRID_SIZE
  : d === 'left' ? -1
  : 1;

// Slip & Slide — animates each chain card through every step of the
// path. Each step takes SLIP_SLIDE_STEP_MS, and the cards travel
// together. Built by chaining `withSequence` so the slot-to-slot motion
// reads as "slide, slide, slide" rather than a single straight-line
// flight.
const SlipSlideStepCard = ({
  card,
  from,
  path,
}: {
  card: Card;
  from: number;
  path: Direction[];
}) => {
  // Each waypoint is the chain card's position after that many steps.
  const waypoints: { x: number; y: number }[] = [];
  let cur = from;
  waypoints.push(slotXY(cur));
  for (const d of path) {
    cur += stepOf(d);
    waypoints.push(slotXY(cur));
  }
  const tx = useSharedValue(waypoints[0].x);
  const ty = useSharedValue(waypoints[0].y);

  useEffect(() => {
    if (waypoints.length <= 1) return;
    // Build a sequence: tx travels through every waypoint, one step
    // per SLIP_SLIDE_STEP_MS. The same is done in parallel for ty.
    const easing = Easing.bezier(0.4, 0.0, 0.2, 1);
    const buildSeq = (axis: 'x' | 'y') => {
      const steps = waypoints.slice(1).map(wp =>
        withTiming(axis === 'x' ? wp.x : wp.y, {
          duration: SLIP_SLIDE_STEP_MS,
          easing,
        })
      );
      // withSequence demands at least one entry; we always have one
      // since path.length >= 1.
      return withSequence(...(steps as [typeof steps[0], ...typeof steps]));
    };
    tx.value = buildSeq('x');
    ty.value = buildSeq('y');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View style={[styles.absolute, { width: CELL, height: CELL }, style]}>
      <CardTile card={card} size="md" />
    </Animated.View>
  );
};

const SlipSlideAnim = ({
  cards,
  path,
}: {
  cards: { card: Card; from: number }[];
  path: Direction[];
}) => (
  <>
    {cards.map((c, i) => (
      <SlipSlideStepCard key={`${c.from}-${i}`} card={c.card} from={c.from} path={path} />
    ))}
  </>
);

// Jump, Jump — a card lifts off (scales up), arcs to the destination
// with a tall vertical hop, then lands (scales back down with a
// micro-bounce). The bigger lift and scale wobble vs the swap arc make
// it read as a literal jump rather than a slide.
const JumpAnim = ({
  card,
  from,
  to,
}: {
  card: Card;
  from: number;
  to: number;
}) => {
  const a = slotXY(from);
  const b = slotXY(to);
  const t = useSharedValue(0);
  const lift = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    const D = ANIM_DURATION.jump;
    t.value = withTiming(1, { duration: D, easing: Easing.bezier(0.3, 0, 0.4, 1) });
    // Tall arc — peaks at ~40% of the duration, ~38px above baseline.
    lift.value = withSequence(
      withTiming(1, { duration: D * 0.45, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: D * 0.55, easing: Easing.in(Easing.cubic) })
    );
    // Scale wobble: stretch at lift-off, peak-sized in flight, snappy
    // bounce on landing. The little overshoot at the end sells the
    // boing landing.
    scale.value = withSequence(
      withTiming(1.18, { duration: D * 0.18, easing: Easing.out(Easing.cubic) }),
      withTiming(1.28, { duration: D * 0.32, easing: Easing.out(Easing.cubic) }),
      withTiming(0.92, { duration: D * 0.28, easing: Easing.in(Easing.cubic) }),
      withTiming(1.0, { duration: D * 0.22, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const x = a.x + (b.x - a.x) * t.value;
    const y = a.y + (b.y - a.y) * t.value - lift.value * 38;
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale: scale.value }],
    };
  });

  return (
    <Animated.View style={[styles.absolute, { width: CELL, height: CELL }, style]}>
      <CardTile card={card} size="md" />
    </Animated.View>
  );
};

const Particle = ({
  angle,
  color,
}: {
  angle: number;
  color: string;
}) => {
  const t = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    t.value = withDelay(80, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    opacity.value = withDelay(80, withTiming(0, { duration: 460 }));
  }, [t, opacity]);
  const style = useAnimatedStyle(() => {
    const dist = 50 * t.value;
    return {
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - t.value * 0.4 },
      ],
      opacity: opacity.value,
    };
  });
  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: color, shadowColor: color },
        glow(color, 6, 0.9),
        style,
      ]}
    />
  );
};

const DestroyAnim = ({
  card,
  slot,
  delay = 0,
}: {
  card: Card;
  slot: number;
  delay?: number;
}) => {
  const { x, y } = slotXY(slot);
  // While the delay is active the card sits at scale=0 / opacity=0
  // (off-screen). It pops in at the start of its turn so the staggered
  // mega-destroy doesn't show all 5 cards on top of each other from
  // t=0. Single-shot ♦ destroy uses delay=0 and the pop-in is
  // visually identical to "appearing instantly".
  const scale = useSharedValue(delay > 0 ? 0 : 1);
  const opacity = useSharedValue(delay > 0 ? 0 : 1);
  const rotate = useSharedValue(0);
  const shockScale = useSharedValue(0);
  const shockOpacity = useSharedValue(0.9);

  useEffect(() => {
    // Pop the card into view (instant for delay=0, after the wait
    // for staggered fires).
    if (delay > 0) {
      scale.value = withDelay(delay, withTiming(1, { duration: 0 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 0 }));
    }
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.15, { duration: 100 }),
        withTiming(1.4, { duration: 80 }),
        withTiming(0, { duration: 360, easing: Easing.in(Easing.cubic) })
      )
    );
    opacity.value = withDelay(delay + 180, withTiming(0, { duration: 300 }));
    rotate.value = withDelay(delay, withTiming(20, { duration: 480 }));
    shockScale.value = withDelay(
      delay + 140,
      withTiming(2.2, { duration: 460, easing: Easing.out(Easing.cubic) })
    );
    shockOpacity.value = withDelay(
      delay + 140,
      withTiming(0, { duration: 460 })
    );
  }, [scale, opacity, rotate, shockScale, shockOpacity, delay]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));
  const shockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shockScale.value }],
    opacity: shockOpacity.value,
  }));

  return (
    <Animated.View
      style={[styles.absolute, { left: x, top: y, width: CELL, height: CELL }]}
    >
      <Animated.View style={[styles.shockRing, shockStyle]} />
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={i} style={styles.particleAnchor}>
          <Particle
            angle={(i / 10) * Math.PI * 2}
            color={i % 2 === 0 ? colors.danger : colors.warn}
          />
        </View>
      ))}
      <Animated.View style={cardStyle}>
        <CardTile card={card} size="md" />
      </Animated.View>
    </Animated.View>
  );
};

const MegaDestroyAnim = ({
  items,
  staggerMs,
}: {
  items: { card: Card; slot: number }[];
  staggerMs: number;
}) => (
  <>
    {items.map((it, i) => (
      <DestroyAnim
        key={`${it.slot}-${i}`}
        card={it.card}
        slot={it.slot}
        delay={i * staggerMs}
      />
    ))}
  </>
);

// ---------- The layer ----------

export const AnimationLayer = ({ anim }: { anim: AnimSpec | null }) => {
  if (!anim) return null;
  return (
    <View style={styles.layer} pointerEvents="none">
      {anim.kind === 'place' && <PlaceAnim card={anim.card} toSlot={anim.toSlot} />}
      {anim.kind === 'joker-place' && <JokerPlaceAnim card={anim.card} toSlot={anim.toSlot} />}
      {anim.kind === 'swap' && (
        <SwapAnim
          cardA={anim.cardA}
          slotA={anim.slotA}
          cardB={anim.cardB}
          slotB={anim.slotB}
        />
      )}
      {anim.kind === 'slide' && <SlideAnim cards={anim.cards} />}
      {anim.kind === 'slip-slide' && (
        <SlipSlideAnim cards={anim.cards} path={anim.path} />
      )}
      {anim.kind === 'jump' && (
        <JumpAnim card={anim.card} from={anim.from} to={anim.to} />
      )}
      {anim.kind === 'mega-destroy' && (
        <MegaDestroyAnim items={anim.items} staggerMs={anim.staggerMs} />
      )}
      {anim.kind === 'destroy' && <DestroyAnim card={anim.card} slot={anim.slot} />}
    </View>
  );
};

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  absolute: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.accent,
    ...glow(colors.accent, 16, 0.9),
  },
  shockRing: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    borderWidth: 2,
    borderColor: colors.danger,
    ...glow(colors.danger, 14, 0.8),
  },
  particleAnchor: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  jokerRing: {
    position: 'absolute',
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    borderWidth: 2,
    borderColor: JOKER_GLOW,
    ...glow(JOKER_GLOW, 18, 0.9),
  },
  sparkle: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
