// settings.ts imports AsyncStorage at module load, so route it to the mock
// the library ships for Jest. (The other suites only touch pure src/game
// modules, so this is the first test that pulls in a native-backed module.)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  DEFAULT_SETTINGS,
  HINT_KEYS,
  resetHintsPatch,
  Settings,
} from '../src/ui/settings';

describe('first-time hint reset', () => {
  it('resetHintsPatch sets every hint flag back to false', () => {
    const patch = resetHintsPatch();
    for (const key of HINT_KEYS) {
      expect(patch[key]).toBe(false);
    }
  });

  it('HINT_KEYS covers every one-time-acknowledgement flag in Settings', () => {
    // Any boolean setting whose name encodes a one-time acknowledgement
    // (seen* hints + the undo warning) must be in HINT_KEYS so "Reset
    // first-time hints" re-arms it. This guards against a new hint being
    // added without being wired into the reset.
    const oneTimeFlags = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
      .filter(k => k.startsWith('seen') || k === 'undoWarningSeen');
    for (const key of oneTimeFlags) {
      expect(HINT_KEYS).toContain(key);
    }
  });
});
