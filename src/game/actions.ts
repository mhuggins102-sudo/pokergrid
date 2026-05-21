import {
  Card,
  StandardCard,
  Suit,
  clubPip,
  isJoker,
  spadePip,
} from './cards';
import { Grid, GRID_SLOTS } from './grid';
import { HandRank } from './hands';
import { ClubBonus, HAND_BASE_VALUE } from './scoring';

// ---------- Hearts ----------

export const validHeartsSwaps = (grid: Grid): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    const a = grid[i];
    if (!a || isJoker(a)) continue;
    for (let j = i + 1; j < GRID_SLOTS; j++) {
      const b = grid[j];
      if (!b || isJoker(b)) continue;
      if (a.suit === b.suit) out.push([i, j]);
    }
  }
  return out;
};

export const canExecuteHearts = (grid: Grid): boolean =>
  validHeartsSwaps(grid).length > 0;

export const executeHearts = (grid: Grid, i: number, j: number): Grid => {
  const a = grid[i];
  const b = grid[j];
  if (!a || !b) throw new Error('Hearts: both slots must be filled');
  if (isJoker(a) || isJoker(b)) throw new Error('Hearts: cannot swap a joker');
  if (a.suit !== b.suit) throw new Error('Hearts: cards must share a suit');
  const next = grid.slice();
  next[i] = b;
  next[j] = a;
  return next;
};

// ---------- Spades ----------

export const spadeDestination = (from: number, pip: number): number =>
  (from + pip) % GRID_SLOTS;

export interface SpadeMove {
  from: number;
  to: number;
}

export const validSpadeMoves = (grid: Grid, spade: StandardCard): SpadeMove[] => {
  const out: SpadeMove[] = [];
  const pip = spadePip(spade);
  for (let from = 0; from < GRID_SLOTS; from++) {
    if (!grid[from]) continue;
    const to = spadeDestination(from, pip);
    if (to === from) continue;
    if (grid[to] !== null) continue;
    out.push({ from, to });
  }
  return out;
};

export const canExecuteSpades = (grid: Grid, spade: StandardCard): boolean =>
  validSpadeMoves(grid, spade).length > 0;

export const executeSpades = (grid: Grid, from: number, to: number): Grid => {
  if (!grid[from]) throw new Error('Spades: source slot is empty');
  if (grid[to] !== null) throw new Error('Spades: destination is occupied');
  const next = grid.slice();
  next[to] = grid[from];
  next[from] = null;
  return next;
};

// ---------- Clubs ----------

const ALL_HANDS: HandRank[] = Object.keys(HAND_BASE_VALUE) as HandRank[];

export const availableClubTargets = (clubs: ClubBonus): HandRank[] =>
  ALL_HANDS.filter(h => clubs[h] === undefined);

export const canExecuteClubs = (clubs: ClubBonus): boolean =>
  availableClubTargets(clubs).length > 0;

export const executeClubs = (
  clubs: ClubBonus,
  club: StandardCard,
  hand: HandRank
): ClubBonus => {
  if (clubs[hand] !== undefined)
    throw new Error(`Clubs: ${hand} already boosted`);
  return { ...clubs, [hand]: clubPip(club) };
};

// ---------- Diamonds ----------

export const canExecuteDiamonds = (discardSize: number): boolean =>
  discardSize >= 1;

// ---------- Legality of any suit action given drawn card ----------

export const suitActionAvailable = (
  drawn: Card | null,
  grid: Grid,
  clubs: ClubBonus,
  discardSize: number
): boolean => {
  if (!drawn || isJoker(drawn)) return false;
  switch (drawn.suit) {
    case 'H':
      return canExecuteHearts(grid);
    case 'S':
      return canExecuteSpades(grid, drawn);
    case 'C':
      return canExecuteClubs(clubs);
    case 'D':
      return canExecuteDiamonds(discardSize);
  }
};
