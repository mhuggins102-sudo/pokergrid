import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BonusCard } from '../../game/bonusCards';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  card: BonusCard | null;
  // Optional current contribution to the live score (from Shapley values).
  // When provided we show it below the description.
  currentValue?: number;
  onClose: () => void;
}

const groupFor = (id: string): string => {
  if (id.startsWith('hand-')) return 'Hand-type bonus';
  if (id.startsWith('row-') || id.startsWith('col-')) return 'Row / Column bonus';
  if (id.startsWith('suit-density-')) return 'Per-suit density';
  if (
    id === 'outer-edge-x1_25' ||
    id === 'rainbow-line-x2' ||
    id === 'joker-line-x1_5' ||
    id === 'royal-touch-x1_5' ||
    id === 'spiral-core-x1_5'
  ) {
    return 'Per-line conditional';
  }
  return 'Grid achievement';
};

export const BonusCardDetailModal = ({ visible, card, currentValue, onClose }: Props) => {
  if (!card) return null;
  const group = groupFor(card.id);
  const showValue = currentValue !== undefined;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>{group}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.name}>{card.name}</Text>
          <Text style={styles.desc}>{card.description}</Text>

          {showValue && (
            <View style={styles.valueRow}>
              <Text style={styles.valueLabel}>Currently contributing</Text>
              <Text
                style={[
                  styles.valueValue,
                  currentValue! > 0 && styles.valueActive,
                ]}
              >
                {currentValue! > 0 ? `+${currentValue}` : currentValue === 0 ? '—' : `${currentValue}`}
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

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
    maxWidth: 340,
    backgroundColor: colors.bgPanel,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...glow(colors.warn, 16, 0.3),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  kicker: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  name: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: colors.warn,
    textShadowRadius: 6,
    marginBottom: spacing.sm,
  },
  desc: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
  },
  valueRow: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  valueLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  valueValue: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '800',
  },
  valueActive: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 4,
  },
});
