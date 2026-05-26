import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { ChallengeId } from '../game/challenges';
import type { Difficulty } from '../game/rules';

// Per-bonus-card attribution captured at game end. Index-aligned with the
// player's held bonus cards at scoring time; the `shapley` is the Shapley-
// value attribution (fair allocation across multiplicatively-stacking
// bonuses) so summing them across the hand equals the total bonus
// contribution to the run's final score.
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
  // Optional for backwards compatibility with pre-charts saves — runs
  // recorded before this field was added simply won't contribute to the
  // bonus-card analytics on StatsScreen.
  bonusCards?: BonusCardAttribution[];
}

// Per-difficulty roll-up of completed runs. Populated by recordRun whenever
// a Free Play game ends; the StatsScreen renders these directly.
export interface DifficultyStat {
  best: number | null;       // best score across all runs at this difficulty
  totalScore: number;        // sum of scores — used to derive the average
  totalRuns: number;
  wins: number;              // count of won runs (losses = totalRuns - wins)
  bestStreak: number;        // longest run of consecutive wins
  currentStreak: number;     // currently active streak (resets on loss)
}

const emptyDifficultyStat = (): DifficultyStat => ({
  best: null,
  totalScore: 0,
  totalRuns: 0,
  wins: 0,
  bestStreak: 0,
  currentStreak: 0,
});

// All-time aggregate of a single bonus card across the player's history.
// timesHeld counts runs that ended with this card in hand; totalShapley is
// the sum of its end-game contributions, so the average is totalShapley /
// timesHeld.
export interface BonusCardStat {
  timesHeld: number;
  totalShapley: number;
}

export interface Stats {
  // Legacy aggregate field — kept so old saves migrate cleanly. The
  // StatsScreen no longer renders these as the top-of-page chips; it
  // reads from byDifficulty instead.
  best: Record<Difficulty, number | null>;
  wins: number;
  losses: number;
  streak: number;
  longestStreak: number;
  // Rolling buffer of the most recent runs (newest first). Cap raised to
  // 20 so the StatsScreen's score-trend sparkline has enough data points
  // to actually look like a trend.
  recent: RunRecord[];

  // Per-difficulty breakdown.
  byDifficulty: Record<Difficulty, DifficultyStat>;

  // Highest Targets-Up level reached, and which Challenges have been completed.
  targetsUpBest: number;
  challengesDone: ChallengeId[];

  // All-time aggregate of bonus cards held at end of game, keyed by
  // BonusCard.id. Updated by recordRun from the optional bonusCards field
  // on the incoming RunRecord.
  bonusCardStats: Record<string, BonusCardStat>;
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
        extreme: { ...emptyDifficultyStat(), ...parsed.byDifficulty?.extreme },
      },
      bonusCardStats: parsed.bonusCardStats ?? {},
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

  // Fold per-card attribution into the all-time aggregate so the bonus
  // card analytics on StatsScreen can show frequency + average score
  // across the full run history without keeping every record forever.
  const bonusCardStats = { ...prev.bonusCardStats };
  if (run.bonusCards) {
    for (const { cardId, shapley } of run.bonusCards) {
      const cur = bonusCardStats[cardId] ?? { timesHeld: 0, totalShapley: 0 };
      bonusCardStats[cardId] = {
        timesHeld: cur.timesHeld + 1,
        totalShapley: cur.totalShapley + shapley,
      };
    }
  }

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
