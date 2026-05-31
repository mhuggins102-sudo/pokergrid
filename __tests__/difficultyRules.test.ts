import { isJoker } from '../src/game/cards';
import { seededRng } from '../src/game/deck';
import { evaluateLine } from '../src/game/hands';
import {
  BONUS_DECLINE_AT_CAP_BY_DIFFICULTY,
  CAN_PREVIEW_DECK_BY_DIFFICULTY,
  Difficulty,
  JOKERS_BY_DIFFICULTY,
  NO_DISCARDS_BY_DIFFICULTY,
  STARTER_BONUS_BY_DIFFICULTY,
  TARGET_BY_DIFFICULTY,
  UNDOS_BY_DIFFICULTY,
} from '../src/game/rules';
import { newGame } from '../src/game/state';

const allDifficulties: Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

describe('per-difficulty rules tables', () => {
  it('all four tables cover every Difficulty', () => {
    for (const d of allDifficulties) {
      expect(TARGET_BY_DIFFICULTY[d]).toBeGreaterThan(0);
      expect(JOKERS_BY_DIFFICULTY[d]).toBeGreaterThanOrEqual(0);
      expect(UNDOS_BY_DIFFICULTY[d]).toBeGreaterThanOrEqual(0);
      expect(STARTER_BONUS_BY_DIFFICULTY[d]).toBeGreaterThanOrEqual(0);
      expect(typeof BONUS_DECLINE_AT_CAP_BY_DIFFICULTY[d]).toBe('boolean');
      expect(typeof NO_DISCARDS_BY_DIFFICULTY[d]).toBe('boolean');
      expect(typeof CAN_PREVIEW_DECK_BY_DIFFICULTY[d]).toBe('boolean');
    }
  });

  it('Extreme has the spec values', () => {
    expect(TARGET_BY_DIFFICULTY.extreme).toBe(450);
    expect(JOKERS_BY_DIFFICULTY.extreme).toBe(0);
    expect(UNDOS_BY_DIFFICULTY.extreme).toBe(0);
    expect(STARTER_BONUS_BY_DIFFICULTY.extreme).toBe(0);
    expect(BONUS_DECLINE_AT_CAP_BY_DIFFICULTY.extreme).toBe(false);
    expect(NO_DISCARDS_BY_DIFFICULTY.extreme).toBe(true);
    expect(CAN_PREVIEW_DECK_BY_DIFFICULTY.extreme).toBe(false);
  });

  it('Easy has the spec values', () => {
    expect(TARGET_BY_DIFFICULTY.easy).toBe(400);
    expect(JOKERS_BY_DIFFICULTY.easy).toBe(2);
    expect(UNDOS_BY_DIFFICULTY.easy).toBe(1);
    expect(STARTER_BONUS_BY_DIFFICULTY.easy).toBe(1);
    expect(BONUS_DECLINE_AT_CAP_BY_DIFFICULTY.easy).toBe(true);
    expect(NO_DISCARDS_BY_DIFFICULTY.easy).toBe(false);
    expect(CAN_PREVIEW_DECK_BY_DIFFICULTY.easy).toBe(true);
  });
});

describe('Targets Up — targetForLevel schedule', () => {
  // +25 every level, starting at 400. Aligns with the Free Play tiers:
  // L1–2 cover Easy 400–425, L3–4 cover Medium 450–475, L5+ Hard 500+.
  it('L1 starts at the base target', () => {
    const { targetForLevel } = require('../src/game/challenges');
    expect(targetForLevel(1)).toBe(400);
  });
  it('+25 steps every level', () => {
    const { targetForLevel } = require('../src/game/challenges');
    expect(targetForLevel(2)).toBe(425);
    expect(targetForLevel(3)).toBe(450);
    expect(targetForLevel(4)).toBe(475);
    expect(targetForLevel(5)).toBe(500);
    expect(targetForLevel(6)).toBe(525);
    expect(targetForLevel(7)).toBe(550);
    expect(targetForLevel(10)).toBe(625);
  });
});

describe('Targets Up — difficultyForLevel mapping', () => {
  // Pins the Free-Play-target-keyed mapping so any future change to
  // TARGET_BY_DIFFICULTY auto-validates the ladder ↔ difficulty
  // alignment. With Easy 400 / Medium 450 / Hard 500:
  //   L1–2 (targets 400 / 425) → Easy
  //   L3–4 (targets 450 / 475) → Medium
  //   L5+  (targets 500 / 525 / …) → Hard
  it('L1–2 (targets < 450) → easy', () => {
    const { difficultyForLevel } = require('../src/game/challenges');
    expect(difficultyForLevel(1)).toBe('easy');
    expect(difficultyForLevel(2)).toBe('easy');
  });
  it('L3–4 (targets 450–475) → medium', () => {
    const { difficultyForLevel } = require('../src/game/challenges');
    expect(difficultyForLevel(3)).toBe('medium');
    expect(difficultyForLevel(4)).toBe('medium');
  });
  it('L5+ (targets ≥ 500) → hard', () => {
    const { difficultyForLevel } = require('../src/game/challenges');
    expect(difficultyForLevel(5)).toBe('hard');
    expect(difficultyForLevel(8)).toBe('hard');
    expect(difficultyForLevel(20)).toBe('hard');
  });
  it('never returns extreme', () => {
    const { difficultyForLevel } = require('../src/game/challenges');
    for (let lvl = 1; lvl <= 50; lvl++) {
      expect(difficultyForLevel(lvl)).not.toBe('extreme');
    }
  });
});

describe('newGame difficulty wiring', () => {
  it('Easy deck contains 2 jokers', () => {
    const g = newGame('easy', seededRng(7));
    // The first card is auto-placed by newGame onto the grid; the
    // remaining deck plus that first card make up the full deck.
    const fullDeck = [...g.deck, ...(g.grid.filter(c => c !== null) as ReadonlyArray<NonNullable<typeof g.grid[number]>>)];
    expect(fullDeck.filter(isJoker).length).toBe(2);
  });

  it('Hard deck contains 1 joker', () => {
    const g = newGame('hard', seededRng(7));
    const fullDeck = [...g.deck, ...(g.grid.filter(c => c !== null) as ReadonlyArray<NonNullable<typeof g.grid[number]>>)];
    expect(fullDeck.filter(isJoker).length).toBe(1);
  });

  it('Extreme deck contains 0 jokers', () => {
    const g = newGame('extreme', seededRng(7));
    const fullDeck = [...g.deck, ...(g.grid.filter(c => c !== null) as ReadonlyArray<NonNullable<typeof g.grid[number]>>)];
    expect(fullDeck.filter(isJoker).length).toBe(0);
  });

  it('Extreme sets noDiscards on the state', () => {
    const g = newGame('extreme', seededRng(7));
    expect(g.noDiscards).toBe(true);
  });

  it('Easy sets bonusDeclineAllowed on the state', () => {
    const g = newGame('easy', seededRng(7));
    expect(g.bonusDeclineAllowed).toBe(true);
  });

  it('Hard and Extreme do NOT allow bonus decline at cap', () => {
    expect(newGame('hard', seededRng(7)).bonusDeclineAllowed).toBe(false);
    expect(newGame('extreme', seededRng(7)).bonusDeclineAllowed).toBe(false);
  });

  it('Easy and Medium start with a bonus card; Hard and Extreme do not', () => {
    expect(newGame('easy', seededRng(7)).bonusCards.length).toBeGreaterThanOrEqual(1);
    expect(newGame('medium', seededRng(7)).bonusCards.length).toBeGreaterThanOrEqual(1);
    expect(newGame('hard', seededRng(7)).bonusCards.length).toBe(0);
    expect(newGame('extreme', seededRng(7)).bonusCards.length).toBe(0);
  });
});

describe('evaluateLine with multiple jokers', () => {
  // With 2 jokers in the deck (Easy difficulty), a line could conceivably
  // contain both. Earlier the evaluator threw on jokers > 1; now it
  // substitutes recursively and picks the best resulting hand.
  it('two jokers + 3 random cards can complete a hand without throwing', () => {
    const line = [
      { kind: 'joker' as const },
      { kind: 'joker' as const },
      { kind: 'standard' as const, rank: '5' as const, suit: 'H' as const },
      { kind: 'standard' as const, rank: '5' as const, suit: 'S' as const },
      { kind: 'standard' as const, rank: '5' as const, suit: 'D' as const },
    ];
    // Best fill: both jokers → 5s → FIVE_OF_A_KIND.
    expect(evaluateLine(line)).toBe('FIVE_OF_A_KIND');
  });
});
