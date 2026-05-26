import { Card, Rank, StandardCard, Suit, Supercharge } from '../src/game/cards';
import { evaluateLine, HandRank } from '../src/game/hands';

const C = (rank: Rank, suit: Suit, supercharge?: Supercharge): StandardCard => ({
  kind: 'standard',
  rank,
  suit,
  supercharge,
});
const JK: Card = { kind: 'joker' };

const expectHand = (cards: (Card | null)[], rank: HandRank | null) =>
  expect(evaluateLine(cards)).toBe(rank);

describe('wild supercharge', () => {
  test("does not affect a line that's already a straight without it", () => {
    // 4-5-6-7-8 mixed suits — already a straight; the wild doesn't add
    // anything because rank is unchanged and the suits still aren't
    // unified.
    expectHand(
      [C('4', 'H'), C('5', 'S', 'wild'), C('6', 'D'), C('7', 'C'), C('8', 'H')],
      'STRAIGHT'
    );
  });

  test('lets 4 same-suit cards + 1 off-suit wild reach a flush', () => {
    expectHand(
      [C('2', 'H'), C('5', 'H'), C('9', 'H'), C('K', 'H'), C('7', 'S', 'wild')],
      'FLUSH'
    );
  });

  test('promotes a 4-of-suit straight to a straight flush via wild', () => {
    expectHand(
      [C('4', 'H'), C('5', 'H'), C('6', 'H'), C('7', 'H'), C('8', 'S', 'wild')],
      'STRAIGHT_FLUSH'
    );
  });

  test('promotes 10-J-Q-K-A all-but-one heart to a royal flush', () => {
    expectHand(
      [C('10', 'H'), C('J', 'H'), C('Q', 'H'), C('K', 'H'), C('A', 'C', 'wild')],
      'ROYAL_FLUSH'
    );
  });

  test('does not magically create rank pairs', () => {
    // 2-4-6-8-K with one wild — still high card (wild only affects suit).
    expectHand(
      [C('2', 'H'), C('4', 'S', 'wild'), C('6', 'D'), C('8', 'C'), C('K', 'H')],
      'HIGH_CARD'
    );
  });
});

describe('double supercharge', () => {
  test('promotes a single pair to three-of-a-kind', () => {
    // Two natural 2s + a doubled 2 give count = 1 + 1 + 2 = 4 (4OK).
    // Use just one natural 2 + doubled 2 = 1 + 2 = 3 → three of a kind.
    expectHand(
      [C('2', 'H'), C('2', 'C', 'double'), C('5', 'D'), C('8', 'S'), C('K', 'H')],
      'THREE_OF_A_KIND'
    );
  });

  test('promotes three-of-a-kind to four-of-a-kind', () => {
    expectHand(
      [C('2', 'H'), C('2', 'C'), C('2', 'D', 'double'), C('8', 'S'), C('K', 'H')],
      'FOUR_OF_A_KIND'
    );
  });

  test('promotes 3 + pair to a full house', () => {
    // 3 natural 5s + a doubled 8 + a natural 8 → 5: count 3, 8: count 3. That's two
    // triples (impossible in a real hand) but evaluator treats as full house
    // because multiset = [3, 3]. Use a cleaner case:
    // Natural 5,5 + natural 8,8,8 → 5: count 2, 8: count 3 → full house.
    // Now make the pair into a triple via double:
    // 5 doubled + 5 + 8 + 8 + 8 → 5: 2+1 = 3, 8: 3 → FULL HOUSE.
    expectHand(
      [C('5', 'H', 'double'), C('5', 'S'), C('8', 'D'), C('8', 'C'), C('8', 'H')],
      'FULL_HOUSE',
    );
  });

  test('builds 5-of-a-kind from 4 naturals + double of the same rank', () => {
    // Only 4 of each rank exist; combine with a double to get 5 count.
    // 3 normal Ks + doubled K + filler → K count = 3 + 2 = 5.
    expectHand(
      [C('K', 'H'), C('K', 'S'), C('K', 'D'), C('K', 'C', 'double'), C('2', 'H')],
      'FIVE_OF_A_KIND'
    );
  });

  test('does not help a straight (doubled card counts as 1 for sequence)', () => {
    // 4-5-6-7-8 with the 5 doubled. Ranks 4,5,6,7,8 — still 5 distinct.
    expectHand(
      [C('4', 'H'), C('5', 'S', 'double'), C('6', 'D'), C('7', 'C'), C('8', 'H')],
      'STRAIGHT'
    );
  });

  test('does not add to flush slot count (line is still 5)', () => {
    // 4 hearts + 1 off-suit (doubled) — still 4 hearts, no flush. All
    // ranks distinct → HIGH_CARD.
    expectHand(
      [C('2', 'H'), C('5', 'H'), C('9', 'H'), C('K', 'H'), C('7', 'S', 'double')],
      'HIGH_CARD'
    );
  });
});

describe('wild + joker', () => {
  test('joker can complete a straight flush that wild kicks off', () => {
    // 4♥, 5♥, 6♥, wild 7♠, joker — best fill: joker = 8♥, wild as ♥ → SF.
    expectHand(
      [C('4', 'H'), C('5', 'H'), C('6', 'H'), C('7', 'S', 'wild'), JK],
      'STRAIGHT_FLUSH'
    );
  });
});
