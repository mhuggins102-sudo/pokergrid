import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { ChallengeId } from '../game/challenges';
import type { Difficulty } from '../game/rules';

export interface RunRecord {
  ts: number;       // Date.now()
  difficulty: Difficulty;
  score: number;
  target: number;
  won: boolean;
}

// Per-difficulty roll-up of completed runs. Populated by recordRun whenever
// a Free Play game ends; the StatsScreen renders these directly.
export interface DifficultyStat {
  best: number | null;       // best score across all runs at this difficulty
  totalScore: number;        // sum of scores — used to derive the average
  totalRuns: number;
  bestStreak: number;        // longest run of consecutive wins
  currentStreak: number;     // currently active streak (resets on loss)
}

const emptyDifficultyStat = (): DifficultyStat => ({
  best: null,
  totalScore: 0,
  totalRuns: 0,
  bestStreak: 0,
  currentStreak: 0,
});

export interface Stats {
  // Legacy aggregate field — kept so old saves migrate cleanly. The
  // StatsScreen no longer renders these as the top-of-page chips; it
  // reads from byDifficulty instead.
  best: Record<Difficulty, number | null>;
  wins: number;
  losses: number;
  streak: number;
  longestStreak: number;
  recent: RunRecord[];

  // Per-difficulty breakdown.
  byDifficulty: Record<Difficulty, DifficultyStat>;

  // Highest Targets-Up level reached, and which Challenges have been completed.
  targetsUpBest: number;
  challengesDone: ChallengeId[];
}

export const EMPTY_STATS: Stats = {
  best: { easy: null, medium: null, hard: null },
  wins: 0,
  losses: 0,
  streak: 0,
  longestStreak: 0,
  recent: [],
  byDifficulty: {
    easy: emptyDifficultyStat(),
    medium: emptyDifficultyStat(),
    hard: emptyDifficultyStat(),
  },
  targetsUpBest: 0,
  challengesDone: [],
};

const STORAGE_KEY = 'pokergrid:stats:v1';

export const loadStats = async (): Promise<Stats> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATS;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return {
      ...EMPTY_STATS,
      ...parsed,
      best: { ...EMPTY_STATS.best, ...parsed.best },
      byDifficulty: {
        easy: { ...emptyDifficultyStat(), ...parsed.byDifficulty?.easy },
        medium: { ...emptyDifficultyStat(), ...parsed.byDifficulty?.medium },
        hard: { ...emptyDifficultyStat(), ...parsed.byDifficulty?.hard },
      },
    };
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

  // Update the per-difficulty roll-up that the StatsScreen renders.
  const diffPrev = prev.byDifficulty[run.difficulty];
  const newCurrentStreak = run.won ? diffPrev.currentStreak + 1 : 0;
  const diffNext: DifficultyStat = {
    best: newBest,
    totalScore: diffPrev.totalScore + run.score,
    totalRuns: diffPrev.totalRuns + 1,
    currentStreak: newCurrentStreak,
    bestStreak: Math.max(diffPrev.bestStreak, newCurrentStreak),
  };

  return {
    ...prev,
    best: { ...prev.best, [run.difficulty]: newBest },
    wins,
    losses,
    streak,
    longestStreak,
    recent,
    byDifficulty: { ...prev.byDifficulty, [run.difficulty]: diffNext },
  };
};

// ---------- Context + hook ----------

interface StatsContextValue {
  stats: Stats;
  record: (run: RunRecord) => void;
  recordTargetsUp: (level: number) => void;
  recordChallenge: (id: ChallengeId) => void;
  reset: () => void;
}

const StatsContext = React.createContext<StatsContextValue>({
  stats: EMPTY_STATS,
  record: () => {},
  recordTargetsUp: () => {},
  recordChallenge: () => {},
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

  const recordTargetsUp = React.useCallback((level: number) => {
    setStats(prev => {
      if (level <= prev.targetsUpBest) return prev;
      const next = { ...prev, targetsUpBest: level };
      saveStats(next);
      return next;
    });
  }, []);

  const recordChallenge = React.useCallback((id: ChallengeId) => {
    setStats(prev => {
      if (prev.challengesDone.includes(id)) return prev;
      const next = { ...prev, challengesDone: [...prev.challengesDone, id] };
      saveStats(next);
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setStats(EMPTY_STATS);
    saveStats(EMPTY_STATS);
  }, []);

  const value = React.useMemo(
    () => ({ stats, record, recordTargetsUp, recordChallenge, reset }),
    [stats, record, recordTargetsUp, recordChallenge, reset]
  );
  return React.createElement(StatsContext.Provider, { value }, children);
};

export const useStats = () => React.useContext(StatsContext);
