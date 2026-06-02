import { StandardCard } from '../src/game/cards';
import { seededRng } from '../src/game/deck';
import {
  BonusCard,
  DOUBLER_CARD,
  JUMP_JUMP_CARD,
  MEGA_DESTROY_CARD,
  POWER_SWAP_CARD,
  SHUFFLE_CARD,
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

  it('Side Slide: pick a 3-card row sub-chain and slide it down', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    // Build a row of 4 adjacent cards in row 0 so we can demonstrate
    // picking just 3 of them. Clear the auto-placed center first.
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    grid[2] = C('Q', 'D');
    grid[3] = C('J', 'S');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-side-slide-pick');

    // Build the chain interactively — pick 0, then 1 (locks orientation
    // to row), then 2. Skip slot 3 even though it's adjacent.
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 1 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 2 });
    if (s.phase.kind !== 'awaiting-special-side-slide-pick') {
      throw new Error('Expected pick phase');
    }
    expect(s.phase.selected).toEqual([0, 1, 2]);

    s = step(s, { type: 'SIDE_SLIDE_DONE_PICKING' });
    expect(s.phase.kind).toBe('awaiting-special-side-slide-dest');

    s = step(s, { type: 'RESOLVE_SIDE_SLIDE', path: ['down'] });
    expect(s.phase.kind).toBe('awaiting-action');
    // Only the picked 3 cards moved; slot 3 stayed put.
    expect(s.grid[0]).toBeNull();
    expect(s.grid[1]).toBeNull();
    expect(s.grid[2]).toBeNull();
    expect(s.grid[3]).toEqual(C('J', 'S'));
    expect(s.grid[5]).toEqual(C('A', 'H'));
    expect(s.grid[6]).toEqual(C('K', 'C'));
    expect(s.grid[7]).toEqual(C('Q', 'D'));
    expect(s.bonusCards[0].used).toBe(true);
  });

  it('Slip & Slide: a row chain takes a multi-direction path (down + right)', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    // 2-card row chain at slots 0..1. Rest of grid is empty so the
    // chain can wander.
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 1 });
    s = step(s, { type: 'SIDE_SLIDE_DONE_PICKING' });
    if (s.phase.kind !== 'awaiting-special-side-slide-dest') throw new Error();
    // 'down', 'right' is a 2-step L-path; original [0,1] → [5,6] → [6,7].
    s = step(s, { type: 'RESOLVE_SIDE_SLIDE', path: ['down', 'right'] });
    expect(s.grid[0]).toBeNull();
    expect(s.grid[1]).toBeNull();
    expect(s.grid[6]).toEqual(C('A', 'H'));
    expect(s.grid[7]).toEqual(C('K', 'C'));
  });

  it('Side Slide: tapping an endpoint removes it from the chain', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    grid[2] = C('Q', 'D');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 1 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 2 });
    if (s.phase.kind !== 'awaiting-special-side-slide-pick') throw new Error();
    expect(s.phase.selected).toEqual([0, 1, 2]);

    // Drop the right endpoint.
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 2 });
    if (s.phase.kind !== 'awaiting-special-side-slide-pick') throw new Error();
    expect(s.phase.selected).toEqual([0, 1]);

    // Dropping the middle card would break contiguity — should no-op.
    const beforeMidDrop = s;
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    // (single endpoint of a 2-chain — that's fine, it leaves [1]).
    if (s.phase.kind !== 'awaiting-special-side-slide-pick') throw new Error();
    expect(s.phase.selected).toEqual([1]);
    // Restore. Now try removing the middle of [0, 1, 2]: build it
    // back up first.
    s = beforeMidDrop;
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 2 });
    // Now selected is [0, 1, 2]. Dropping slot 1 (middle) breaks
    // contiguity → reducer rejects.
    const beforeBadDrop = s;
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 1 });
    expect(s).toBe(beforeBadDrop);
  });

  it('Slip & Slide: SIDE_SLIDE_PREVIEW sets / clears the preview path', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 1 });
    s = step(s, { type: 'SIDE_SLIDE_DONE_PICKING' });
    if (s.phase.kind !== 'awaiting-special-side-slide-dest') throw new Error();
    expect(s.phase.previewPath).toBeNull();

    s = step(s, { type: 'SIDE_SLIDE_PREVIEW', path: ['down'] });
    if (s.phase.kind !== 'awaiting-special-side-slide-dest') throw new Error();
    expect(s.phase.previewPath).toEqual(['down']);

    // Invalid path → reducer rejects.
    const before = s;
    s = step(s, { type: 'SIDE_SLIDE_PREVIEW', path: ['up', 'up', 'up', 'up'] });
    expect(s).toBe(before);

    // Clear.
    s = step(s, { type: 'SIDE_SLIDE_PREVIEW', path: null });
    if (s.phase.kind !== 'awaiting-special-side-slide-dest') throw new Error();
    expect(s.phase.previewPath).toBeNull();
  });

  it('Side Slide: SIDE_SLIDE_DONE_PICKING is a no-op with < 2 picked', () => {
    let s = threeTricks([SIDE_SLIDE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'TOGGLE_SIDE_SLIDE_PICK', slot: 0 });
    // Only 1 picked.
    const before = s;
    s = step(s, { type: 'SIDE_SLIDE_DONE_PICKING' });
    expect(s).toBe(before);
  });

  it('Jump, Jump: moves a picked card to an empty slot and marks itself used', () => {
    let s = threeTricks([JUMP_JUMP_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[12] = null;
    grid[0] = C('A', 'H');
    // Slot 24 starts empty.
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-jump-source');

    s = step(s, { type: 'RESOLVE_JUMP_SOURCE', slot: 0 });
    expect(s.phase.kind).toBe('awaiting-special-jump-dest');

    s = step(s, { type: 'RESOLVE_JUMP', source: 0, dest: 24 });
    expect(s.phase.kind).toBe('awaiting-action');
    expect(s.grid[0]).toBeNull();
    expect(s.grid[24]).toEqual(C('A', 'H'));
    expect(s.bonusCards[0].used).toBe(true);
  });

  it('Jump, Jump: refuses an occupied destination', () => {
    let s = threeTricks([JUMP_JUMP_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'RESOLVE_JUMP_SOURCE', slot: 0 });
    const before = s;
    // Slot 1 is occupied — should be rejected.
    s = step(s, { type: 'RESOLVE_JUMP', source: 0, dest: 1 });
    expect(s).toBe(before);
  });

  it('Shuffle: permutes 5 picked cards in place and marks itself used', () => {
    let s = threeTricks([SHUFFLE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    // 5 distinct cards in slots 0..4. (Slot 12 already auto-placed,
    // we don't touch it.)
    grid[0] = C('A', 'H');
    grid[1] = C('2', 'C');
    grid[2] = C('3', 'D');
    grid[3] = C('4', 'S');
    grid[4] = C('5', 'H');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    expect(s.phase.kind).toBe('awaiting-special-shuffle');

    for (const slot of [0, 1, 2, 3, 4]) {
      s = step(s, { type: 'TOGGLE_SHUFFLE_TARGET', slot });
    }
    if (s.phase.kind !== 'awaiting-special-shuffle') throw new Error();
    expect(s.phase.selected.length).toBe(5);

    // Cap at 5 — try a 6th. Should no-op even though slot 12 is occupied.
    const before6 = s;
    s = step(s, { type: 'TOGGLE_SHUFFLE_TARGET', slot: 12 });
    expect(s).toBe(before6);

    s = step(s, { type: 'RESOLVE_SHUFFLE' });
    expect(s.phase.kind).toBe('awaiting-action');
    // All 5 slots still occupied; the multiset of cards there is the
    // same as before, just (possibly) in a different order.
    const after = [s.grid[0], s.grid[1], s.grid[2], s.grid[3], s.grid[4]];
    expect(after.every(c => c !== null)).toBe(true);
    const cardKeys = (a: typeof after) =>
      a.map(c => (c!.kind === 'standard' ? `${c!.rank}${c!.suit}` : 'J')).sort();
    expect(cardKeys(after)).toEqual(cardKeys([
      C('A', 'H'), C('2', 'C'), C('3', 'D'), C('4', 'S'), C('5', 'H'),
    ]));
    expect(s.bonusCards[0].used).toBe(true);
  });

  it('Shuffle: refuses to commit with fewer than 5 picked', () => {
    let s = threeTricks([SHUFFLE_CARD, POWER_SWAP_CARD, DOUBLER_CARD]);
    const grid = s.grid.slice();
    grid[0] = C('A', 'H');
    grid[1] = C('K', 'C');
    grid[2] = C('Q', 'D');
    grid[3] = C('J', 'S');
    grid[4] = C('5', 'H');
    s = { ...s, grid };

    s = step(s, { type: 'ACTIVATE_SPECIAL_CARD', idx: 0 });
    s = step(s, { type: 'TOGGLE_SHUFFLE_TARGET', slot: 0 });
    s = step(s, { type: 'TOGGLE_SHUFFLE_TARGET', slot: 1 });
    s = step(s, { type: 'TOGGLE_SHUFFLE_TARGET', slot: 2 });
    const before = s;
    s = step(s, { type: 'RESOLVE_SHUFFLE' });
    expect(s).toBe(before);
  });
});
