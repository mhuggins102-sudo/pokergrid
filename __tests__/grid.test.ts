import { StandardCard } from '../src/game/cards';
import {
  cols,
  emptyGrid,
  GRID_SLOTS,
  isFull,
  lowestEmptySlot,
  placeAt,
  placeAtLowest,
  rows,
  lines,
} from '../src/game/grid';

const C = (rank: any, suit: any): StandardCard => ({ kind: 'standard', rank, suit });

describe('grid', () => {
  test('emptyGrid has 25 nulls', () => {
    const g = emptyGrid();
    expect(g).toHaveLength(GRID_SLOTS);
    expect(g.every(c => c === null)).toBe(true);
  });

  test('lowestEmptySlot returns first null', () => {
    const g = emptyGrid();
    expect(lowestEmptySlot(g)).toBe(0);
    const g2 = placeAt(g, 0, C('2', 'H'));
    expect(lowestEmptySlot(g2)).toBe(1);
  });

  test('placeAtLowest fills successively', () => {
    let g = emptyGrid();
    g = placeAtLowest(g, C('A', 'H'));
    g = placeAtLowest(g, C('2', 'H'));
    g = placeAtLowest(g, C('3', 'H'));
    expect(g[0]).toEqual(C('A', 'H'));
    expect(g[1]).toEqual(C('2', 'H'));
    expect(g[2]).toEqual(C('3', 'H'));
    expect(g[3]).toBe(null);
  });

  test('placeAt throws when slot occupied', () => {
    const g = placeAt(emptyGrid(), 0, C('A', 'H'));
    expect(() => placeAt(g, 0, C('2', 'H'))).toThrow();
  });

  test('isFull only when all slots are filled', () => {
    let g = emptyGrid();
    for (let i = 0; i < GRID_SLOTS - 1; i++) g = placeAtLowest(g, C('2', 'H'));
    expect(isFull(g)).toBe(false);
    g = placeAtLowest(g, C('2', 'H'));
    expect(isFull(g)).toBe(true);
  });

  test('rows / cols / lines partition correctly', () => {
    const g = emptyGrid();
    for (let i = 0; i < GRID_SLOTS; i++) g[i] = C('2', 'H');
    expect(rows(g)).toHaveLength(5);
    expect(cols(g)).toHaveLength(5);
    expect(lines(g)).toHaveLength(10);
    expect(rows(g)[0]).toHaveLength(5);
    expect(cols(g)[0]).toHaveLength(5);
  });

  test('row 0 is slots 0-4, col 0 is slots 0,5,10,15,20', () => {
    const g = emptyGrid();
    g[0] = C('A', 'H');
    g[1] = C('2', 'H');
    g[4] = C('5', 'H');
    g[5] = C('6', 'H');
    g[20] = C('K', 'H');
    expect(rows(g)[0][0]).toEqual(C('A', 'H'));
    expect(rows(g)[0][4]).toEqual(C('5', 'H'));
    expect(cols(g)[0][0]).toEqual(C('A', 'H'));
    expect(cols(g)[0][1]).toEqual(C('6', 'H'));
    expect(cols(g)[0][4]).toEqual(C('K', 'H'));
  });
});
