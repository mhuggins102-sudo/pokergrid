// Pre-game popup for Daily Grid. Shown when the player taps "Today's
// Daily" from the landing screen on a date they haven't completed yet.
// Surfaces the recipe (difficulty + future twist) so the player knows
// what they're committing to before Start.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DailyRecipe } from '../../game/daily/recipe';
import { findChallenge } from '../../game/challenges';
import { TARGET_BY_DIFFICULTY } from '../../game/rules';
import { NeonButton } from './NeonButton';
import { colors, difficultyColor, fonts, glow, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  dateISO: string;
  recipe: DailyRecipe;
  onStart: () => void;
  onClose: () => void;
}

const formatDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
};

const DIFFICULTY_LABEL: Record<DailyRecipe['difficulty'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  extreme: 'Extreme',
};

const DIFFICULTY_TAGLINE: Record<DailyRecipe['difficulty'], string> = {
  easy: 'Gentle warm-up. 2 jokers, full toolkit.',
  medium: 'Steady challenge. 1 joker, full toolkit.',
  hard: 'Tough. 1 joker, no undo, no deck peek.',
  extreme: 'Brutal. No jokers, no discards, no undo.',
};

export const DailyRulesModal = ({
  visible,
  dateISO,
  recipe,
  onStart,
  onClose,
}: Props) => {
  const diffColor = difficultyColor(recipe.difficulty);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>DAILY GRID</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.dateLine}>{formatDate(dateISO)}</Text>

          <View style={styles.divider} />

          <View style={styles.recipeRow}>
            <Text style={styles.recipeLabel}>Difficulty</Text>
            <Text
              style={[
                styles.recipeValue,
                { color: diffColor},
              ]}
            >
              {DIFFICULTY_LABEL[recipe.difficulty]}
            </Text>
          </View>
          <Text style={styles.recipeTagline}>{DIFFICULTY_TAGLINE[recipe.difficulty]}</Text>

          {recipe.twist ? (
            <>
              <View style={styles.recipeRow}>
                <Text style={styles.recipeLabel}>Twist</Text>
                <Text style={styles.recipeValueTwist}>
                  {findChallenge(recipe.twist).name}
                </Text>
              </View>
              <Text style={styles.twistSynopsis}>
                {findChallenge(recipe.twist).synopsis}
              </Text>
              <View style={styles.recipeRow}>
                <Text style={styles.recipeLabel}>Target</Text>
                <Text style={styles.recipeValueNeutral}>
                  {findChallenge(recipe.twist).scoreTarget}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.recipeRow}>
              <Text style={styles.recipeLabel}>Target</Text>
              <Text style={styles.recipeValueNeutral}>
                {TARGET_BY_DIFFICULTY[recipe.difficulty]}
              </Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <NeonButton
              label="Not now"
              variant="secondary"
              size="md"
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <NeonButton
              label="Start →"
              variant="primary"
              size="md"
              onPress={onStart}
              style={{ flex: 1 }}
            />
          </View>
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
  kicker: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
  },
  closeBtn: {
    color: colors.textMid,
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  dateLine: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outlineSoft,
    marginBottom: spacing.sm,
  },
  recipeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: spacing.xs,
  },
  recipeLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  recipeValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  recipeValueNeutral: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  recipeValueTwist: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  twistSynopsis: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomColor: colors.outlineSoft,
    borderBottomWidth: 1,
  },
  recipeTagline: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomColor: colors.outlineSoft,
    borderBottomWidth: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
