import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { Difficulty } from '../game/rules';

export interface RunRecord {
  ts: number;       // Date.now()
  difficulty: Difficulty;
  score: number;
  target: number;
  won: boolean;
}

export interface Stats {
  best: Record<Difficulty, number | null>; // best score per difficulty
  wins: number;
  losses: number;
  streak: number;       // current consecutive wins (resets on loss)
  longestStreak: number;
  recent: RunRecord[];  // last 10 runs, newest first
}

export const EMPTY_STATS: Stats = {
  best: { easy: null, medium: null, hard: null },
  wins: 0,
  losses: 0,
  streak: 0,
  longestStreak: 0,
  recent: [],
};

const STORAGE_KEY = 'pokergrid:stats:v1';

export const loadStats = async (): Promise<Stats> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATS;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { ...EMPTY_STATS, ...parsed, best: { ...EMPTY_STATS.best, ...parsed.best } };
  } catch {
    return EMPTY_STATS;
  }
};

export const saveStats = async (s: Stats): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const recordRun = (prev: Stats, run: RunRecord): Stats => {
  const bestNow = prev.best[run.difficulty];
  const newBest = bestNow === null || run.score > bestNow ? run.score : bestNow;
  const wins = prev.wins + (run.won ? 1 : 0);
  const losses = prev.losses + (run.won ? 0 : 1);
  const streak = run.won ? prev.streak + 1 : 0;
  const longestStreak = Math.max(prev.longestStreak, streak);
  const recent = [run, ...prev.recent].slice(0, 10);
  return {
    best: { ...prev.best, [run.difficulty]: newBest },
    wins,
    losses,
    streak,
    longestStreak,
    recent,
  };
};

// ---------- Context + hook ----------

interface StatsContextValue {
  stats: Stats;
  record: (run: RunRecord) => void;
  reset: () => void;
}

const StatsContext = React.createContext<StatsContextValue>({
  stats: EMPTY_STATS,
  record: () => {},
  reset: () => {},
});

export const StatsProvider = ({ children }: { children: React.ReactNode }) => {
  const [stats, setStats] = React.useState<Stats>(EMPTY_STATS);

  React.useEffect(() => {
    loadStats().then(setStats);
  }, []);

  const record = React.useCallback((run: RunRecord) => {
    setStats(prev => {
      const next = recordRun(prev, run);
      saveStats(next);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setStats(EMPTY_STATS);
    saveStats(EMPTY_STATS);
  }, []);

  const value = React.useMemo(() => ({ stats, record, reset }), [stats, record, reset]);
  return React.createElement(StatsContext.Provider, { value }, children);
};

export const useStats = () => React.useContext(StatsContext);
