import {
  Card,
  Rank,
  RANKS,
  Suit,
  SUITS,
  StandardCard,
  isJoker,
  rankIndex,
} from './cards';

export type HandRank =
  | 'HIGH_CARD'
  | 'PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'FIVE_OF_A_KIND'
  | 'ROYAL_FLUSH';

export const HAND_TIER: Record<HandRank, number> = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  FIVE_OF_A_KIND: 9,
  ROYAL_FLUSH: 10,
};

// Evaluates 5 standard cards, accounting for any 'wild' or 'double'
// supercharges set on individual cards.
//
//   - A 'double' card contributes 2 to its rank's count (boosting PAIR-
//     class hands) but only 1 for straight-eligibility and only 1 slot
//     toward a flush.
//   - A 'wild' card's suit is flexible: it counts as whichever suit
//     produces the best result for the flush / straight-flush check.
//     The rank is unchanged.
const evalStandardFive = (cards: StandardCard[]): HandRank => {
  if (cards.length !== 5) throw new Error('Expected 5 cards');

  // Rank counts: doubles contribute 2.
  const counts = new Map<number, number>();
  for (const c of cards) {
    const r = rankIndex(c.rank);
    counts.set(r, (counts.get(r) ?? 0) + (c.supercharge === 'double' ? 2 : 1));
  }
  const multiset = [...counts.values()].sort((a, b) => b - a);

  // Flush: count slots per suit, ignoring wilds. A wild can fill any one
  // missing slot, so the line is a flush if max(non-wild suit count) +
  // wild count ≥ 5.
  const wildCount = cards.filter(c => c.supercharge === 'wild').length;
  const nonWildSuitCounts = new Map<Suit, number>();
  for (const c of cards) {
    if (c.supercharge === 'wild') continue;
    nonWildSuitCounts.set(c.suit, (nonWildSuitCounts.get(c.suit) ?? 0) + 1);
  }
  const maxSuitCount = Math.max(0, ...Array.from(nonWildSuitCounts.values()));
  const isFlush = maxSuitCount + wildCount >= 5;

  // Straight: 5 distinct consecutive rank indices. Doubles count once.
  const ranks = cards.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
  const uniq = [...new Set(ranks)];
  let isStraight = false;
  if (uniq.length === 5) {
    if (uniq[4] - uniq[0] === 4) isStraight = true;
    // wheel: A-2-3-4-5 -> indices [2,3,4,5,14]
    if (uniq.join(',') === '2,3,4,5,14') isStraight = true;
  }

  // 5-of-a-kind is reachable via joker substitution or a doubled rank
  // that lands alongside enough copies of the same rank.
  if (multiset[0] >= 5) return 'FIVE_OF_A_KIND';

  if (isStraight && isFlush) {
    if (uniq.join(',') === '10,11,12,13,14') return 'ROYAL_FLUSH';
    return 'STRAIGHT_FLUSH';
  }
  if (multiset[0] === 4) return 'FOUR_OF_A_KIND';
  if (multiset[0] === 3 && multiset[1] >= 2) return 'FULL_HOUSE';
  if (isFlush) return 'FLUSH';
  if (isStraight) return 'STRAIGHT';
  if (multiset[0] === 3) return 'THREE_OF_A_KIND';
  if (multiset[0] === 2 && multiset[1] === 2) return 'TWO_PAIR';
  if (multiset[0] === 2) return 'PAIR';
  return 'HIGH_CARD';
};

// Recursive joker substitution — tries every rank+suit combination for
// each joker in the line, returning the best resulting hand rank. Up to
// 2 jokers per line is the realistic upper bound (Easy difficulty ships
// 2 jokers in the deck), so worst case 52^2 = 2704 evaluations per line
// — fast enough to run on every score recomputation.
const evalWithJokers = (
  standards: StandardCard[],
  jokerCount: number
): HandRank => {
  if (jokerCount === 0) return evalStandardFive(standards);
  let best: HandRank = 'HIGH_CARD';
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const sub: StandardCard = { kind: 'standard', rank, suit };
      const result = evalWithJokers([...standards, sub], jokerCount - 1);
      if (HAND_TIER[result] > HAND_TIER[best]) best = result;
    }
  }
  return best;
};

// Evaluate any 5-card line. Returns null if any slot is empty.
export const evaluateLine = (line: (Card | null)[]): HandRank | null => {
  if (line.length !== 5) throw new Error('Line must have exactly 5 slots');
  if (line.some(c => c === null)) return null;
  const cards = line as Card[];
  const jokers = cards.filter(isJoker).length;
  if (jokers === 0) return evalStandardFive(cards as StandardCard[]);
  const standards = cards.filter(c => !isJoker(c)) as StandardCard[];
  return evalWithJokers(standards, jokers);
};
