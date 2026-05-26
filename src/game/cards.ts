export type Suit = 'H' | 'S' | 'C' | 'D';
export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export const SUITS: Suit[] = ['H', 'S', 'C', 'D'];
export const RANKS: Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

// Targets-Up reward: when the player earns an S-tier win, they pick one
// card on the grid to supercharge with one of two effects (RNG picks).
//   - 'wild':   the card's suit becomes flexible for flush / straight-
//               flush evaluation. Rank is unchanged. Doesn't help
//               straights, doesn't count as a suit for per-suit density.
//   - 'double': the card counts as 2 same-rank cards for pair-class
//               hand evaluation (PAIR / TWO PAIR / TRIPLE / FULL HOUSE
//               / FOUR / FIVE OF A KIND) and adds +1 to the per-suit
//               density bonus. Counts as 1 for straights.
// The two are mutually exclusive on a card; re-supercharging replaces.
export type Supercharge = 'wild' | 'double';

export type StandardCard = {
  kind: 'standard';
  rank: Rank;
  suit: Suit;
  supercharge?: Supercharge;
};
export type JokerCard = { kind: 'joker' };
export type Card = StandardCard | JokerCard;

export const isJoker = (c: Card): c is JokerCard => c.kind === 'joker';

export const fullDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ kind: 'standard', rank, suit });
    }
  }
  deck.push({ kind: 'joker' });
  return deck;
};

// Movement pip (used by Spades to slide and Hearts to bound swap distance):
// A=1, 2-10=face value, J=11, Q=12, K=13.
export const movementPip = (c: StandardCard): number => {
  switch (c.rank) {
    case 'A':
      return 1;
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    default:
      return parseInt(c.rank, 10);
  }
};

// Club bonus uses pip with A=14
export const clubPip = (c: StandardCard): number => {
  switch (c.rank) {
    case 'A':
      return 14;
    case 'J':
      return 11;
    case 'Q':
      return 12;
    case 'K':
      return 13;
    default:
      return parseInt(c.rank, 10);
  }
};

// Rank index for poker hand evaluation (A is high; wheel handled separately)
export const rankIndex = (r: Rank): number => {
  switch (r) {
    case 'A':
      return 14;
    case 'K':
      return 13;
    case 'Q':
      return 12;
    case 'J':
      return 11;
    case '10':
      return 10;
    default:
      return parseInt(r, 10);
  }
};

export const cardLabel = (c: Card): string =>
  c.kind === 'joker' ? 'JK' : `${c.rank}${c.suit}`;
