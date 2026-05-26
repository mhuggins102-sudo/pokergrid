import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { ChallengeId } from '../game/challenges';
import type { Difficulty } from '../game/rules';

export interface BonusCardAttribution {
  cardId: string;
  shapley: number;
}

export interface RunRecord {
  ts: number;       // Date.now()
  difficulty: Difficulty;
  score: number;
  target: number;
  won: boolean;
  bonusCards?: BonusCardAttribution[];
}

export interface DifficultyStat {
  best: number | null;
  totalScore: number;
  totalRuns: number;
  wins: number;
  bestStreak: number;
  currentStreak: number;
}

const emptyDifficultyStat = (): DifficultyStat => ({
  best: null,
  totalScore: 0,
  totalRuns: 0,
  wins: 0,
  bestStreak: 0,
  currentStreak: 0,
});

export interface BonusCardStat {
  timesHeld: number;
  totalShapley: number;
}

// Six tiers — matches the result-screen banner and the in-game tier
// breakdown popup. Stored in tierCounts for the per-difficulty histogram
// on the stats screen.
export type Tier = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export const TIER_ORDER: Tier[] = ['SS', 'S', 'A', 'B', 'C', 'D'];

const emptyTierCounts = (): Record<Tier, number> => ({
  SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0,
});

export const tierForRun = (run: RunRecord): Tier => {
  const ratio = run.score / Math.max(1, run.target);
  if (run.won) {
    if (ratio >= 1.6) return 'SS';
    if (ratio >= 1.3) return 'S';
    return 'A';
  }
  if (ratio >= 0.85) return 'B';
  if (ratio >= 0.5) return 'C';
  return 'D';
};

export interface Stats {
  // Legacy aggregate field — kept so old saves migrate cleanly. The
  // StatsScreen no longer renders these as the top-of-page chips; it
  // reads from byDifficulty instead.
  best: Record<Difficulty, number | null>;
  wins: number;
  losses: number;
  streak: number;
  longestStreak: number;
  // Rolling buffer of the most recent runs (newest first). Used by the
  // Recent Runs section on the stats screen.
  recent: RunRecord[];

  // Per-difficulty roll-up of every completed run.
  byDifficulty: Record<Difficulty, DifficultyStat>;

  // Highest Targets-Up level reached, and which Challenges have been completed.
  targetsUpBest: number;
  challengesDone: ChallengeId[];

  // All-time aggregate of bonus cards held at end of game, keyed by
  // BonusCard.id (with any -pwrN suffix stripped by the caller). This
  // is the "All difficulties" view on the stats screen.
  bonusCardStats: Record<string, BonusCardStat>;

  // Per-difficulty version of bonusCardStats. The stats screen filters
  // through this when the player picks a specific difficulty in the
  // top-of-page filter row.
  bonusCardStatsByDifficulty: Record<Difficulty, Record<string, BonusCardStat>>;

  // Per-difficulty histogram of tier outcomes. Drives the "Score
  // distribution" section on the stats screen — bars for each tier
  // count the number of completed runs that landed there.
  tierCounts: Record<Difficulty, Record<Tier, number>>;
}

export const RECENT_RUNS_CAP = 20;

export const EMPTY_STATS: Stats = {
  best: { easy: null, medium: null, hard: null, extreme: null },
  wins: 0,
  losses: 0,
  streak: 0,
  longestStreak: 0,
  recent: [],
  byDifficulty: {
    easy: emptyDifficultyStat(),
    medium: emptyDifficultyStat(),
    hard: emptyDifficultyStat(),
    extreme: emptyDifficultyStat(),
  },
  targetsUpBest: 0,
  challengesDone: [],
  bonusCardStats: {},
  bonusCardStatsByDifficulty: {
    easy: {},
    medium: {},
    hard: {},
    extreme: {},
  },
  tierCounts: {
    easy: emptyTierCounts(),
    medium: emptyTierCounts(),
    hard: emptyTierCounts(),
    extreme: emptyTierCounts(),
  },
};

const STORAGE_KEY = 'pokergrid:stats:v1';

// Per-difficulty merge helper — fills in missing keys with empty
// records so old saves that pre-date these fields hydrate cleanly.
const mergeByDifficultyMap = <T>(
  parsed: Partial<Record<Difficulty, T>> | undefined,
  defaultFor: () => T
): Record<Difficulty, T> => ({
  easy: parsed?.easy ?? defaultFor(),
  medium: parsed?.medium ?? defaultFor(),
  hard: parsed?.hard ?? defaultFor(),
  extreme: parsed?.extreme ?? defaultFor(),
});

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
        extreme: { ...emptyDifficultyStat(), ...parsed.byDifficulty?.extreme },
      },
      bonusCardStats: parsed.bonusCardStats ?? {},
      bonusCardStatsByDifficulty: mergeByDifficultyMap(
        parsed.bonusCardStatsByDifficulty,
        () => ({})
      ),
      tierCounts: {
        easy: { ...emptyTierCounts(), ...parsed.tierCounts?.easy },
        medium: { ...emptyTierCounts(), ...parsed.tierCounts?.medium },
        hard: { ...emptyTierCounts(), ...parsed.tierCounts?.hard },
        extreme: { ...emptyTierCounts(), ...parsed.tierCounts?.extreme },
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
  const recent = [run, ...prev.recent].slice(0, RECENT_RUNS_CAP);

  // Update the per-difficulty roll-up that the StatsScreen renders.
  const diffPrev = prev.byDifficulty[run.difficulty];
  const newCurrentStreak = run.won ? diffPrev.currentStreak + 1 : 0;
  const diffNext: DifficultyStat = {
    best: newBest,
    totalScore: diffPrev.totalScore + run.score,
    totalRuns: diffPrev.totalRuns + 1,
    wins: diffPrev.wins + (run.won ? 1 : 0),
    currentStreak: newCurrentStreak,
    bestStreak: Math.max(diffPrev.bestStreak, newCurrentStreak),
  };

  // Fold per-card attribution into BOTH the all-time global aggregate
  // (used by the "All" filter) and the per-difficulty aggregate (used
  // by each difficulty filter).
  const bonusCardStats = { ...prev.bonusCardStats };
  const perDiffBonus = { ...prev.bonusCardStatsByDifficulty[run.difficulty] };
  if (run.bonusCards) {
    for (const { cardId, shapley } of run.bonusCards) {
      const cur = bonusCardStats[cardId] ?? { timesHeld: 0, totalShapley: 0 };
      bonusCardStats[cardId] = {
        timesHeld: cur.timesHeld + 1,
        totalShapley: cur.totalShapley + shapley,
      };
      const curD = perDiffBonus[cardId] ?? { timesHeld: 0, totalShapley: 0 };
      perDiffBonus[cardId] = {
        timesHeld: curD.timesHeld + 1,
        totalShapley: curD.totalShapley + shapley,
      };
    }
  }

  // Update the tier histogram for this difficulty.
  const tier = tierForRun(run);
  const tierPrev = prev.tierCounts[run.difficulty];
  const tierNext = { ...tierPrev, [tier]: tierPrev[tier] + 1 };

  return {
    ...prev,
    best: { ...prev.best, [run.difficulty]: newBest },
    wins,
    losses,
    streak,
    longestStreak,
    recent,
    byDifficulty: { ...prev.byDifficulty, [run.difficulty]: diffNext },
    bonusCardStats,
    bonusCardStatsByDifficulty: {
      ...prev.bonusCardStatsByDifficulty,
      [run.difficulty]: perDiffBonus,
    },
    tierCounts: {
      ...prev.tierCounts,
      [run.difficulty]: tierNext,
    },
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
