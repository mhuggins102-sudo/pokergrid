import { Card, isJoker, StandardCard } from './cards';
import {
  allSlideTargets,
  Direction,
  Grid,
  GRID_SIZE,
  GRID_SLOTS,
  rowOf,
  colOf,
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
// Pick a card on the grid + a direction. The card may move to any empty slot
// in the unobstructed path in that direction (stops at a blocker or wall).

export interface SlideMove {
  from: number;
  to: number;
  direction: Direction;
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
    for (const to of slideTargets(grid, from, d)) {
      out.push({ from, to, direction: d });
    }
  }
  return out;
};

export const canSlide = (grid: Grid): boolean => validSlideSources(grid).length > 0;

export const executeSlide = (grid: Grid, from: number, to: number): Grid => {
  if (!grid[from]) throw new Error('Slide: source slot is empty');
  if (grid[to] !== null) throw new Error('Slide: destination is occupied');
  // Must share a row or column with `from` (slide is straight-line).
  if (rowOf(from) !== rowOf(to) && colOf(from) !== colOf(to)) {
    throw new Error('Slide: destination must be in line with source');
  }
  const next = grid.slice();
  next[to] = grid[from];
  next[from] = null;
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
