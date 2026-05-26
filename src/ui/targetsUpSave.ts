import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

// Targets-Up resume save. Mirrors the React-context pattern used by Settings
// and Stats. For now the save only captures the level / wins counters that
// would normally live on PlayContext — when the player clears a level it's
// written; when they lose, it's cleared. Future phases will extend this to
// include the bonus-card power-ups so a paused run can also carry its
// boosted deck state across an app relaunch.
export interface TUSave {
  level: number;
  wins: number;
  ts: number;
}

const STORAGE_KEY = 'pokergrid:tu-save:v1';

export const loadTUSave = async (): Promise<TUSave | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TUSave>;
    if (typeof parsed.level !== 'number' || typeof parsed.wins !== 'number') {
      return null;
    }
    return {
      level: parsed.level,
      wins: parsed.wins,
      ts: parsed.ts ?? Date.now(),
    };
  } catch {
    return null;
  }
};

export const writeTUSave = async (s: TUSave): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const deleteTUSave = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

interface TUSaveContextValue {
  save: TUSave | null;
  saveProgress: (level: number, wins: number) => void;
  clearProgress: () => void;
}

const TUSaveContext = React.createContext<TUSaveContextValue>({
  save: null,
  saveProgress: () => {},
  clearProgress: () => {},
});

export const TUSaveProvider = ({ children }: { children: React.ReactNode }) => {
  const [save, setSave] = React.useState<TUSave | null>(null);

  React.useEffect(() => {
    loadTUSave().then(setSave);
  }, []);

  const saveProgress = React.useCallback((level: number, wins: number) => {
    const s: TUSave = { level, wins, ts: Date.now() };
    setSave(s);
    writeTUSave(s);
  }, []);

  const clearProgress = React.useCallback(() => {
    setSave(null);
    deleteTUSave();
  }, []);

  const value = React.useMemo(
    () => ({ save, saveProgress, clearProgress }),
    [save, saveProgress, clearProgress]
  );
  return React.createElement(TUSaveContext.Provider, { value }, children);
};

export const useTUSave = () => React.useContext(TUSaveContext);
