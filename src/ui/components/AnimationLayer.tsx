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
  | { kind: 'destroy'; card: Card; slot: number };

export const ANIM_DURATION = {
  place: 480,
  'joker-place': 900,
  swap: 480,
  slide: 360,
  destroy: 640,
} as const;

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

const DestroyAnim = ({ card, slot }: { card: Card; slot: number }) => {
  const { x, y } = slotXY(slot);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const shockScale = useSharedValue(0);
  const shockOpacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.15, { duration: 100 }),
      withTiming(1.4, { duration: 80 }),
      withTiming(0, { duration: 360, easing: Easing.in(Easing.cubic) })
    );
    opacity.value = withDelay(180, withTiming(0, { duration: 300 }));
    rotate.value = withTiming(20, { duration: 480 });
    shockScale.value = withDelay(140, withTiming(2.2, { duration: 460, easing: Easing.out(Easing.cubic) }));
    shockOpacity.value = withDelay(140, withTiming(0, { duration: 460 }));
  }, [scale, opacity, rotate, shockScale, shockOpacity]);

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
