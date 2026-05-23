import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { NeonButton } from '../components/NeonButton';
import { colors, fonts, glow, radius, spacing } from '../theme';

const TUTORIAL_SEEN_KEY = 'pokergrid:tutorial-seen:v1';

export const markTutorialSeen = () =>
  AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});

export const tutorialSeen = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
    return v === '1';
  } catch {
    return false;
  }
};

interface Step {
  kicker: string;
  title: string;
  copy: string;
  accent: string;
}

const STEPS: Step[] = [
  {
    kicker: 'PLACE',
    title: 'Cards fill a spiral',
    copy: 'Drawn cards fill the grid in a spiral from the center outward. The next slot pulses cyan so you always know where the next placed card lands.',
    accent: colors.accent,
  },
  {
    kicker: '♥ ♠ ♦ ♣',
    title: 'Each suit has a perk',
    copy: '♥ Swap two cards in a row or column.   ♠ Slide a chain of cards in one direction.   ♦ Destroy a card on the grid.   ♣ Draw a bonus card.',
    accent: colors.suitH,
  },
  {
    kicker: 'BONUS',
    title: 'Bonus cards stack ×',
    copy: 'Hold up to 3 bonus cards. They multiply line scores and grid totals — and the multipliers compose multiplicatively, so stacking them goes a long way.',
    accent: colors.warn,
  },
  {
    kicker: 'SCORE',
    title: 'Lines + achievements',
    copy: 'At the end, score 5 rows + 5 columns as poker hands. Incomplete lines (under 5 cards) cost 25 points each. Grid achievements multiply the whole total.',
    accent: colors.success,
  },
];

interface Props {
  onDone: () => void;
}

export const TutorialScreen = ({ onDone }: Props) => {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  const finish = () => {
    markTutorialSeen();
    onDone();
  };

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        {STEPS.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx === i && { backgroundColor: step.accent, ...glow(step.accent, 6, 0.7) },
            ]}
          />
        ))}
      </View>

      <Animated.View
        key={i}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(180)}
        style={[styles.card, { borderColor: step.accent }, glow(step.accent, 16, 0.4)]}
      >
        <Text style={[styles.kicker, { color: step.accent, textShadowColor: step.accent }]}>
          {step.kicker}
        </Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.copy}>{step.copy}</Text>
      </Animated.View>

      <View style={styles.actions}>
        <NeonButton
          label="Skip"
          variant="ghost"
          size="sm"
          onPress={finish}
        />
        <View style={styles.spacer} />
        {i > 0 && (
          <NeonButton
            label="Back"
            variant="secondary"
            size="md"
            onPress={() => setI(i - 1)}
          />
        )}
        <NeonButton
          label={isLast ? 'Got it' : 'Next'}
          variant="primary"
          size="md"
          onPress={isLast ? finish : () => setI(i + 1)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBase,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  dot: {
    width: 30,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bgRaised,
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginVertical: spacing.xl,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: '800',
    marginBottom: spacing.md,
    textShadowRadius: 6,
  },
  title: {
    fontFamily: fonts.mono,
    color: colors.textHi,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  copy: {
    fontFamily: fonts.sans,
    color: colors.textMid,
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  spacer: { flex: 1 },
});
