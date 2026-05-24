import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { useSettings } from './settings';

// Type of feedback. We map to expo-haptics' impact / notification API
// internally so callers don't need to know which is appropriate.
//
// expo-haptics handles platform differences itself:
//   - iOS / Android Expo Go: uses native Taptic / vibration motor
//   - Web: falls back to navigator.vibrate (works on mobile browsers
//     that support the Vibration API; desktop browsers no-op)
//
// Earlier versions of this file had a hand-rolled `webVibrate` branch that
// short-circuited expo-haptics on web. That meant on iOS Safari (no
// Vibration API) we silently did nothing and on native we were going through
// the right path — so removing it doesn't change observable behavior, just
// cuts code. The current version trusts the SDK on every platform.
export type HapticKind =
  | 'light'    // tap, button press
  | 'medium'   // place card, draw
  | 'heavy'    // destroy, dramatic action
  | 'success'  // win
  | 'warning'  // attempt invalid action
  | 'error';   // loss

export const trigger = (kind: HapticKind) => {
  switch (kind) {
    case 'light': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    case 'medium': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    case 'heavy': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    case 'success': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    case 'warning': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    case 'error': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
