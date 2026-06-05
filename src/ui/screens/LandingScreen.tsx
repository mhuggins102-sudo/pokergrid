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
import { HandleEditorModal } from '../components/HandleEditorModal';
import { NeonButton } from '../components/NeonButton';
import { displayNameFor, useDaily } from '../daily/DailyProvider';
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
  // Sub-screens reachable from landing AND from Free Play home. The
  // parent owns the return-to-source bookkeeping so Back lands the
  // player where they came from regardless of entry point.
  onOpenRules: () => void;
  onOpenSettings: () => void;
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
  onOpenRules,
  onOpenSettings,
}: Props) => {
  const { plays, todayISO, todayRecipe, deviceId, handle } = useDaily();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [handleEditorOpen, setHandleEditorOpen] = useState(false);

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
        <Pressable
          style={styles.handlePill}
          onPress={() => setHandleEditorOpen(true)}
          hitSlop={6}
        >
          <Text style={styles.handlePillLabel}>Playing as</Text>
          <Text style={styles.handlePillName}>
            {displayNameFor(deviceId, handle)}
          </Text>
          <Text style={styles.handlePillEdit}>· edit</Text>
        </Pressable>
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
            Unlimited practice at your chosen difficulty. Play
            Challenges with unique twists and the Targets Up
            multi-round game.
          </Text>
          <Text style={styles.modeCta}>Open Free Play →</Text>
        </Pressable>
      </View>

      <View style={styles.navRow}>
        <NeonButton label="How to Play" variant="primary" size="md" onPress={onOpenRules} />
        <NeonButton label="Settings" variant="secondary" size="md" onPress={onOpenSettings} />
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
      <HandleEditorModal
        visible={handleEditorOpen}
        onClose={() => setHandleEditorOpen(false)}
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
  // "Playing as Anon-3f7c · edit" pill. Tappable to open the handle
  // editor. Sits under the date so the brand is the obvious focal
  // point and the identity is a secondary affordance.
  handlePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    backgroundColor: colors.bgPanel,
  },
  handlePillLabel: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  handlePillName: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: colors.accent,
    textShadowRadius: 3,
  },
  handlePillEdit: {
    color: colors.textLow,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
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
  // Mirrors HomeScreen's secondary nav row — How to Play + Settings are
  // reachable from both entry points (landing and Free Play home) so
  // the player doesn't have to back out to find them.
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xl,
    flexWrap: 'wrap',
  },
});
