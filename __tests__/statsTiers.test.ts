// Stats module imports AsyncStorage, which has no Node implementation;
// stub it out with the official mock before requiring stats.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  EMPTY_STATS,
  RunRecord,
  recordRun,
  tierForRun,
} from '../src/ui/stats';

const run = (
  difficulty: RunRecord['difficulty'],
  score: number,
  target: number,
  won: boolean
): RunRecord => ({ ts: Date.now(), difficulty, score, target, won });

describe('tierForRun', () => {
  it('classifies winning ratios into SS / S / A', () => {
    // ratio = score / target
    expect(tierForRun(run('easy', 480, 300, true))).toBe('SS'); // 1.6
    expect(tierForRun(run('easy', 479, 300, true))).toBe('S');  // 1.597
    expect(tierForRun(run('easy', 390, 300, true))).toBe('S');  // 1.3
    expect(tierForRun(run('easy', 389, 300, true))).toBe('A');  // 1.297
    expect(tierForRun(run('easy', 300, 300, true))).toBe('A');  // 1.0
  });

  it('classifies losing ratios into B / C / D', () => {
    expect(tierForRun(run('easy', 255, 300, false))).toBe('B'); // 0.85
    expect(tierForRun(run('easy', 254, 300, false))).toBe('C'); // 0.847
    expect(tierForRun(run('easy', 150, 300, false))).toBe('C'); // 0.5
    expect(tierForRun(run('easy', 149, 300, false))).toBe('D'); // 0.497
    expect(tierForRun(run('easy', 0, 300, false))).toBe('D');
  });
});

describe('recordRun → tierCounts', () => {
  it('increments the right per-difficulty tier slot', () => {
    let s = EMPTY_STATS;
    s = recordRun(s, run('hard', 800, 500, true));   // SS
    s = recordRun(s, run('hard', 650, 500, true));   // S
    s = recordRun(s, run('hard', 510, 500, true));   // A
    s = recordRun(s, run('hard', 450, 500, false));  // B
    s = recordRun(s, run('easy', 320, 300, true));   // A
    expect(s.tierCounts.hard.SS).toBe(1);
    expect(s.tierCounts.hard.S).toBe(1);
    expect(s.tierCounts.hard.A).toBe(1);
    expect(s.tierCounts.hard.B).toBe(1);
    expect(s.tierCounts.hard.C).toBe(0);
    expect(s.tierCounts.hard.D).toBe(0);
    expect(s.tierCounts.easy.A).toBe(1);
    // Other difficulties stay at 0 since no runs landed there.
    expect(s.tierCounts.medium.A).toBe(0);
    expect(s.tierCounts.extreme.A).toBe(0);
  });
});

describe('recordRun → bonusCardStatsByDifficulty', () => {
  it('tracks bonus card frequency separately for each difficulty', () => {
    let s = EMPTY_STATS;
    const r1: RunRecord = {
      ...run('easy', 350, 300, true),
      bonusCards: [{ cardId: 'hand-pair-x4', shapley: 24 }],
    };
    const r2: RunRecord = {
      ...run('hard', 550, 500, true),
      bonusCards: [{ cardId: 'hand-pair-x4', shapley: 30 }],
    };
    s = recordRun(s, r1);
    s = recordRun(s, r2);
    expect(s.bonusCardStatsByDifficulty.easy['hand-pair-x4']).toEqual({
      timesHeld: 1,
      totalShapley: 24,
    });
    expect(s.bonusCardStatsByDifficulty.hard['hand-pair-x4']).toEqual({
      timesHeld: 1,
      totalShapley: 30,
    });
    // The global aggregate still sums across difficulties for the
    // "All" filter on the stats screen.
    expect(s.bonusCardStats['hand-pair-x4']).toEqual({
      timesHeld: 2,
      totalShapley: 54,
    });
  });
});
