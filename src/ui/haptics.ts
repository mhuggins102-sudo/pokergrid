import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useSettings } from './settings';

// Type of feedback. We map to expo-haptics' impact / notification API
// internally so callers don't need to know which is appropriate.
export type HapticKind =
  | 'light'    // tap, button press
  | 'medium'   // place card, draw
  | 'heavy'    // destroy, dramatic action
  | 'success'  // win
  | 'warning'  // attempt invalid action
  | 'error';   // loss

// Web fallback: vibrate via the Vibration API. Desktop browsers ignore it,
// but mobile browsers (Chrome on Android, some others) honor it.
const webVibrate = (pattern: number | number[]) => {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === 'function') nav.vibrate(pattern);
};

const trigger = (kind: HapticKind) => {
  if (Platform.OS === 'web') {
    switch (kind) {
      case 'light':   return webVibrate(10);
      case 'medium':  return webVibrate(20);
      case 'heavy':   return webVibrate(40);
      case 'success': return webVibrate([10, 40, 10]);
      case 'warning': return webVibrate([20, 20]);
      case 'error':   return webVibrate([40, 30, 40]);
    }
    return;
  }
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
