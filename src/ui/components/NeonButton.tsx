import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSettings } from '../settings';
import { colors, fonts, glow, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'warn' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  style?: ViewStyle;
}

const TINT: Record<
  Variant,
  { border: string; text: string; bg: string; borderW: number }
> = {
  primary: { border: colors.accent, text: colors.accent, bg: 'rgba(107, 214, 255, 0.08)', borderW: 1.5 },
  // Secondary's border was outlineStrong @ 35% alpha — bright enough
  // for a quiet "cancel" but visibly thinner than the colored variants
  // when placed next to them as a peer action (e.g. Discard alongside
  // Place / Perk). Bump width to 2 so the perceived weight matches.
  secondary: { border: colors.outlineStrong, text: colors.textMid, bg: 'rgba(255,255,255,0.02)', borderW: 2 },
  danger: { border: colors.danger, text: colors.danger, bg: 'rgba(255, 100, 100, 0.06)', borderW: 1.5 },
  warn: { border: colors.warn, text: colors.warn, bg: 'rgba(255, 183, 74, 0.06)', borderW: 1.5 },
  ghost: { border: 'transparent', text: colors.textMid, bg: 'transparent', borderW: 1.5 },
};

const PADDING: Record<Size, { v: number; h: number; font: number }> = {
  sm: { v: 6, h: 10, font: 11 },
  md: { v: 10, h: 14, font: 13 },
  lg: { v: 14, h: 18, font: 15 },
};

export const NeonButton = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: Props) => {
  const tint = TINT[variant];
  const pad = PADDING[size];
  const { settings } = useSettings();
  const pressed = useSharedValue(0);

  const onPressIn = () => {
    if (settings.reduceMotion) return;
    pressed.value = withTiming(1, { duration: 80 });
  };
  const onPressOut = () => {
    pressed.value = withTiming(0, { duration: 140 });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.04 }],
  }));

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={style}
    >
      <Animated.View
        style={[
          styles.btn,
          {
            paddingVertical: pad.v,
            paddingHorizontal: pad.h,
            borderColor: tint.border,
            borderWidth: tint.borderW,
            backgroundColor: tint.bg,
          },
          variant !== 'ghost' && !disabled && glow(tint.border, 8, 0.4),
          disabled && styles.disabled,
          animStyle,
        ]}
      >
        <Text
          style={[
            styles.label,
            {
              color: tint.text,
              fontSize: pad.font,
              textShadowColor: tint.text,
            },
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    // Fill the Pressable in both axes so explicit `height` / `width` /
    // `flex` props from the consumer reach the visual button.
    alignSelf: 'stretch',
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // borderWidth is set per-variant via tint.borderW so callers like
    // the in-game Discard button can read at the same visual weight as
    // the primary / warn / danger variants beside it.
  },
  label: {
    fontFamily: fonts.mono,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textShadowRadius: 4,
  },
  disabled: {
    opacity: 0.4,
  },
  labelDisabled: {
    textShadowRadius: 0,
  },
});
