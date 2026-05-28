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
            A ladder. Level 1 starts at target 300; each win pushes the bar +50. Lose once and the
            run ends. Final score is the highest level you cleared.
          </Text>
          <Text style={styles.body}>
            Between levels, pick one of three bonus cards to keep AND choose a tier reward: A
            advances you, S supercharges a card (a "wild" or "double" that carries into the next
            grid), and SS supercharges two. The bonus cards you didn't keep return powered-up
            into the bonus deck on later levels, so the further you climb the more the deck
            reshapes itself.
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
