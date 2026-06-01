import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BonusCard, BONUS_HAND_LIMIT } from '../../game/bonusCards';
import { styleFor } from '../bonusCardCategory';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  cards: BonusCard[];
  // Current per-card contribution to the score. Index-aligned with `cards`.
  // Shown above each chip; blank above empty slots.
  values?: number[];
  // Optional: highlight a slot index (for replacement flow). 0..2.
  selectedIdx?: number | null;
  // Optional press handler (used during replace flow).
  onCardPress?: (idx: number) => void;
  // First-game hint plumbing: when supplied, the strip writes each
  // slot's wrapper View into this array by index so the parent can
  // measureInWindow the specific chip a hint is pointing at.
  cardRefs?: React.MutableRefObject<(View | null)[]>;
}

const ValueBadge = ({ value }: { value: number | undefined }) => {
  if (value === undefined) {
    // Empty slot — keep height consistent so chips align.
    return <View style={styles.valueBadge} />;
  }
  if (value === 0) {
    return (
      <View style={styles.valueBadge}>
        <Text style={styles.valueZero}>—</Text>
      </View>
    );
  }
  const sign = value > 0 ? '+' : '';
  return (
    <View style={styles.valueBadge}>
      <Text style={styles.valueActive}>{sign}{value}</Text>
    </View>
  );
};

interface ChipProps {
  card: BonusCard;
  value: number | undefined;
  isSelected: boolean;
  onPress?: () => void;
}

// Single bonus card chip. Tracks its own value-changed pulse so that when a
// scoring event (place, swap, slide, destroy, etc.) bumps the card's
// contribution upward, the chip flashes — making it obvious WHICH held
// bonus card just fired without the player having to mentally diff a row of
// small numbers.
//
// The pulse only fires on value INCREASES — decreases (e.g., a swap that
// breaks the line this card was scoring on) are not "fires," they're losses
// and the value-badge text already communicates that.
const BonusChip = ({ card, value, isSelected, onPress }: ChipProps) => {
  const { settings } = useSettings();
  const cat = styleFor(card);
  const flash = useSharedValue(0);
  const prevValue = useRef<number | undefined>(value);

  useEffect(() => {
    if (
      value !== undefined &&
      prevValue.current !== undefined &&
      value > prevValue.current
    ) {
      if (!settings.reduceMotion) {
        flash.value = withSequence(
          withTiming(1, { duration: 140 }),
          withTiming(0, { duration: 420 })
        );
      }
    }
    prevValue.current = value;
  }, [value, settings.reduceMotion, flash]);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    backgroundColor: cat.flashColor,
  }));

  // Spent one-time cards (Three Tricks) stay in their slot but
  // visibly fade so the player knows the action is gone. Skip the
  // category glow as well so the spent chip reads as inert.
  const isUsed = !!card.used;
  return (
    <Pressable
      style={[
        styles.chip,
        { borderColor: cat.borderColor },
        !isUsed && glow(cat.borderColor, 6, 0.35),
        isSelected && styles.selected,
        isUsed && styles.usedChip,
      ]}
      onPress={onPress}
    >
      <View style={styles.chipTextWrap}>
        {settings.colorBlindAssist && (
          <Text style={[styles.icon, { color: cat.iconColor, textShadowColor: cat.iconColor }]}>
            {cat.icon}
          </Text>
        )}
        <Text
          style={[styles.title, { color: cat.titleColor, textShadowColor: cat.titleColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {card.title}
        </Text>
        <Text style={styles.mult} numberOfLines={1} adjustsFontSizeToFit>
          {isUsed ? 'used' : card.mult}
        </Text>
      </View>
      <Animated.View pointerEvents="none" style={[styles.flashOverlay, flashStyle]} />
    </Pressable>
  );
};

const EmptyChip = () => (
  <View style={[styles.chip, styles.empty]}>
    <Text style={styles.emptyText}>· empty ·</Text>
  </View>
);

export const BonusCardStrip = ({ cards, values, selectedIdx, onCardPress, cardRefs }: Props) => (
  <View style={styles.wrap}>
    <View style={styles.strip}>
      {Array.from({ length: BONUS_HAND_LIMIT }, (_, i) => {
        const c = cards[i];
        const filled = !!c;
        const isSelected = selectedIdx === i;
        const pressable = !!onCardPress && filled;
        return (
          <View
            key={i}
            style={styles.slot}
            collapsable={false}
            ref={el => {
              if (cardRefs) cardRefs.current[i] = el;
            }}
          >
            <ValueBadge value={filled ? values?.[i] : undefined} />
            {filled ? (
              // Keyed by card id so a replacement remounts the chip with a
              // fresh prev-value ref — otherwise the new card's first value
              // would be compared against the old card's last value and
              // could trigger a spurious flash on swap.
              <BonusChip
                key={c.id}
                card={c}
                value={values?.[i]}
                isSelected={isSelected}
                onPress={pressable ? () => onCardPress!(i) : undefined}
              />
            ) : (
              <EmptyChip />
            )}
          </View>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xs },
  strip: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'stretch',
  },
  // Each slot now shares the available width equally so 3 chips always fit
  // the viewport, no horizontal scroll required.
  slot: {
    flex: 1,
    alignItems: 'stretch',
  },
  valueBadge: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  valueActive: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
  valueZero: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '600',
  },
  chip: {
    // borderColor set inline based on category (yellow / blue / purple).
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgGlass,
    // Center the title both vertically and horizontally — chips now show
    // only the main accent text; the full description is in the popup.
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 50,
    overflow: 'hidden',
  },
  empty: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: colors.outline,
  },
  emptyText: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 1,
  },
  selected: {
    borderColor: colors.accent,
    borderWidth: 2,
    ...glow(colors.accent, 10, 0.7),
  },
  // Spent one-time chip — keep the layout intact (the slot is still
  // "occupied" so ♣ won't reuse it) but fade the chip down so the
  // player reads it as inert at a glance.
  usedChip: {
    opacity: 0.35,
    backgroundColor: 'transparent',
  },
  chipTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 1,
  },
  icon: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textShadowRadius: 4,
    lineHeight: 14,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    // color + textShadowColor set inline from category tone.
    letterSpacing: 0.5,
    textShadowRadius: 4,
    textAlign: 'center',
  },
  mult: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 3,
    textAlign: 'center',
  },
  // Briefly visible category-color wash on the chip when its scoring
  // contribution increases — "this card just fired." backgroundColor is
  // set inline from the card's category tone so a row-bonus flashes blue,
  // a grid-achievement flashes purple, etc.
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
  },
});
