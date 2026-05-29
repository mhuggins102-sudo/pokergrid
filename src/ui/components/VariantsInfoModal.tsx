import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const VariantsInfoModal = ({ visible, onClose }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Variants</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>×</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll}>
          <Text style={styles.variantHeader}>Targets Up</Text>
          <Text style={styles.body}>
            Meet the target and advance to the next level. Level 1 starts at target 350; each
            win pushes the bar +25 through Level 7 (target 500), then +50 each level after that.
            Lose once and the run ends. Final score is the highest level you cleared.
          </Text>
          <Text style={styles.body}>
            Between levels, if your score greatly exceeds the target you'll have the
            opportunity to supercharge a deck card and/or bonus card. Supercharged bonus cards
            increase their multiplier by 1.2×; supercharged deck cards transform into either a
            wild or "double" (counts as two of the same card).
          </Text>

          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableHead]}>Rating</Text>
              <Text style={[styles.tableCell, styles.tableHead]}>Score</Text>
              <Text style={[styles.tableCell, styles.tableHead]}>Benefit</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>A</Text>
              <Text style={styles.tableCell}>≥ target</Text>
              <Text style={styles.tableCell}>None</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>S</Text>
              <Text style={styles.tableCell}>≥ 1.3× target</Text>
              <Text style={styles.tableCell}>Choose one</Text>
            </View>
            <View style={[styles.tableRow, styles.tableRowLast]}>
              <Text style={styles.tableCell}>SS</Text>
              <Text style={styles.tableCell}>≥ 1.6× target</Text>
              <Text style={styles.tableCell}>Both</Text>
            </View>
          </View>

          <Text style={styles.body}>
            Powered-up cards stay that way for the remainder of the Targets Up game.
          </Text>

          <Text style={styles.variantHeader}>Challenges</Text>
          <Text style={styles.body}>
            Playable variants that change how the deck or the rules work. Each one has its own
            score target shown on the Challenges page — clear it to mark the challenge complete.
          </Text>
          <Text style={styles.body}>
            All challenges run on the Hard ruleset: 1 joker, no undos, no starting bonus card,
            and ♣ at the bonus-hand cap forces a swap.
          </Text>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
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
  scroll: { maxHeight: 460 },
  variantHeader: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 4,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  // Three-column ratings table for the Targets Up tier system. The
  // wrapper handles the outer border + the bottom-divider on each row
  // (skipped on the last row via tableRowLast) so we don't double up
  // a heavy bottom border. Cells flex 1:1:1 so any cell text length
  // stays evenly distributed.
  table: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outline,
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCell: {
    flex: 1,
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tableHead: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  note: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    backgroundColor: 'rgba(107, 214, 255, 0.06)',
  },
});
