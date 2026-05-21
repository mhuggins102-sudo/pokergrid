import {
  clubPip,
  fullDeck,
  isJoker,
  rankIndex,
  spadePip,
  StandardCard,
} from '../src/game/cards';

describe('cards', () => {
  test('fullDeck has 53 cards including exactly one joker', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(53);
    expect(deck.filter(isJoker)).toHaveLength(1);
    const standards = deck.filter(c => !isJoker(c));
    expect(standards).toHaveLength(52);
    // Each rank-suit pair is unique
    const labels = standards.map(c => `${(c as StandardCard).rank}${(c as StandardCard).suit}`);
    expect(new Set(labels).size).toBe(52);
  });

  test('spadePip: A=1, J=11, Q=12, K=13, others face value', () => {
    expect(spadePip({ kind: 'standard', rank: 'A', suit: 'S' })).toBe(1);
    expect(spadePip({ kind: 'standard', rank: '7', suit: 'S' })).toBe(7);
    expect(spadePip({ kind: 'standard', rank: '10', suit: 'S' })).toBe(10);
    expect(spadePip({ kind: 'standard', rank: 'J', suit: 'S' })).toBe(11);
    expect(spadePip({ kind: 'standard', rank: 'Q', suit: 'S' })).toBe(12);
    expect(spadePip({ kind: 'standard', rank: 'K', suit: 'S' })).toBe(13);
  });

  test('clubPip: A=14, K=13, others face value', () => {
    expect(clubPip({ kind: 'standard', rank: 'A', suit: 'C' })).toBe(14);
    expect(clubPip({ kind: 'standard', rank: '2', suit: 'C' })).toBe(2);
    expect(clubPip({ kind: 'standard', rank: 'K', suit: 'C' })).toBe(13);
  });

  test('rankIndex: A is 14, K is 13, 2 is 2', () => {
    expect(rankIndex('A')).toBe(14);
    expect(rankIndex('K')).toBe(13);
    expect(rankIndex('2')).toBe(2);
    expect(rankIndex('10')).toBe(10);
  });
});
