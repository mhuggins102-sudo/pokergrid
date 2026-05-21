import { fullDeck } from '../src/game/cards';
import { freshShuffledDeck, seededRng, shuffle } from '../src/game/deck';

describe('deck', () => {
  test('shuffle preserves all elements', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffle(original);
    expect(shuffled.sort((a, b) => a - b)).toEqual(original);
  });

  test('seeded shuffle is deterministic', () => {
    const rngA = seededRng(42);
    const rngB = seededRng(42);
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rngA);
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rngB);
    expect(a).toEqual(b);
  });

  test('freshShuffledDeck contains a full 53-card set', () => {
    const deck = freshShuffledDeck(seededRng(1));
    expect(deck).toHaveLength(53);
    // Same set as fullDeck (order-independent comparison)
    const labelOf = (c: { kind: string } | any): string =>
      c.kind === 'joker' ? 'JK' : `${c.rank}${c.suit}`;
    expect(deck.map(labelOf).sort()).toEqual(fullDeck().map(labelOf).sort());
  });
});
