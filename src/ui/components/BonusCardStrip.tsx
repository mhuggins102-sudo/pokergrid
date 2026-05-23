import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BonusCard, BONUS_HAND_LIMIT } from '../../game/bonusCards';

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
            style={[styles.chip, !filled && styles.empty, isSelected && styles.selected]}
            onPress={pressable ? () => onCardPress(i) : undefined}
          >
            {filled ? (
              <>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.desc} numberOfLines={2}>{c.description}</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>empty</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  strip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    alignItems: 'stretch',
  },
  chip: {
    backgroundColor: '#f1efe6',
    borderColor: '#d6cfa7',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 118,
    justifyContent: 'center',
  },
  empty: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: '#4d525f',
  },
  emptyText: {
    color: '#6c707d',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  selected: {
    borderColor: '#3680ff',
    borderWidth: 2,
  },
  name: { fontSize: 11, fontWeight: '700', color: '#5d4f1a' },
  desc: { fontSize: 9, color: '#776230', marginTop: 1 },
});
