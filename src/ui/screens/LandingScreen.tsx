// First screen on launch. Two big buttons: today's Daily Grid and Free
// Play. Carries the brand wordmark (which used to live on Home — now
// Home becomes a "Free Play" sub-screen). The Daily Grid button shows
// a small "already played · score" pill when the player has finished
// today's daily.

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { DailyRulesModal } from '../components/DailyRulesModal';
import { useDaily } from '../daily/DailyProvider';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  // Called when the player confirms today's daily from the rules
  // modal. The parent (App.tsx) wires this up to set the daily
  // PlayContext + navigate to the game screen.
  onStartDaily: () => void;
  // Called when the player taps Free Play. Routes to HomeScreen.
  onOpenFreePlay: () => void;
  // Called when the player taps an already-completed daily — opens the
  // result screen for that play.
  onOpenDailyResult: () => void;
}

const NeonBrand = () => {
  const { settings } = useSettings();
  const pulse = useSharedValue(0.7);
  useEffect(() => {
    if (settings.reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [settings.reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({
    textShadowRadius: 4 + pulse.value * 14,
    opacity: 0.85 + pulse.value * 0.15,
  }));
  return <Animated.Text style={[styles.brandTitle, style]}>POKERGRID</Animated.Text>;
};

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

export const LandingScreen = ({
  onStartDaily,
  onOpenFreePlay,
  onOpenDailyResult,
}: Props) => {
  const { plays, todayISO, todayRecipe } = useDaily();
  const [rulesOpen, setRulesOpen] = useState(false);

  // Plays map is null while the lazy bootstrap reads AsyncStorage.
  // Don't decide "already played?" until we know the answer — otherwise
  // we'd flash the wrong CTA for a frame on every cold launch.
  const todayPlay = plays?.[todayISO];
  const dailyLoaded = plays !== null;

  const onDailyPress = () => {
    if (!dailyLoaded) return;
    if (todayPlay) {
      onOpenDailyResult();
      return;
    }
    setRulesOpen(true);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.subtitle}>5×5 poker solitaire</Text>
        <NeonBrand />
        <Text style={styles.dateLine}>{formatDate(todayISO)} · UTC</Text>
      </View>

      <View style={styles.modeStack}>
        <Pressable style={styles.modeCard} onPress={onDailyPress} disabled={!dailyLoaded}>
          <View style={styles.modeHeader}>
            <Text style={[styles.modeTitle, styles.modeTitleDaily]}>Daily Grid</Text>
            {todayPlay && (
              <Text style={styles.donePill}>· {todayPlay.score} pts</Text>
            )}
          </View>
          <Text style={styles.modeBody}>
            Today's seed, same for every player. One play per day. New
            grid at UTC midnight.
          </Text>
          <Text style={styles.modeCta}>
            {!dailyLoaded
              ? 'Loading…'
              : todayPlay
                ? 'View today\'s result →'
                : 'Play today\'s daily →'}
          </Text>
        </Pressable>

        <Pressable style={styles.modeCard} onPress={onOpenFreePlay}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>Free Play</Text>
          </View>
          <Text style={styles.modeBody}>
            Pick your difficulty. Targets Up ladder. Challenges with
            unique twists. Stats, achievements, settings.
          </Text>
          <Text style={styles.modeCta}>Open Free Play →</Text>
        </Pressable>
      </View>

      <DailyRulesModal
        visible={rulesOpen}
        dateISO={todayISO}
        recipe={todayRecipe}
        onStart={() => {
          setRulesOpen(false);
          onStartDaily();
        }}
        onClose={() => setRulesOpen(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  subtitle: {
    color: colors.suitH,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textShadowColor: colors.suitH,
    textShadowRadius: 6,
  },
  brandTitle: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 5,
    textShadowColor: colors.accent,
  },
  dateLine: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  modeStack: { gap: spacing.md },
  modeCard: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...glow(colors.accent, 6, 0.18),
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  modeTitle: {
    color: colors.warn,
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: colors.warn,
    textShadowRadius: 6,
  },
  modeTitleDaily: {
    color: colors.accent,
    textShadowColor: colors.accent,
  },
  donePill: {
    color: colors.success,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textShadowColor: colors.success,
    textShadowRadius: 3,
  },
  modeBody: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  modeCta: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
});
