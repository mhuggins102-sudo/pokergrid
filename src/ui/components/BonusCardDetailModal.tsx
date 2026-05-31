import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BonusCard, isSpecialCard } from '../../game/bonusCards';
import { styleFor } from '../bonusCardCategory';
import { NeonButton } from './NeonButton';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  card: BonusCard | null;
  // Optional current contribution to the live score (from Shapley values).
  // When provided we show it below the description.
  currentValue?: number;
  onClose: () => void;
  // Three Tricks: when the card is a one-time action, this callback
  // wires the modal's "Use" button to the activation flow. Omitted in
  // normal play, since standard bonus cards aren't manually activated.
  onUse?: () => void;
}

export const BonusCardDetailModal = ({ visible, card, currentValue, onClose, onUse }: Props) => {
  const { settings } = useSettings();
  if (!card) return null;
  const cat = styleFor(card);
  const showValue = currentValue !== undefined;
  const showUse = !!onUse && isSpecialCard(card);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { borderColor: cat.borderColor },
            glow(cat.borderColor, 16, 0.3),
          ]}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <View style={styles.kickerRow}>
              {settings.colorBlindAssist && (
                <Text style={[styles.icon, { color: cat.iconColor, textShadowColor: cat.iconColor }]}>
                  {cat.icon}
                </Text>
              )}
              <Text style={styles.kicker}>{cat.label}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <View style={styles.titleRow}>
            <Text
              style={[styles.title, { color: cat.titleColor, textShadowColor: cat.titleColor }]}
              numberOfLines={2}
            >
              {card.title}
            </Text>
            <Text style={styles.mult} numberOfLines={1}>{card.mult}</Text>
          </View>
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
          {showUse && (
            <View style={styles.useRow}>
              <NeonButton
                label="Use"
                variant="primary"
                size="md"
                onPress={() => {
                  onUse?.();
                  onClose();
                }}
              />
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
    // borderColor + glow set inline from the card's category tone.
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  icon: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    textShadowRadius: 4,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    // color + textShadowColor set inline from category tone.
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowRadius: 6,
  },
  mult: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: colors.success,
    textShadowRadius: 4,
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
  useRow: {
    marginTop: spacing.lg,
    alignItems: 'stretch',
  },
});
