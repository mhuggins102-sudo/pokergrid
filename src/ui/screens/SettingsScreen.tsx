import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { NeonButton } from '../components/NeonButton';
import { trigger } from '../haptics';
import { resetHintsPatch, useSettings } from '../settings';
import { useSound } from '../sound';
import { useStats } from '../stats';
import { clearTutorialSeen } from './TutorialScreen';
import { colors, fonts, glow, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
  // Re-arms the first-run Rules popup and jumps straight into the tutorial
  // so a player who skipped onboarding can get it back.
  onReplayTutorial: () => void;
}

const Switch = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) => {
  const pos = useSharedValue(value ? 1 : 0);
  React.useEffect(() => {
    pos.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, pos]);
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * 22 }],
  }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: value ? colors.accent : colors.bgRaised,
    borderColor: value ? colors.accent : colors.outline,
  }));
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8}>
      <Animated.View
        style={[
          styles.track,
          value && glow(colors.accent, 8, 0.5),
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            { backgroundColor: value ? colors.bgBase : colors.textMid },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
};

const Toggle = ({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      {desc && <Text style={styles.rowDesc}>{desc}</Text>}
    </View>
    <Switch value={value} onChange={onChange} />
  </View>
);

export const SettingsScreen = ({ onBack, onReplayTutorial }: Props) => {
  const { settings, update } = useSettings();
  const { reset } = useStats();
  const playSound = useSound();
  const [confirmReset, setConfirmReset] = useState(false);
  const [hintsReset, setHintsReset] = useState(false);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
        <NeonButton label="Back" variant="ghost" size="sm" onPress={onBack} />
      </View>

      <Text style={styles.sectionLabel}>Feel</Text>
      <Toggle
        label="Haptics"
        desc="Vibration feedback on actions. Native iOS / Android: Taptic / vibration motor. Mobile browsers: Web Vibration API (desktop browsers ignore this)."
        value={settings.haptics}
        onChange={v => update({ haptics: v })}
      />
      {settings.haptics && (
        <Pressable
          style={styles.tryBtn}
          onPress={() => trigger('medium')}
        >
          <Text style={styles.tryBtnLabel}>Try a haptic</Text>
        </Pressable>
      )}
      <Toggle
        label="Sounds"
        desc="Sound effects on draw, place, score reveal."
        value={settings.sounds}
        onChange={v => update({ sounds: v })}
      />
      {settings.sounds && (
        <Pressable
          style={styles.tryBtn}
          onPress={() => playSound('place')}
        >
          <Text style={styles.tryBtnLabel}>Try a sound</Text>
        </Pressable>
      )}
      <Toggle
        label="Reduce motion"
        desc="Disable animations and pulsing. Improves readability."
        value={settings.reduceMotion}
        onChange={v => update({ reduceMotion: v })}
      />
      <Toggle
        label="Color-blind assist"
        desc="High-contrast rank text and bigger suit glyphs, plus a letter cue (H/S/D/C). Color is no longer the primary distinguisher."
        value={settings.colorBlindAssist}
        onChange={v => update({ colorBlindAssist: v })}
      />
      <Toggle
        label="2-color deck"
        desc="Standard playing-card palette: red for ♥/♦, pale-white for ♠/♣. Off by default (4 distinct neon colors per suit)."
        value={settings.twoColorDeck}
        onChange={v => update({ twoColorDeck: v })}
      />

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Help</Text>
      <Text style={styles.copy}>
        New here, or want a refresher? Replay the walkthrough, or re-arm the
        one-time pop-up tips that explain jokers, bonus cards, and the suit perks
        as they first come up in a game.
      </Text>
      <View style={styles.helpRow}>
        <NeonButton
          label="Replay tutorial"
          variant="primary"
          size="sm"
          onPress={() => {
            clearTutorialSeen();
            onReplayTutorial();
          }}
        />
        <NeonButton
          label={hintsReset ? 'Hints reset ✓' : 'Reset first-time hints'}
          variant="secondary"
          size="sm"
          disabled={hintsReset}
          onPress={() => {
            update(resetHintsPatch());
            setHintsReset(true);
          }}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Data</Text>
      <Text style={styles.copy}>
        Stats and preferences are stored locally on this device. Clearing the browser data or
        deleting the app removes them.
      </Text>
      {!confirmReset ? (
        <NeonButton
          label="Reset stats"
          variant="danger"
          onPress={() => setConfirmReset(true)}
        />
      ) : (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>Erase all stats and history?</Text>
          <View style={styles.confirmBtns}>
            <NeonButton
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => setConfirmReset(false)}
            />
            <NeonButton
              label="Yes, reset"
              variant="danger"
              size="sm"
              onPress={() => {
                reset();
                setConfirmReset(false);
              }}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textHi,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    color: colors.textMid,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.outlineSoft,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: {
    color: colors.textHi,
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '700',
  },
  rowDesc: {
    color: colors.textLow,
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 1,
    justifyContent: 'center',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  tryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    marginTop: 4,
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(107, 214, 255, 0.04)',
  },
  tryBtnLabel: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  helpRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.outlineSoft, marginVertical: spacing.lg },
  copy: {
    color: colors.textMid,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  confirmRow: { gap: spacing.sm },
  confirmText: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  confirmBtns: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
});
