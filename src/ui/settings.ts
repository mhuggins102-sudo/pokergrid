import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

// Persistent user preferences, exposed via a context + hook.

export interface Settings {
  haptics: boolean;
  sounds: boolean;
  reduceMotion: boolean;
  // When true, augments the per-suit color with a glyph/pattern accent so that
  // suits remain distinguishable even when colors are hard to tell apart.
  colorBlindAssist: boolean;
  // When true, use the standard 2-color playing-card palette (red for ♥/♦,
  // pale-white for ♠/♣) instead of the default 4-color neon palette.
  twoColorDeck: boolean;
  // True once the player has acknowledged the first-time undo warning
  // ("undoing taints the run for stats"). Persists so we only show the
  // confirmation modal once across the lifetime of the app.
  undoWarningSeen: boolean;
  // First-time contextual hints. Each fires exactly once per device the
  // first time the relevant in-game condition appears (joker on the grid,
  // bonus hand full at 3 cards, a held grid-effect bonus card actually
  // firing, each suit perk's target UI, first scoring line, etc.).
  // Dismissing the modal flips the corresponding flag.
  seenJokerHint: boolean;
  seenBonusCapHint: boolean;
  seenGridEffectHint: boolean;
  seenHeartsSwapHint: boolean;
  seenSpadesSlideHint: boolean;
  seenDiamondsDestroyHint: boolean;
  seenClubsBonusHint: boolean;
  seenBonusHeldHint: boolean;
  seenFirstScoringLineHint: boolean;
  seenScoringInfoHint: boolean;
  seenLowDeckHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  haptics: true,
  sounds: true,
  reduceMotion: false,
  colorBlindAssist: false,
  twoColorDeck: false,
  undoWarningSeen: false,
  seenJokerHint: false,
  seenBonusCapHint: false,
  seenGridEffectHint: false,
  seenHeartsSwapHint: false,
  seenSpadesSlideHint: false,
  seenDiamondsDestroyHint: false,
  seenClubsBonusHint: false,
  seenBonusHeldHint: false,
  seenFirstScoringLineHint: false,
  seenScoringInfoHint: false,
  seenLowDeckHint: false,
};

// Every one-time-acknowledgement flag, in one place. Used by Settings →
// "Reset first-time hints" so re-arming them all doesn't mean hand-listing
// the keys at the call site (and silently missing one when a hint is added).
export const HINT_KEYS: (keyof Settings)[] = [
  'undoWarningSeen',
  'seenJokerHint',
  'seenBonusCapHint',
  'seenGridEffectHint',
  'seenHeartsSwapHint',
  'seenSpadesSlideHint',
  'seenDiamondsDestroyHint',
  'seenClubsBonusHint',
  'seenBonusHeldHint',
  'seenFirstScoringLineHint',
  'seenScoringInfoHint',
  'seenLowDeckHint',
];

// Build a patch that sets every hint flag back to false (un-seen).
export const resetHintsPatch = (): Partial<Settings> =>
  Object.fromEntries(HINT_KEYS.map(k => [k, false])) as Partial<Settings>;

const STORAGE_KEY = 'pokergrid:settings:v1';

export const loadSettings = async (): Promise<Settings> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (s: Settings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Silent — the app still works without persistence.
  }
};

// ---------- Context + hook ----------

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = React.createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);

  React.useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = React.useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ settings, update }), [settings, update]);
  return React.createElement(SettingsContext.Provider, { value }, children);
};

export const useSettings = () => React.useContext(SettingsContext);
