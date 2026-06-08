// Revive special-card picker. Opens when the GameScreen sees
// phase === 'awaiting-special-revive-pick'. Shows every card in the
// discard pile as a tappable tile; tapping commits the revive by
// dispatching RESOLVE_REVIVE with the picked index.
//
// Same modal aesthetic as the other info popups (RemainingDeckModal,
// DailyRulesModal, etc.) — cyan accent border + glow, max width 380,
// scrollable body.

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Card } from '../../game/cards';
import { CardTile } from './CardTile';
import { NeonButton } from './NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  discards: readonly Card[];
  onPick: (discardIdx: number) => void;
  onCancel: () => void;
}

export const DiscardPickerModal = ({
  visible,
  discards,
  onPick,
  onCancel,
}: Props) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
  >
    <Pressable style={styles.backdrop} onPress={onCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>★ REVIVE</Text>
            <Text style={styles.title}>Discard Pile</Text>
          </View>
          <Pressable onPress={onCancel} hitSlop={12}>
            <Text style={styles.closeBtn}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.body}>
          Tap a card to bring it back. It will land in the next
          spiral slot on the grid.
        </Text>

        {discards.length === 0 ? (
          <Text style={styles.empty}>The discard pile is empty.</Text>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {discards.map((c, i) => (
              <Pressable
                key={i}
                style={styles.cell}
                onPress={() => onPick(i)}
              >
                <CardTile card={c} size="sm" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.btnRow}>
          <NeonButton
            label="Cancel"
            variant="secondary"
            size="md"
            onPress={onCancel}
            style={{ flex: 1 }}
          />
        </View>
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
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  kicker: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 4,
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
  body: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  scroll: {
    maxHeight: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  cell: {
    // CardTile.sm renders ~32×46. Wrapping in a Pressable with a tap
    // surface that matches the tile keeps the tap area honest.
    padding: 2,
  },
  empty: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
