import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BONUS_DECLINE_AT_CAP_BY_DIFFICULTY,
  CAN_PREVIEW_DECK_BY_DIFFICULTY,
  Difficulty,
  JOKERS_BY_DIFFICULTY,
  NO_DISCARDS_BY_DIFFICULTY,
  STARTER_BONUS_BY_DIFFICULTY,
  TARGET_BY_DIFFICULTY,
  UNDOS_BY_DIFFICULTY,
} from '../../game/rules';
import { colors, difficultyColor, fonts, glow, radius, spacing } from '../theme';

// All four free-play difficulty modes, in the order they appear on Home.
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
  extreme: 'Extr',
};

interface Row {
  label: string;
  value: (d: Difficulty) => string;
}

// Row order matches the spec: most-important / always-true (Target,
// Jokers, Starting Bonus) at the top, situational toggles (Deck Peek,
// Discards, Decline Bonus) in the middle, and Undos at the bottom.
const ROWS: Row[] = [
  { label: 'Target',         value: d => `${TARGET_BY_DIFFICULTY[d]}` },
  { label: 'Jokers',         value: d => `${JOKERS_BY_DIFFICULTY[d]}` },
  { label: 'Starting Bonus', value: d => `${STARTER_BONUS_BY_DIFFICULTY[d]}` },
  { label: 'Deck Peek',      value: d => CAN_PREVIEW_DECK_BY_DIFFICULTY[d] ? '✓' : '✗' },
  { label: 'Discards',       value: d => NO_DISCARDS_BY_DIFFICULTY[d] ? '✗' : '✓' },
  { label: 'Decline Bonus',  value: d => BONUS_DECLINE_AT_CAP_BY_DIFFICULTY[d] ? '✓' : '✗' },
  { label: 'Undos',          value: d => `${UNDOS_BY_DIFFICULTY[d]}` },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const DifficultyInfoModal = ({ visible, onClose }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Difficulty Modes</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.intro}>
          Free-play knobs by difficulty. Targets Up still maps levels to Easy / Medium / Hard automatically; Challenges always run on the Hard ruleset.
        </Text>
        <Text style={styles.intro}>
          Note: Extreme shares Medium's 450 target on paper, but it strips every assist — no jokers, no discards, no deck peek, no undo — so it's the toughest mode despite the matching number.
        </Text>

        <ScrollView style={styles.scroll}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.cell, styles.labelCell, styles.headerText]} />
            {DIFFS.map(d => (
              <Text
                key={d}
                style={[
                  styles.cell,
                  styles.diffCell,
                  styles.headerText,
                  { color: difficultyColor(d), textShadowColor: difficultyColor(d) },
                ]}
              >
                {DIFF_LABEL[d]}
              </Text>
            ))}
          </View>
          {ROWS.map((row, i) => (
            <View
              key={row.label}
              style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
            >
              <Text style={[styles.cell, styles.labelCell, styles.labelText]}>
                {row.label}
              </Text>
              {DIFFS.map(d => {
                const v = row.value(d);
                const isCheck = v === '✓';
                const isCross = v === '✗';
                return (
                  <Text
                    key={d}
                    style={[
                      styles.cell,
                      styles.diffCell,
                      styles.valueText,
                      isCheck && styles.checkText,
                      isCross && styles.crossText,
                    ]}
                  >
                    {v}
                  </Text>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <Text style={styles.footnote}>
          "Decline Bonus" — when you're holding 3 bonus cards and draw a ♣, you may pass on the new pair instead of being forced to swap one out.
        </Text>
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
    marginBottom: spacing.xs,
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
  intro: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  scroll: { maxHeight: 380 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineSoft,
    paddingVertical: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  cell: {
    paddingHorizontal: 2,
  },
  labelCell: {
    flex: 1,
  },
  diffCell: {
    width: 48,
    textAlign: 'center',
  },
  headerText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  labelText: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  valueText: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
  },
  checkText: {
    color: colors.success,
    textShadowColor: colors.success,
    textShadowRadius: 3,
  },
  crossText: {
    color: colors.danger,
  },
  footnote: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: spacing.md,
    lineHeight: 14,
  },
});
