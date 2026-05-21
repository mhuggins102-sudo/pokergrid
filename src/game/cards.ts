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

export type StandardCard = { kind: 'standard'; rank: Rank; suit: Suit };
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

// Spade movement uses pip with A=1
export const spadePip = (c: StandardCard): number => {
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
