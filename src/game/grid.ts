import { Card } from './cards';

export const GRID_SIZE = 5;
export const GRID_SLOTS = GRID_SIZE * GRID_SIZE; // 25

export type Grid = (Card | null)[]; // length 25, row-major

export const emptyGrid = (): Grid => Array.from({ length: GRID_SLOTS }, () => null);

export const lowestEmptySlot = (g: Grid): number | null => {
  for (let i = 0; i < g.length; i++) {
    if (g[i] === null) return i;
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

export const placeAtLowest = (g: Grid, card: Card): Grid => {
  const idx = lowestEmptySlot(g);
  if (idx === null) throw new Error('Grid is full');
  return placeAt(g, idx, card);
};

export const isFull = (g: Grid): boolean => g.every(c => c !== null);

export const rowOf = (idx: number): number => Math.floor(idx / GRID_SIZE);
export const colOf = (idx: number): number => idx % GRID_SIZE;

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
