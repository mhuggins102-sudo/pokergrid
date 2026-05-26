import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, isJoker, Rank, RANKS, StandardCard, Suit } from '../../game/cards';
import { Grid } from '../../game/grid';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing, suitColor } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  deck: readonly Card[];
  grid: Grid;
  // Cards that left play without a perk (Discard button or destroyed targets).
  discards: readonly Card[];
  // Drawn cards spent on a suit perk.
  perkSpent: readonly Card[];
}

const SUIT_GLYPH: Record<Suit, string> = { H: '♥', S: '♠', D: '♦', C: '♣' };
const SUIT_NAME: Record<Suit, string> = {
  H: 'Hearts',
  S: 'Spades',
  D: 'Diamonds',
  C: 'Clubs',
};
const SUITS_ORDER: Suit[] = ['H', 'S', 'D', 'C'];

const TWO_COLOR_SUIT: Record<Suit, string> = {
  H: '#ff5577',
  D: '#ff5577',
  S: '#d8dcea',
  C: '#d8dcea',
};

const isStandard = (c: Card): c is StandardCard => !isJoker(c);

export const RemainingDeckModal = ({
  visible,
  onClose,
  deck,
  grid,
  discards,
  perkSpent,
}: Props) => {
  const { settings } = useSettings();

  // Membership set keyed by "RankSuit" for every card still in the deck.
  const inDeck = new Set<string>();
  for (const c of deck) {
    if (isStandard(c)) inDeck.add(`${c.rank}${c.suit}`);
  }

  const standardRemaining = Array.from(inDeck).length;
  // Easy ships two jokers, Extreme zero — count every location rather
  // than assuming a single joker.
  const jokerInDeckCount = deck.filter(isJoker).length;
  const jokerOnGridCount = grid.filter(c => c !== null && isJoker(c)).length;
  const jokerDestroyedCount =
    discards.filter(isJoker).length + perkSpent.filter(isJoker).length;
  const totalJokers = jokerInDeckCount + jokerOnGridCount + jokerDestroyedCount;

  const jokerSummary = ((): string => {
    if (totalJokers === 0) return 'No jokers in this deck.';
    if (totalJokers === 1) {
      if (jokerInDeckCount === 1) return 'The joker is in the deck.';
      if (jokerOnGridCount === 1) return 'The joker is on the grid.';
      return 'The joker has been destroyed.';
    }
    // Two or more jokers — list each non-zero location with its count.
    const parts: string[] = [];
    if (jokerInDeckCount > 0) parts.push(`${jokerInDeckCount} in the deck`);
    if (jokerOnGridCount > 0) parts.push(`${jokerOnGridCount} on the grid`);
    if (jokerDestroyedCount > 0) parts.push(`${jokerDestroyedCount} destroyed`);
    return `${totalJokers} jokers · ${parts.join(', ')}.`;
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Remaining Deck</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.sub}>
            {standardRemaining} of 52 standard cards remain. {jokerSummary}
          </Text>

          <ScrollView style={styles.scroll}>
            {SUITS_ORDER.map(s => {
              const presentCount = RANKS.filter(r => inDeck.has(`${r}${s}`)).length;
              const color = settings.twoColorDeck ? TWO_COLOR_SUIT[s] : suitColor(s);
              return (
                <View key={s} style={styles.suitBlock}>
                  <View style={styles.suitHeader}>
                    <Text style={[styles.suitLabel, { color }]}>
                      {SUIT_GLYPH[s]} {SUIT_NAME[s]}
                    </Text>
                    <Text style={styles.suitCount}>{presentCount} / 13</Text>
                  </View>
                  <View style={styles.rankRow}>
                    {RANKS.map(r => (
                      <RankCell
                        key={r}
                        rank={r}
                        present={inDeck.has(`${r}${s}`)}
                        color={color}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Text style={styles.footnote}>
            This preview is available only on Easy difficulty.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const RankCell = ({
  rank,
  present,
  color,
}: {
  rank: Rank;
  present: boolean;
  color: string;
}) => (
  <View
    style={[
      styles.rankCell,
      present
        ? { borderColor: color }
        : { borderColor: colors.outlineSoft, opacity: 0.4 },
    ]}
  >
    <Text
      style={[
        styles.rankText,
        present
          ? { color, textShadowColor: color, textShadowRadius: 3 }
          : { color: colors.textLow, textDecorationLine: 'line-through' },
      ]}
    >
      {rank}
    </Text>
  </View>
);

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
    maxWidth: 380,
    maxHeight: '88%',
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
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  sub: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  scroll: {},
  suitBlock: {
    marginBottom: spacing.md,
  },
  suitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  suitLabel: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowRadius: 4,
  },
  suitCount: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  rankRow: {
    flexDirection: 'row',
    gap: 2,
    flexWrap: 'wrap',
  },
  rankCell: {
    width: 22,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
