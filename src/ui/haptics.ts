import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { useSettings } from './settings';

// PokerGrid haptic feedback.
//
// Two kinds of haptic identifiers:
//
//   - Intensity primitives (light / medium / heavy / success / warning /
//     error). These map 1:1 to expo-haptics' impact / notification API and
//     are used for generic UI feedback (button taps, win/lose banners).
//
//   - Domain compounds (place / swap / slide / destroy / bonus / joker).
//     These are scheduled patterns — a quick double-tap for a Hearts swap,
//     a heavy + light decay for a Diamond destroy — so each in-game action
//     has a recognizable feel without relying on the colors / animations.
//
// expo-haptics handles platform differences:
//   - iOS / Android Expo: native Taptic / vibration motor
//   - Web: falls back to navigator.vibrate (Android Chrome only; iOS
//     Safari and most desktops no-op silently)
// So on iPhone Safari / desktop browsers haptics will appear silent even
// though the code is correct — this is a platform limitation, not a bug.

export type HapticKind =
  // Intensity primitives
  | 'light'    // tap, button press
  | 'medium'   // generic confirm
  | 'heavy'    // dramatic action
  | 'success'  // win banner, bonus accepted
  | 'warning'  // invalid action attempt
  | 'error'    // loss banner
  // Domain compounds — each in-game action has a distinct pattern
  | 'place'
  | 'swap'
  | 'slide'
  | 'destroy'
  | 'bonus'
  | 'joker';

// Each compound is a sequence of (delayMs, primitive) pairs. The first
// pulse always fires immediately; subsequent pulses are scheduled with
// setTimeout. Kept short (under ~150ms total) so the player doesn't feel
// a lag between input and feedback.
type Pulse = (() => Promise<void>);

const impact = (style: Haptics.ImpactFeedbackStyle): Pulse =>
  () => Haptics.impactAsync(style).catch(() => {});
const notify = (type: Haptics.NotificationFeedbackType): Pulse =>
  () => Haptics.notificationAsync(type).catch(() => {});

const L = impact(Haptics.ImpactFeedbackStyle.Light);
const M = impact(Haptics.ImpactFeedbackStyle.Medium);
const H = impact(Haptics.ImpactFeedbackStyle.Heavy);
const OK = notify(Haptics.NotificationFeedbackType.Success);
const WARN = notify(Haptics.NotificationFeedbackType.Warning);
const ERR = notify(Haptics.NotificationFeedbackType.Error);

const PATTERN: Record<HapticKind, ReadonlyArray<readonly [number, Pulse]>> = {
  light:   [[0, L]],
  medium:  [[0, M]],
  heavy:   [[0, H]],
  success: [[0, OK]],
  warning: [[0, WARN]],
  error:   [[0, ERR]],
  // Place a card: single firm tap.
  place:   [[0, M]],
  // Swap two cards: paired light → medium so it reads as "two cards
  // touching, then settling."
  swap:    [[0, L], [60, M]],
  // Slide a chain: medium tap, then a softer trailing light to suggest
  // the cards' momentum settling into the new slot.
  slide:   [[0, M], [80, L]],
  // Destroy: heavy thump followed by a tiny dust-settle tap.
  destroy: [[0, H], [90, L]],
  // Bonus drawn / kept: subtle success notification.
  bonus:   [[0, OK]],
  // Joker auto-place: success notification + light underline so it
  // stands out from a regular Place.
  joker:   [[0, OK], [70, L]],
};

export const trigger = (kind: HapticKind): void => {
  const seq = PATTERN[kind];
  for (const [delay, pulse] of seq) {
    if (delay === 0) {
      pulse();
    } else {
      setTimeout(pulse, delay);
    }
  }
};

export const useHaptic = () => {
  const { settings } = useSettings();
  return useCallback(
    (kind: HapticKind) => {
      if (!settings.haptics) return;
      trigger(kind);
    },
    [settings.haptics]
  );
};
