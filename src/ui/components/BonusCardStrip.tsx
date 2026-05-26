import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BonusCard, BONUS_HAND_LIMIT } from '../../game/bonusCards';
import { styleFor } from '../bonusCardCategory';
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

export const BonusCardStrip = ({ cards, values, selectedIdx, onCardPress }: Props) => (
  <View style={styles.wrap}>
    <View style={styles.strip}>
      {Array.from({ length: BONUS_HAND_LIMIT }, (_, i) => {
        const c = cards[i];
        const filled = !!c;
        const isSelected = selectedIdx === i;
        const pressable = !!onCardPress && filled;
        return (
          <View key={i} style={styles.slot}>
            <ValueBadge value={filled ? values?.[i] : undefined} />
            <Pressable
              style={[
                styles.chip,
                !filled && styles.empty,
                filled && glow(colors.warn, 6, 0.35),
                isSelected && styles.selected,
              ]}
              onPress={pressable ? () => onCardPress!(i) : undefined}
            >
              {filled ? (
                <View style={styles.chipTextWrap}>
                  <Text
                    style={[styles.icon, { color: styleFor(c).color, textShadowColor: styleFor(c).color }]}
                  >
                    {styleFor(c).icon}
                  </Text>
                  <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
                    {c.title}
                  </Text>
                  <Text style={styles.mult} numberOfLines={1} adjustsFontSizeToFit>
                    {c.mult}
                  </Text>
                </View>
              ) : (
                <Text style={styles.emptyText}>· empty ·</Text>
              )}
            </Pressable>
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
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgGlass,
    // Center the title both vertically and horizontally — chips now show
    // only the "main" yellow text; the full description is in the popup.
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 50,
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
    color: colors.warn,
    letterSpacing: 0.5,
    textShadowColor: colors.warn,
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
});
