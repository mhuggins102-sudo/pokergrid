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

  // Joker totals — count every location so we can show "remaining /
  // initial" on the new Jokers row alongside the suit rows. Easy
  // ships 2, Medium / Hard 1, Extreme 0 (the row hides entirely in
  // that case).
  const jokerInDeckCount = deck.filter(isJoker).length;
  const totalJokers =
    jokerInDeckCount +
    grid.filter(c => c !== null && isJoker(c)).length +
    discards.filter(isJoker).length +
    perkSpent.filter(isJoker).length;

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
            {totalJokers > 0 && (
              <View style={styles.suitBlock}>
                <View style={styles.suitHeader}>
                  <Text style={[styles.suitLabel, { color: colors.joker }]}>
                    ★ Jokers
                  </Text>
                  <Text style={styles.suitCount}>
                    {jokerInDeckCount} / {totalJokers}
                  </Text>
                </View>
                <View style={styles.rankRow}>
                  {Array.from({ length: totalJokers }, (_, i) => (
                    <JokerCell
                      key={i}
                      // The first `jokerInDeckCount` cells are present;
                      // the rest are drawn (on grid, destroyed, or
                      // perk-spent). Individual jokers are
                      // indistinguishable, so we just light up the
                      // first N cells.
                      present={i < jokerInDeckCount}
                    />
                  ))}
                </View>
              </View>
            )}
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
          ? { color, textShadowColor: color, textShadowRadius: 2 }
          : { color: colors.textLow, textDecorationLine: 'line-through' },
      ]}
    >
      {rank}
    </Text>
  </View>
);

// Joker cell mirrors RankCell but uses the joker glyph (★) instead of
// a rank label. Present jokers are violet + glowing; drawn jokers are
// dimmed (we don't strike through since the ★ glyph doesn't combine
// cleanly with text-decoration the way letter ranks do).
const JokerCell = ({ present }: { present: boolean }) => (
  <View
    style={[
      styles.rankCell,
      present
        ? { borderColor: colors.joker }
        : { borderColor: colors.outlineSoft, opacity: 0.4 },
    ]}
  >
    <Text
      style={[
        styles.rankText,
        present
          ? { color: colors.joker, textShadowColor: colors.joker, textShadowRadius: 2 }
          : { color: colors.textLow },
      ]}
    >
      ★
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
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  scroll: { marginTop: spacing.sm },
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
    textShadowRadius: 2,
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
