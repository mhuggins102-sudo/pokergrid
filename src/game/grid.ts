import { Card } from './cards';

export const GRID_SIZE = 5;
export const GRID_SLOTS = GRID_SIZE * GRID_SIZE; // 25

export type Grid = (Card | null)[]; // length 25, row-major

// Spiral placement order, starting at center (R3C3 = slot 12) and expanding
// clockwise. The first card drawn goes in position 1 (slot 12); subsequent
// cards follow the spiral.
export const SPIRAL_ORDER: readonly number[] = [
  12, 13, 18, 17, 16, 11, 6, 7, 8, 9,
  14, 19, 24, 23, 22, 21, 20, 15, 10, 5,
  0, 1, 2, 3, 4,
];

// Reverse lookup: slot index → spiral position (1-25, 1-indexed for display).
export const SPIRAL_POSITION: readonly number[] = (() => {
  const arr = new Array<number>(GRID_SLOTS).fill(0);
  SPIRAL_ORDER.forEach((slot, i) => {
    arr[slot] = i + 1;
  });
  return arr;
})();

export const emptyGrid = (): Grid => Array.from({ length: GRID_SLOTS }, () => null);

// Returns the next empty slot following the spiral order, or null when full.
export const nextSpiralSlot = (g: Grid): number | null => {
  for (const slot of SPIRAL_ORDER) {
    if (g[slot] === null) return slot;
  }
  return null;
};

export const placeAt = (g: Grid, idx: number, card: Card): Grid => {
  if (idx < 0 || idx >= GRID_SLOTS) throw new Error(`Slot ${idx} out of range`);
  if (g[idx] !== null) throw new Error(`Slot ${idx} is not empty`);
  const next = g.slice();
  next[idx] = card;
  return next;
};

export const placeAtSpiralNext = (g: Grid, card: Card): Grid => {
  const idx = nextSpiralSlot(g);
  if (idx === null) throw new Error('Grid is full');
  return placeAt(g, idx, card);
};

export const isFull = (g: Grid): boolean => g.every(c => c !== null);

export const rowOf = (idx: number): number => Math.floor(idx / GRID_SIZE);
export const colOf = (idx: number): number => idx % GRID_SIZE;

// Border slots (perimeter): top row, bottom row, leftmost + rightmost of middle rows.
export const BORDER_SLOTS: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    const r = rowOf(i);
    const c = colOf(i);
    if (r === 0 || r === GRID_SIZE - 1 || c === 0 || c === GRID_SIZE - 1) out.push(i);
  }
  return out;
})();

// 3x3 inner slots.
export const INNER_SLOTS: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    const r = rowOf(i);
    const c = colOf(i);
    if (r >= 1 && r <= 3 && c >= 1 && c <= 3) out.push(i);
  }
  return out;
})();

// The four corner slots.
export const CORNER_SLOTS: readonly number[] = [0, 4, 20, 24];

export const rows = (g: Grid): (Card | null)[][] => {
  const out: (Card | null)[][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    out.push(g.slice(r * GRID_SIZE, (r + 1) * GRID_SIZE));
  }
  return out;
};

export const cols = (g: Grid): (Card | null)[][] => {
  const out: (Card | null)[][] = [];
  for (let c = 0; c < GRID_SIZE; c++) {
    const col: (Card | null)[] = [];
    for (let r = 0; r < GRID_SIZE; r++) col.push(g[r * GRID_SIZE + c]);
    out.push(col);
  }
  return out;
};

export type LineKind = 'row' | 'col';
export interface Line {
  kind: LineKind;
  index: number; // 0-4
  cards: (Card | null)[];
}

export const lines = (g: Grid): Line[] => {
  const out: Line[] = [];
  rows(g).forEach((cards, i) => out.push({ kind: 'row', index: i, cards }));
  cols(g).forEach((cards, i) => out.push({ kind: 'col', index: i, cards }));
  return out;
};

// ---------- Slide helpers ----------

export type Direction = 'up' | 'down' | 'left' | 'right';

const STEP: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

// The chain that participates in a slide starting at `slot` in `direction`:
// the selected card plus the contiguous filled cards in front of it (in the
// direction of motion). The card BEHIND the selected card stays put.
//
// Examples (column with R2/R3/R4/R5 filled, R1 empty):
//   slideChain(slot=R5, 'up')   → {R5, R4, R3, R2}   (all four slide)
//   slideChain(slot=R4, 'up')   → {R4, R3, R2}       (R5 stays put)
//   slideChain(slot=R3, 'down') → {R3, R4, R5}       (R2 stays put)
export const slideChain = (g: Grid, slot: number, direction: Direction): number[] => {
  if (g[slot] === null) return [];
  const [dr, dc] = STEP[direction];
  const out: number[] = [slot];
  let r = rowOf(slot);
  let c = colOf(slot);
  while (true) {
    r += dr;
    c += dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) break;
    const idx = r * GRID_SIZE + c;
    if (g[idx] === null) break;
    out.push(idx);
  }
  return out;
};

// How far the chain at `slot` can slide in `direction`. 0 = blocked.
export const slideChainMaxDistance = (
  g: Grid,
  slot: number,
  direction: Direction
): number => {
  const chain = slideChain(g, slot, direction);
  if (chain.length === 0) return 0;
  const [dr, dc] = STEP[direction];
  // Leading edge is always the last element of the chain.
  const leadIdx = chain[chain.length - 1];
  let r = rowOf(leadIdx);
  let c = colOf(leadIdx);
  let dist = 0;
  while (true) {
    r += dr;
    c += dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) break;
    if (g[r * GRID_SIZE + c] !== null) break;
    dist++;
  }
  return dist;
};

// Empty slots reachable by the chain's leading edge in `direction` (1..max).
export const slideTargets = (g: Grid, slot: number, direction: Direction): number[] => {
  const max = slideChainMaxDistance(g, slot, direction);
  if (max === 0) return [];
  const chain = slideChain(g, slot, direction);
  const [dr, dc] = STEP[direction];
  const leadIdx = chain[chain.length - 1];
  const out: number[] = [];
  let r = rowOf(leadIdx);
  let c = colOf(leadIdx);
  for (let d = 1; d <= max; d++) {
    r += dr;
    c += dc;
    out.push(r * GRID_SIZE + c);
  }
  return out;
};

// All reachable leading-edge destinations across 4 directions.
export const allSlideTargets = (g: Grid, slot: number): number[] => {
  const out: number[] = [];
  for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
    out.push(...slideTargets(g, slot, d));
  }
  return out;
};

