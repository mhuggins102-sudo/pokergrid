import { Rank, StandardCard, Suit } from '../src/game/cards';
import {
  applyModifiers,
  LineContext,
  lineSuit,
  STARTER_MODIFIERS,
  universalEffectFor,
  universalEffectSum,
} from '../src/game/modifiers';

const C = (rank: Rank, suit: Suit): StandardCard => ({ kind: 'standard', rank, suit });

const lineCtx = (overrides: Partial<LineContext>): LineContext => ({
  kind: 'row',
  index: 0,
  cards: [C('2', 'H'), C('5', 'H'), C('8', 'H'), C('J', 'H'), C('K', 'H')],
  hand: 'FLUSH',
  ...overrides,
});

describe('modifiers', () => {
  test('lineSuit returns shared suit when all standards match', () => {
    expect(lineSuit(lineCtx({}))).toBe('H');
  });

  test('lineSuit returns null on mixed suits', () => {
    const ctx = lineCtx({
      cards: [C('2', 'H'), C('5', 'C'), C('8', 'H'), C('J', 'H'), C('K', 'H')],
    });
    expect(lineSuit(ctx)).toBe(null);
  });

  test('all 10 starter modifiers exist', () => {
    expect(STARTER_MODIFIERS).toHaveLength(10);
    expect(new Set(STARTER_MODIFIERS.map(m => m.id)).size).toBe(10);
  });

  test('hearts modifier triggers on ♥ flush', () => {
    const hearts = STARTER_MODIFIERS.find(m => m.id === 'h-1_5x')!;
    const ctx = lineCtx({}); // all hearts, FLUSH
    expect(hearts.effect(ctx)).toEqual({ multiplierBoost: 0.5 });
  });

  test('hearts modifier does not trigger on non-hearts line', () => {
    const hearts = STARTER_MODIFIERS.find(m => m.id === 'h-1_5x')!;
    const ctx = lineCtx({
      cards: [C('2', 'C'), C('5', 'C'), C('8', 'C'), C('J', 'C'), C('K', 'C')],
    });
    expect(hearts.effect(ctx)).toEqual({});
  });

  test('pair-2x triggers on PAIR only', () => {
    const m = STARTER_MODIFIERS.find(m => m.id === 'pair-2x')!;
    expect(m.effect(lineCtx({ hand: 'PAIR' }))).toEqual({ multiplierBoost: 1.0 });
    expect(m.effect(lineCtx({ hand: 'FLUSH' }))).toEqual({});
  });

  test('straight-plus-50 triggers on STRAIGHT only', () => {
    const m = STARTER_MODIFIERS.find(m => m.id === 'straight-plus-50')!;
    expect(m.effect(lineCtx({ hand: 'STRAIGHT' }))).toEqual({ flatAdd: 50 });
    expect(m.effect(lineCtx({ hand: 'FLUSH' }))).toEqual({});
  });

  test('row-3-2x triggers only on row index 2 with a scoring hand', () => {
    const m = STARTER_MODIFIERS.find(m => m.id === 'row-3-2x')!;
    expect(m.effect(lineCtx({ kind: 'row', index: 2 }))).toEqual({ multiplierBoost: 1.0 });
    expect(m.effect(lineCtx({ kind: 'row', index: 0 }))).toEqual({});
    expect(m.effect(lineCtx({ kind: 'row', index: 2, hand: null }))).toEqual({});
    expect(m.effect(lineCtx({ kind: 'col', index: 2 }))).toEqual({});
  });

  test('universalEffectFor: hand-type-only modifiers return their effect', () => {
    const pair2x = STARTER_MODIFIERS.find(m => m.id === 'pair-2x')!;
    expect(universalEffectFor(pair2x, 'PAIR')).toEqual({ multiplierBoost: 1.0 });
    expect(universalEffectFor(pair2x, 'FLUSH')).toBeNull();

    const straight50 = STARTER_MODIFIERS.find(m => m.id === 'straight-plus-50')!;
    expect(universalEffectFor(straight50, 'STRAIGHT')).toEqual({ flatAdd: 50 });
    expect(universalEffectFor(straight50, 'PAIR')).toBeNull();
  });

  test('universalEffectFor: suit-conditional modifiers return null', () => {
    const hearts = STARTER_MODIFIERS.find(m => m.id === 'h-1_5x')!;
    expect(universalEffectFor(hearts, 'FLUSH')).toBeNull();
    expect(universalEffectFor(hearts, 'PAIR')).toBeNull();
  });

  test('universalEffectFor: position-conditional modifiers return null', () => {
    const row3 = STARTER_MODIFIERS.find(m => m.id === 'row-3-2x')!;
    expect(universalEffectFor(row3, 'PAIR')).toBeNull();
    expect(universalEffectFor(row3, 'FLUSH')).toBeNull();
  });

  test('universalEffectSum aggregates universal effects per hand', () => {
    const sum = universalEffectSum(STARTER_MODIFIERS, 'STRAIGHT');
    // Only "straight-plus-50" applies universally to STRAIGHT.
    expect(sum.multiplier).toBe(1);
    expect(sum.flat).toBe(50);
  });

  test('universalEffectSum: PAIR gets the 2× multiplier modifier', () => {
    const sum = universalEffectSum(STARTER_MODIFIERS, 'PAIR');
    expect(sum.multiplier).toBe(2);
    expect(sum.flat).toBe(0);
  });

  test('applyModifiers sums boosts and flat adds across all modifiers', () => {
    const ctx = lineCtx({});
    const { multiplier, flat } = applyModifiers(ctx, STARTER_MODIFIERS);
    // Hearts flush → +0.5 mult; flush bonus +40 flat (FLUSH).
    // No other modifiers trigger.
    expect(multiplier).toBeCloseTo(1.5);
    expect(flat).toBe(40);
  });
});
