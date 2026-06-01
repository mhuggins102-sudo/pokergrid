import { StandardCard } from '../src/game/cards';
import { seededRng } from '../src/game/deck';
import {
  BonusCard,
  DOUBLER_CARD,
  MEGA_DESTROY_CARD,
  POWER_SWAP_CARD,
  SIDE_SLIDE_CARD,
  WILDCARD_CARD,
} from '../src/game/bonusCards';
import { findChallenge } from '../src/game/challenges';
import { GameState, newGame, step } from '../src/game/state';

const C = (rank: StandardCard['rank'], suit: StandardCard['suit']): StandardCard => ({
  kind: 'standard',
  rank,
  suit,
});

// Three Tricks challenge — seed a Three-Tricks-shaped state from newGame.
// The challenge itself now picks 3 at random from SPECIAL_DECK_POOL, but
// the tests pin a deterministic hand by passing the specials explicitly
// so individual reducer flows can be asserted against a known layout.
const threeTricks = (
  initial: BonusCard[] = [POWER_SWAP_CARD, DOUBLER_CARD, WILDCARD_CARD]
): GameState =>
  newGame(
    'hard',
    seededRng(7),
    findChallenge('three-tricks').scoreTarget,
    undefined,
    false,
    false,
    [],
    [],
    [],
    false,
    true, // noBonusCards
    initial
  );

describe('Three Tricks challenge', () => {
  it('starts with three specials in the hand and an empty bonus deck', () => {
    const s = threeTricks();
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards.map(c => c.specialKind)).toEqual([
      'power-swap',
      'doubler',
      'wildcard',
    ]);
    expect(s.bonusDeck).toEqual([]);
    expect(s.noBonusCards).toBe(true);
  });

  it('Doubler converts a chosen standard card to a "double" and marks itself used', () => {
    let s = threeTricks();
    // Place a known card at slot 13 so we can target it. The center
    // slot was auto-placed during newGame; we overwrite for a clean
    // assertion target.
    const grid = s.grid.slice();
    grid[13] = C('7', 'H');
    s = { ...s, grid };

    // Doubler is at index 1 in the seeded hand.
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    expect(s.phase.kind).toBe('awaiting-special-doubler');

    s = step(s, { type: 'RESOLVE_DOUBLER', slot: 13 });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[13]).toEqual({
      kind: 'standard',
      rank: '7',
      suit: 'H',
      supercharge: 'double',
    });
    // Hand still has all 3 cards — Doubler is now flagged `used`.
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards.map(c => c.used ?? false)).toEqual([false, true, false]);
  });

  it('Wildcard converts a chosen card to a "wild" and marks itself used', () => {
    let s = threeTricks();
    const grid = s.grid.slice();
    grid[13] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 2 });
    expect(s.phase.kind).toBe('awaiting-special-wildcard');

    s = step(s, { type: 'RESOLVE_WILDCARD', slot: 13 });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[13]).toEqual({
      kind: 'standard',
      rank: 'K',
      suit: 'C',
      supercharge: 'wild',
    });
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards.map(c => c.used ?? false)).toEqual([false, false, true]);
  });

  it('Power Swap swaps two unrestricted grid cards and marks itself used', () => {
    let s = threeTricks();
    // Two cards in disjoint rows AND columns — would be illegal under
    // the normal ♥ Hop swap. Power Swap should allow it.
    const grid = s.grid.slice();
    grid[0] = C('A', 'H'); // R0C0
    grid[24] = C('5', 'S'); // R4C4
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-power-swap-source');

    s = step(s, { type: 'RESOLVE_POWER_SWAP_SOURCE', slot: 0 });
    expect(s.phase.kind).toBe('awaiting-special-power-swap-dest');

    s = step(s, { type: 'RESOLVE_POWER_SWAP', i: 0, j: 24 });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[0]).toEqual(C('5', 'S'));
    expect(s.grid[24]).toEqual(C('A', 'H'));
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards.map(c => c.used ?? false)).toEqual([true, false, false]);
  });

  it('a used special card refuses to re-activate', () => {
    let s = threeTricks();
    const grid = s.grid.slice();
    grid[13] = C('7', 'H');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    s = step(s, { type: 'RESOLVE_DOUBLER', slot: 13 });
    // Now try to re-activate the spent Doubler. The reducer should
    // bail and leave the state untouched.
    const before = s;
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    expect(s).toBe(before);
  });

  it('Doubler / Wildcard refuse to target a joker', () => {
    let s = threeTricks();
    const grid = s.grid.slice();
    grid[13] = { kind: 'joker' };
    s = { ...s, grid };

    // Activate Doubler. supercharchableSlots excludes jokers, so the
    // 13 target won't be in `slots` and the reducer should ignore it.
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 1 });
    const before = s;
    s = step(s, { type: 'RESOLVE_DOUBLER', slot: 13 });
    // No mutation, phase unchanged.
    expect(s).toBe(before);
  });

  it('CANCEL_ACTION on power-swap-dest returns to source selection', () => {
    let s = threeTricks();
    const grid = s.grid.slice();
    grid[0] = C('A', 'H');
    grid[1] = C('5', 'S');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'RESOLVE_POWER_SWAP_SOURCE', slot: 0 });
    expect(s.phase.kind).toBe('awaiting-special-power-swap-dest');

    s = step(s, { type: 'CANCEL_ACTION' });
    expect(s.phase.kind).toBe('awaiting-special-power-swap-source');
    // Card is still in the hand — cancellation should NOT consume it.
    expect(s.bonusCards).toHaveLength(3);
  });

  it('Resolving a special action is undoable', () => {
    let s = threeTricks();
    const grid = s.grid.slice();
    grid[13] = C('7', 'H');
    s = { ...s, grid };

    const beforeWildcard = s;
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 2 });
    s = step(s, { type: 'RESOLVE_WILDCARD', slot: 13 });
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards[2].used).toBe(true);
    expect(s.grid[13]).toEqual({
      kind: 'standard',
      rank: '7',
      suit: 'H',
      supercharge: 'wild',
    });

    // Undo restores the un-used flag AND the un-supercharged grid.
    s = step(s, { type: 'UNDO' });
    expect(s.bonusCards).toHaveLength(3);
    expect(s.bonusCards[2].used ?? false).toBe(false);
    expect(s.grid[13]).toEqual(beforeWildcard.grid[13]);
  });

  it('Mega Destroy: toggle up to 5 targets and confirm to destroy them all', () => {
    let s = threeTricks([MEGA_DESTROY_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    // 6 cards on the grid — Mega Destroy can take 5, leaving 1 behind.
    grid[0] = C('A', 'H');
    grid[1] = C('2', 'C');
    grid[2] = C('3', 'D');
    grid[3] = C('4', 'S');
    grid[4] = C('5', 'H');
    grid[5] = C('6', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-mega-destroy');

    // Select 5 slots; verify mid-state selection.
    for (const slot of [0, 1, 2, 3, 4]) {
      s = step(s, { type: 'TOGGLE_MEGA_DESTROY_TARGET', slot });
    }
    if (s.phase.kind !== 'awaiting-special-mega-destroy') {
      throw new Error('phase changed unexpectedly');
    }
    expect(s.phase.selected).toEqual([0, 1, 2, 3, 4]);

    // Try a 6th — cap blocks it.
    const before = s;
    s = step(s, { type: 'TOGGLE_MEGA_DESTROY_TARGET', slot: 5 });
    expect(s).toBe(before);

    // Untoggle slot 2.
    s = step(s, { type: 'TOGGLE_MEGA_DESTROY_TARGET', slot: 2 });
    if (s.phase.kind !== 'awaiting-special-mega-destroy') {
      throw new Error('phase changed unexpectedly');
    }
    expect(s.phase.selected).toEqual([0, 1, 3, 4]);

    // Commit.
    s = step(s, { type: 'RESOLVE_MEGA_DESTROY' });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[0]).toBeNull();
    expect(s.grid[1]).toBeNull();
    expect(s.grid[3]).toBeNull();
    expect(s.grid[4]).toBeNull();
    // Untoggled / untouched slots remain.
    expect(s.grid[2]).toEqual(C('3', 'D'));
    expect(s.grid[5]).toEqual(C('6', 'C'));
    // Destroyed cards land in discards.
    expect(s.discards.length).toBeGreaterThanOrEqual(4);
    // Card is flagged used.
    expect(s.bonusCards[0].used).toBe(true);
  });

  it('Mega Destroy refuses to commit with zero targets selected', () => {
    let s = threeTricks([MEGA_DESTROY_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[0] = C('A', 'H');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    const before = s;
    s = step(s, { type: 'RESOLVE_MEGA_DESTROY' });
    // No targets selected → no-op.
    expect(s).toBe(before);
  });

  it('Side Slide: a row of 3 cards slides down one row', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    // Build a row of 3 adjacent cards in row 0, with the row below empty.
    const grid = s.grid.slice();
    // Wipe the auto-placed center card so it doesn't sit in the chain's
    // landing area on row 1.
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    grid[2] = C('Q', 'D');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-side-slide-source');

    s = step(s, { type: 'SIDE_SLIDE_SELECT_SOURCE', slot: 1 });
    expect(s.phase.kind).toBe('awaiting-special-side-slide-dest');

    // Slide the whole chain down by 1 (perpendicular to the row).
    s = step(s, { type: 'RESOLVE_SIDE_SLIDE', from: 1, direction: 'down', distance: 1 });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[0]).toBeNull();
    expect(s.grid[1]).toBeNull();
    expect(s.grid[2]).toBeNull();
    expect(s.grid[5]).toEqual(C('A', 'H'));
    expect(s.grid[6]).toEqual(C('K', 'C'));
    expect(s.grid[7]).toEqual(C('Q', 'D'));
    expect(s.bonusCards[0].used).toBe(true);
  });

  it('Side Slide: a column of 2 cards slides right one column', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null; // clear the auto-placed center
    // Column at C0, rows 0..1.
    grid[0] = C('A', 'H');
    grid[5] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'SIDE_SLIDE_SELECT_SOURCE', slot: 0 });
    s = step(s, { type: 'RESOLVE_SIDE_SLIDE', from: 0, direction: 'right', distance: 1 });

    expect(s.grid[0]).toBeNull();
    expect(s.grid[5]).toBeNull();
    expect(s.grid[1]).toEqual(C('A', 'H'));
    expect(s.grid[6]).toEqual(C('K', 'C'));
  });

  it('Side Slide rejects a single isolated card (chain length < 2)', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H'); // only this one card, isolated.
    s = { ...s, grid };

    const before = s;
    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    // No valid side-slide sources → state unchanged.
    expect(s).toBe(before);
  });
});
