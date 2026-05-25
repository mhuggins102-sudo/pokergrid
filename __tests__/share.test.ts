import { Card } from '../src/game/cards';
import { Grid } from '../src/game/grid';
import { encodeGrid } from '../src/ui/share';

const C = (rank: string, suit: 'H' | 'S' | 'D' | 'C'): Card => ({
  kind: 'standard',
  rank: rank as any,
  suit,
});

const emptyGrid = (): Grid => Array.from({ length: 25 }, () => null) as Grid;

describe('share URL encoder', () => {
  test('empty grid encodes to 50 underscores', () => {
    expect(encodeGrid(emptyGrid())).toBe('_'.repeat(50));
  });

  test('mixed grid encodes each cell as exactly 2 chars', () => {
    const g = emptyGrid();
    g[0] = C('A', 'H');
    g[1] = { kind: 'joker' };
    g[24] = C('10', 'C'); // rank '10' must collapse to 'T'
    const enc = encodeGrid(g);
    expect(enc.length).toBe(50);
    expect(enc.slice(0, 2)).toBe('AH');
    expect(enc.slice(2, 4)).toBe('JK');
    expect(enc.slice(4, 6)).toBe('__');
    expect(enc.slice(48, 50)).toBe('TC');
  });

  test('every rank/suit combo is two chars', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits: ('H' | 'S' | 'D' | 'C')[] = ['H', 'S', 'D', 'C'];
    for (const r of ranks) {
      for (const s of suits) {
        const g = emptyGrid();
        g[0] = C(r, s);
        expect(encodeGrid(g).length).toBe(50);
      }
    }
  });
});
