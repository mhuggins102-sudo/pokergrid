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

const trigger = (kind: HapticKind) => {
  // expo-haptics is a no-op on web in some browsers, but the call is safe.
  // Avoid awaiting — fire-and-forget.
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
      // Web's Vibration API support is spotty — only fire on native.
      if (Platform.OS === 'web') return;
      trigger(kind);
    },
    [settings.haptics]
  );
};
