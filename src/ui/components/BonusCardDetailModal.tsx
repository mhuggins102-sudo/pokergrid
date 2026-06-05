import React, { useRef } from 'react';
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
  // Stash the most recently shown content so the fade-out animation
  // keeps rendering the same body after the parent clears its
  // nullable props on close. Without this:
  //   - clearing `card` killed the modal instantly (early-return),
  //   - clearing `currentValue` collapsed the "Currently contributing"
  //     row mid-fade,
  //   - clearing `onUse` hid the Use button mid-fade,
  // making the close look like the modal "shrinks to an empty box"
  // before vanishing.
  const lastCardRef = useRef<BonusCard | null>(null);
  const lastValueRef = useRef<number | undefined>(undefined);
  const lastOnUseRef = useRef<(() => void) | undefined>(undefined);
  if (card) {
    lastCardRef.current = card;
    lastValueRef.current = currentValue;
    lastOnUseRef.current = onUse;
  }
  const cardToShow = card ?? lastCardRef.current;
  const valueToShow = card ? currentValue : lastValueRef.current;
  const onUseToShow = card ? onUse : lastOnUseRef.current;
  if (!cardToShow) return null;
  const cat = styleFor(cardToShow);
  const showValue = valueToShow !== undefined;
  const showUse = !!onUseToShow && isSpecialCard(cardToShow) && !cardToShow.used;
  // Already-used specials surface a small "Already used" note in place
  // of the Use button so the player understands why the action is gone.
  const showUsedNote = isSpecialCard(cardToShow) && !!cardToShow.used;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { borderColor: cat.borderColor },
            glow(cat.borderColor, 18, 0.3),
          ]}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <View style={styles.kickerRow}>
              {settings.colorBlindAssist && (
                <Text style={[styles.icon, { color: cat.iconColor}]}>
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
              style={[styles.title, { color: cat.titleColor}]}
              numberOfLines={2}
            >
              {cardToShow.title}
            </Text>
            <Text style={styles.mult} numberOfLines={1}>{cardToShow.mult}</Text>
          </View>
          <Text style={styles.desc}>{cardToShow.description}</Text>

          {showValue && (
            <View style={styles.valueRow}>
              <Text style={styles.valueLabel}>Currently contributing</Text>
              <Text
                style={[
                  styles.valueValue,
                  valueToShow! > 0 && styles.valueActive,
                ]}
              >
                {valueToShow! > 0 ? `+${valueToShow}` : valueToShow === 0 ? '—' : `${valueToShow}`}
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
                  onUseToShow?.();
                  onClose();
                }}
              />
            </View>
          )}
          {showUsedNote && (
            <Text style={styles.usedNote}>Already used.</Text>
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
    maxWidth: 380,
    maxHeight: '88%',
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
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  mult: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  },
  useRow: {
    marginTop: spacing.lg,
    alignItems: 'stretch',
  },
  usedNote: {
    marginTop: spacing.lg,
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
