import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BonusCard, BONUS_HAND_LIMIT } from '../../game/bonusCards';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  cards: BonusCard[];
  // Optional: highlight a slot index (for replacement flow). 0..2.
  selectedIdx?: number | null;
  // Optional press handler (used during replace flow).
  onCardPress?: (idx: number) => void;
}

export const BonusCardStrip = ({ cards, selectedIdx, onCardPress }: Props) => (
  <View style={styles.wrap}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {Array.from({ length: BONUS_HAND_LIMIT }, (_, i) => {
        const c = cards[i];
        const filled = !!c;
        const isSelected = selectedIdx === i;
        const pressable = !!onCardPress && filled;
        return (
          <Pressable
            key={i}
            style={[
              styles.chip,
              !filled && styles.empty,
              filled && glow(colors.warn, 6, 0.35),
              isSelected && styles.selected,
            ]}
            onPress={pressable ? () => onCardPress!(i) : undefined}
          >
            {filled ? (
              <>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.desc} numberOfLines={2}>{c.description}</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>· empty ·</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
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
  chip: {
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: 124,
    backgroundColor: colors.bgGlass,
    justifyContent: 'center',
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
  name: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    color: colors.warn,
    letterSpacing: 0.5,
    textShadowColor: colors.warn,
    textShadowRadius: 4,
  },
  desc: {
    fontFamily: fonts.sans,
    fontSize: 9,
    color: colors.textMid,
    marginTop: 2,
    lineHeight: 12,
  },
});
