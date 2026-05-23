import { Card, isJoker, StandardCard } from './cards';
import {
  allSlideTargets,
  Direction,
  Grid,
  GRID_SIZE,
  GRID_SLOTS,
  rowOf,
  colOf,
  slideChain,
  slideChainMaxDistance,
  slideTargets,
} from './grid';

// ---------- ♥ Hop (heart) ----------
// Swap any two cards that share a row OR share a column. Suit and pip are
// irrelevant. Joker is a valid participant.

export const validHopSwaps = (grid: Grid): [number, number][] => {
  const pairs: [number, number][] = [];

  // Row pairs
  for (let r = 0; r < GRID_SIZE; r++) {
    const occupied: number[] = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      const i = r * GRID_SIZE + c;
      if (grid[i] !== null) occupied.push(i);
    }
    for (let i = 0; i < occupied.length; i++) {
      for (let j = i + 1; j < occupied.length; j++) {
        pairs.push([occupied[i], occupied[j]]);
      }
    }
  }

  // Column pairs (row and col are disjoint at the slot level so no dedup needed)
  for (let c = 0; c < GRID_SIZE; c++) {
    const occupied: number[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const i = r * GRID_SIZE + c;
      if (grid[i] !== null) occupied.push(i);
    }
    for (let i = 0; i < occupied.length; i++) {
      for (let j = i + 1; j < occupied.length; j++) {
        pairs.push([occupied[i], occupied[j]]);
      }
    }
  }

  return pairs;
};

export const canHop = (grid: Grid): boolean => validHopSwaps(grid).length > 0;

export const executeHop = (grid: Grid, i: number, j: number): Grid => {
  const a = grid[i];
  const b = grid[j];
  if (!a || !b) throw new Error('Hop: both slots must be filled');
  if (rowOf(i) !== rowOf(j) && colOf(i) !== colOf(j)) {
    throw new Error('Hop: cards must share a row or column');
  }
  const next = grid.slice();
  next[i] = b;
  next[j] = a;
  return next;
};

// ---------- ♠ Slide (spade) ----------
// Pick a card on the grid + a direction + a distance. The contiguous chain of
// cards containing the picked card (column for up/down, row for left/right)
// slides as a unit. Distance 1..max where max is empty space until a wall or
// non-chain blocker.

export interface SlideMove {
  from: number; // user-selected source slot (any card in the chain)
  direction: Direction;
  distance: number; // 1..maxDistance
  leadingDest: number; // slot the leading edge lands in (for UI highlight)
}

export const validSlideSources = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    if (!grid[i]) continue;
    if (allSlideTargets(grid, i).length > 0) out.push(i);
  }
  return out;
};

export const slideDestinationsFrom = (grid: Grid, from: number): SlideMove[] => {
  const out: SlideMove[] = [];
  for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
    const leads = slideTargets(grid, from, d);
    leads.forEach((leadingDest, i) => {
      out.push({ from, direction: d, distance: i + 1, leadingDest });
    });
  }
  return out;
};

export const canSlide = (grid: Grid): boolean => validSlideSources(grid).length > 0;

export const executeSlide = (
  grid: Grid,
  from: number,
  direction: Direction,
  distance: number
): Grid => {
  if (!grid[from]) throw new Error('Slide: source slot is empty');
  const chain = slideChain(grid, from, direction);
  if (chain.length === 0) throw new Error('Slide: no chain at source');
  const max = slideChainMaxDistance(grid, from, direction);
  if (distance < 1 || distance > max) {
    throw new Error(`Slide: distance ${distance} out of range (max ${max})`);
  }
  const step =
    direction === 'up' ? -GRID_SIZE
    : direction === 'down' ? GRID_SIZE
    : direction === 'left' ? -1
    : 1;
  const next = grid.slice();
  // Clear all chain positions first, then write to shifted positions.
  for (const idx of chain) next[idx] = null;
  for (const idx of chain) next[idx + step * distance] = grid[idx];
  return next;
};

// ---------- ♦ Destroy (diamond) ----------
// Trash any one card on the grid (any rank/suit, including joker).

export const destroyableSlots = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    if (grid[i] !== null) out.push(i);
  }
  return out;
};

export const canDestroy = (grid: Grid): boolean => destroyableSlots(grid).length > 0;

export const executeDestroy = (grid: Grid, slot: number): { grid: Grid; removed: Card } => {
  const card = grid[slot];
  if (!card) throw new Error('Destroy: slot is empty');
  const next = grid.slice();
  next[slot] = null;
  return { grid: next, removed: card };
};

// ---------- ♣ Cards (club) ----------
// Pure deck-management; the bonus-card flow lives in state.ts and bonusCards.ts.
// Here we expose only the "is this perk legal at all" check.

export const canDrawBonus = (bonusDeckSize: number): boolean => bonusDeckSize >= 1;

// ---------- Generic legality ----------

export const suitActionAvailable = (
  drawn: Card | null,
  grid: Grid,
  bonusDeckSize: number
): boolean => {
  if (!drawn || isJoker(drawn)) return false;
  switch (drawn.suit) {
    case 'H':
      return canHop(grid);
    case 'S':
      return canSlide(grid);
    case 'D':
      return canDestroy(grid);
    case 'C':
      return canDrawBonus(bonusDeckSize);
  }
};
