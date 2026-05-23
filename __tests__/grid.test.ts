import { StandardCard } from '../src/game/cards';
import {
  allSlideTargets,
  BORDER_SLOTS,
  CORNER_SLOTS,
  cols,
  emptyGrid,
  GRID_SLOTS,
  INNER_SLOTS,
  isFull,
  lines,
  nextSpiralSlot,
  placeAt,
  placeAtSpiralNext,
  rows,
  slideTargets,
  SPIRAL_ORDER,
  SPIRAL_POSITION,
} from '../src/game/grid';

const C = (rank: any, suit: any): StandardCard => ({ kind: 'standard', rank, suit });

describe('grid basics', () => {
  test('emptyGrid has 25 nulls', () => {
    const g = emptyGrid();
    expect(g).toHaveLength(GRID_SLOTS);
    expect(g.every(c => c === null)).toBe(true);
  });

  test('placeAt throws when slot occupied', () => {
    const g = placeAt(emptyGrid(), 0, C('A', 'H'));
    expect(() => placeAt(g, 0, C('2', 'H'))).toThrow();
  });

  test('isFull only when all slots are filled', () => {
    let g = emptyGrid();
    for (let i = 0; i < GRID_SLOTS - 1; i++) g[i] = C('2', 'H');
    expect(isFull(g)).toBe(false);
    g[GRID_SLOTS - 1] = C('2', 'H');
    expect(isFull(g)).toBe(true);
  });

  test('rows / cols / lines partition correctly', () => {
    const g = emptyGrid();
    for (let i = 0; i < GRID_SLOTS; i++) g[i] = C('2', 'H');
    expect(rows(g)).toHaveLength(5);
    expect(cols(g)).toHaveLength(5);
    expect(lines(g)).toHaveLength(10);
  });

  test('BORDER_SLOTS covers the 16 perimeter slots', () => {
    expect(BORDER_SLOTS).toHaveLength(16);
    expect(BORDER_SLOTS).toContain(0);
    expect(BORDER_SLOTS).toContain(4);
    expect(BORDER_SLOTS).toContain(20);
    expect(BORDER_SLOTS).toContain(24);
    expect(BORDER_SLOTS).not.toContain(12);
  });

  test('INNER_SLOTS is the 3x3 center', () => {
    expect(INNER_SLOTS).toHaveLength(9);
    expect(INNER_SLOTS).toContain(12);
    expect(INNER_SLOTS).not.toContain(0);
  });

  test('CORNER_SLOTS are the four corners', () => {
    expect(CORNER_SLOTS).toEqual([0, 4, 20, 24]);
  });
});

describe('spiral placement', () => {
  test('SPIRAL_ORDER starts at center and matches the spec', () => {
    expect(SPIRAL_ORDER[0]).toBe(12); // R3C3
    expect(SPIRAL_ORDER[1]).toBe(13); // R3C4
    expect(SPIRAL_ORDER[2]).toBe(18); // R4C4
    expect(SPIRAL_ORDER[3]).toBe(17); // R4C3
    expect(SPIRAL_ORDER).toHaveLength(GRID_SLOTS);
    expect(new Set(SPIRAL_ORDER).size).toBe(GRID_SLOTS); // each slot appears once
  });

  test('SPIRAL_POSITION maps slot → position 1..25', () => {
    expect(SPIRAL_POSITION[12]).toBe(1);
    expect(SPIRAL_POSITION[13]).toBe(2);
    expect(SPIRAL_POSITION[18]).toBe(3);
    expect(SPIRAL_POSITION[17]).toBe(4);
    expect(SPIRAL_POSITION[4]).toBe(25); // last in spiral (R1C5)
  });

  test('nextSpiralSlot follows spiral order', () => {
    let g = emptyGrid();
    expect(nextSpiralSlot(g)).toBe(12);
    g = placeAt(g, 12, C('A', 'H'));
    expect(nextSpiralSlot(g)).toBe(13);
    g = placeAt(g, 13, C('2', 'H'));
    expect(nextSpiralSlot(g)).toBe(18);
  });

  test('placeAtSpiralNext fills successively in spiral order', () => {
    let g = emptyGrid();
    g = placeAtSpiralNext(g, C('A', 'H'));
    g = placeAtSpiralNext(g, C('2', 'H'));
    g = placeAtSpiralNext(g, C('3', 'H'));
    g = placeAtSpiralNext(g, C('4', 'H'));
    expect(g[12]).toEqual(C('A', 'H'));
    expect(g[13]).toEqual(C('2', 'H'));
    expect(g[18]).toEqual(C('3', 'H'));
    expect(g[17]).toEqual(C('4', 'H'));
  });

  test('nextSpiralSlot returns null when grid is full', () => {
    const g = emptyGrid();
    for (const slot of SPIRAL_ORDER) g[slot] = C('2', 'C');
    expect(nextSpiralSlot(g)).toBeNull();
  });
});

describe('slide helpers', () => {
  test('slideTargets right stops at wall', () => {
    let g = emptyGrid();
    g = placeAt(g, 10, C('A', 'H')); // R3C1
    expect(slideTargets(g, 10, 'right')).toEqual([11, 12, 13, 14]);
  });

  test('slideTargets right stops at blocker', () => {
    let g = emptyGrid();
    g = placeAt(g, 10, C('A', 'H')); // R3C1
    g = placeAt(g, 12, C('K', 'C')); // R3C3 blocker
    expect(slideTargets(g, 10, 'right')).toEqual([11]);
  });

  test('slideTargets up/down/left work symmetrically', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H')); // center
    expect(slideTargets(g, 12, 'right')).toEqual([13, 14]);
    expect(slideTargets(g, 12, 'left')).toEqual([11, 10]);
    expect(slideTargets(g, 12, 'down')).toEqual([17, 22]);
    expect(slideTargets(g, 12, 'up')).toEqual([7, 2]);
  });

  test('allSlideTargets returns every reachable slot across 4 directions', () => {
    let g = emptyGrid();
    g = placeAt(g, 12, C('A', 'H'));
    const all = allSlideTargets(g, 12).sort((a, b) => a - b);
    expect(all).toEqual([2, 7, 10, 11, 13, 14, 17, 22]);
  });
});
