import { BONUS_HAND_LIMIT } from './bonusCards';
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

// ---------- Generic grid queries (shared by special-card flows) ----------

// All occupied slot indices. Used by Power Swap (any two cards on the
// grid) and Doubler / Wildcard (any one card on the grid).
export const occupiedSlots = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    if (grid[i] !== null) out.push(i);
  }
  return out;
};

// Occupied standard-card slots only (jokers excluded). Doubler / Wildcard
// can't supercharge a joker — jokers carry no rank or suit, so neither
// the 'double' (per-rank tally) nor the 'wild' (suit-flex) supercharge
// makes sense on them.
export const supercharchableSlots = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    const c = grid[i];
    if (c !== null && !isJoker(c)) out.push(i);
  }
  return out;
};

// ---------- Mega Destroy (special: ★ one-time multi-target) ----------

// Maximum number of cards Mega Destroy can take out in one shot.
export const MEGA_DESTROY_MAX = 5;

// Remove every slot in `slots` from the grid, returning the new grid
// and the cards that were taken out (caller pushes them into discards).
export const executeMegaDestroy = (
  grid: Grid,
  slots: readonly number[]
): { grid: Grid; removed: Card[] } => {
  const next = grid.slice();
  const removed: Card[] = [];
  for (const slot of slots) {
    const c = next[slot];
    if (!c) throw new Error(`Mega Destroy: slot ${slot} is empty`);
    removed.push(c);
    next[slot] = null;
  }
  return { grid: next, removed };
};

// ---------- Jump, Jump (special: ★ one-time relocate) ----------

// Empty grid slots — Jump, Jump can move a picked card to any empty
// position regardless of distance.
export const emptySlots = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    if (grid[i] === null) out.push(i);
  }
  return out;
};

export const executeJump = (
  grid: Grid,
  source: number,
  dest: number
): Grid => {
  const card = grid[source];
  if (!card) throw new Error('Jump: source slot is empty');
  if (grid[dest] !== null) throw new Error('Jump: dest slot is occupied');
  const next = grid.slice();
  next[source] = null;
  next[dest] = card;
  return next;
};

// ---------- Shuffle (special: ★ one-time multi-target permute) ----------

// Range of grid slots Shuffle accepts in one shot. The player can pick
// any count in [SHUFFLE_PICK_MIN, SHUFFLE_PICK_MAX] before committing.
export const SHUFFLE_PICK_MIN = 3;
export const SHUFFLE_PICK_MAX = 5;

// Permute the cards at `slots` and write them back to the same set of
// slots. Uses the provided RNG so the call is deterministic in tests.
// A card may land back where it started (uniform random permutation
// includes the identity).
export const executeShuffle = (
  grid: Grid,
  slots: readonly number[],
  rng: () => number = Math.random
): Grid => {
  if (slots.length === 0) throw new Error('Shuffle: no slots');
  const cards = slots.map(s => grid[s]);
  if (cards.some(c => c === null)) {
    throw new Error('Shuffle: every picked slot must be occupied');
  }
  // Fisher–Yates on a copy of the picked cards.
  const shuffled = cards.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const next = grid.slice();
  for (let i = 0; i < slots.length; i++) {
    next[slots[i]] = shuffled[i];
  }
  return next;
};

// ---------- Rewind (special: ★ one-time pull-back to deck) ----------

// Same pick range as Shuffle: 3 to 5 cards.
export const REWIND_PICK_MIN = 3;
export const REWIND_PICK_MAX = 5;

// Pull the cards at `slots` off the grid and mix them back into the
// playing deck. Returns the new grid (those slots become null) and
// the new deck (Fisher-Yates shuffled with the recovered cards mixed
// in). The drawn card (`state.drawn`) is untouched by this — it
// stays face-up and still has to be placed/discarded/perked.
export const executeRewind = (
  grid: Grid,
  slots: readonly number[],
  deck: readonly Card[],
  rng: () => number = Math.random
): { grid: Grid; deck: Card[] } => {
  if (slots.length === 0) throw new Error('Rewind: no slots');
  const recovered = slots.map(s => grid[s]);
  if (recovered.some(c => c === null)) {
    throw new Error('Rewind: every picked slot must be occupied');
  }
  const nextGrid = grid.slice();
  for (const s of slots) nextGrid[s] = null;
  // Combine and Fisher-Yates the merged pile so the recovered cards
  // could resurface anywhere in the remaining draw order.
  const combined: Card[] = [...deck, ...(recovered as Card[])];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return { grid: nextGrid, deck: combined };
};

// ---------- Side Slide (special: ★ one-time perpendicular slide) ----------

// Side Slide is interactive: the player picks a starting card, then taps
// adjacent occupied cards to extend the picked chain (orientation locks
// at the second pick), then chooses a perpendicular landing. The chain
// must be 2+ cells, contiguous, in a single row or column.

// Orientation of a multi-slot chain (all slots same row → 'row';
// all slots same col → 'col'; otherwise null).
export type ChainOrientation = 'row' | 'col';
export const chainOrientation = (
  chain: readonly number[]
): ChainOrientation | null => {
  if (chain.length < 2) return null;
  const firstRow = Math.floor(chain[0] / GRID_SIZE);
  const firstCol = chain[0] % GRID_SIZE;
  const allSameRow = chain.every(s => Math.floor(s / GRID_SIZE) === firstRow);
  if (allSameRow) return 'row';
  const allSameCol = chain.every(s => s % GRID_SIZE === firstCol);
  if (allSameCol) return 'col';
  return null;
};

// True iff the chain's slots are contiguous in their orientation
// (no gaps between successive line positions).
const isContiguousChain = (chain: readonly number[]): boolean => {
  if (chain.length < 2) return chain.length === 1;
  const orient = chainOrientation(chain);
  if (!orient) return false;
  const positions = chain
    .map(s => (orient === 'row' ? s % GRID_SIZE : Math.floor(s / GRID_SIZE)))
    .sort((a, b) => a - b);
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] !== positions[i - 1] + 1) return false;
  }
  return true;
};

// Slots from which Side Slide can fire: any occupied cell. The player
// builds the sub-chain from there by tapping adjacent occupied cells.
// We don't require a 2+ chain at this stage because the player picks
// the chain interactively in the picking phase.
export const validSideSlideSources = (grid: Grid): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_SLOTS; i++) {
    if (grid[i] !== null) out.push(i);
  }
  return out;
};

// Given a card already in the picked chain, which neighbors could the
// player add next? Once the chain has 2+ cards the orientation is
// locked; before then any orthogonal occupied neighbor is fair game.
// Returns the set of slot indices that would extend the chain.
export const sideSlideChainExtensions = (
  grid: Grid,
  selected: readonly number[]
): number[] => {
  if (selected.length === 0) {
    // No selection yet — every occupied cell is a candidate. (The UI
    // typically calls validSideSlideSources here instead, but allow
    // for parity.)
    return validSideSlideSources(grid);
  }
  const out = new Set<number>();
  if (selected.length === 1) {
    const s = selected[0];
    const r = Math.floor(s / GRID_SIZE);
    const c = s % GRID_SIZE;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r2 = r + dr;
      const c2 = c + dc;
      if (r2 < 0 || r2 >= GRID_SIZE || c2 < 0 || c2 >= GRID_SIZE) continue;
      const idx = r2 * GRID_SIZE + c2;
      if (grid[idx] !== null && !selected.includes(idx)) out.add(idx);
    }
    return [...out];
  }
  // 2+ cards: orientation locked. Only the two endpoints can be
  // extended.
  const orient = chainOrientation(selected);
  if (!orient) return [];
  const positions = selected
    .map(s => (orient === 'row' ? s % GRID_SIZE : Math.floor(s / GRID_SIZE)));
  const minPos = Math.min(...positions);
  const maxPos = Math.max(...positions);
  const fixed = orient === 'row'
    ? Math.floor(selected[0] / GRID_SIZE)
    : selected[0] % GRID_SIZE;
  const candidate = (pos: number): number =>
    orient === 'row' ? fixed * GRID_SIZE + pos : pos * GRID_SIZE + fixed;
  for (const pos of [minPos - 1, maxPos + 1]) {
    if (pos < 0 || pos >= GRID_SIZE) continue;
    const idx = candidate(pos);
    if (grid[idx] !== null && !selected.includes(idx)) out.add(idx);
  }
  return [...out];
};

// True iff removing `slot` from `selected` would leave a contiguous
// chain (or zero / one cells, which trivially is). Only endpoints
// pass.
export const canDeselectSideSlideSlot = (
  selected: readonly number[],
  slot: number
): boolean => {
  if (!selected.includes(slot)) return false;
  if (selected.length <= 1) return true;
  const remaining = selected.filter(s => s !== slot);
  return isContiguousChain(remaining);
};

export interface SideSlideMove {
  // Step-by-step path the chain takes from its current position to
  // leadingDest. Each entry is one 1-cell shift. Multi-direction paths
  // (e.g. ['up', 'up', 'left']) are valid as long as every individual
  // step is legal in unison.
  path: Direction[];
  // Position the canonical "leader" (lowest-index original chain
  // member) lands in after the full path executes.
  leadingDest: number;
  // The leader slot the leadingDest is calculated from.
  from: number;
}

const stepOf = (d: Direction): number =>
  d === 'up' ? -GRID_SIZE
  : d === 'down' ? GRID_SIZE
  : d === 'left' ? -1
  : 1;

// Apply a single-cell shift to every chain member. Returns the new
// chain positions, or null if any member would go out of bounds (or
// off-row for left/right).
const shiftChain = (
  chain: readonly number[],
  direction: Direction
): number[] | null => {
  const step = stepOf(direction);
  const next: number[] = [];
  for (const slot of chain) {
    const newSlot = slot + step;
    if (newSlot < 0 || newSlot >= GRID_SLOTS) return null;
    if (direction === 'left' || direction === 'right') {
      const oldRow = Math.floor(slot / GRID_SIZE);
      const newRow = Math.floor(newSlot / GRID_SIZE);
      if (oldRow !== newRow) return null;
    }
    next.push(newSlot);
  }
  return next;
};

// A single-cell chain shift is legal iff every destination slot is
// either empty or occupied by another chain member (since chain
// members vacate together).
const canShift = (
  grid: Grid,
  chain: readonly number[],
  newChain: readonly number[]
): boolean => {
  const oldSet = new Set(chain);
  for (const slot of newChain) {
    if (grid[slot] !== null && !oldSet.has(slot)) return false;
  }
  return true;
};

// Every chain position reachable from `chain` via a series of legal
// single-cell shifts in any of the 4 cardinal directions, with a
// shortest path recorded. The starting chain is excluded from results
// (no-op moves don't make sense). Used by Slip & Slide to drive both
// the dest highlights and the commit path.
export const sideSlideDestinationsForChain = (
  grid: Grid,
  chain: readonly number[]
): SideSlideMove[] => {
  if (chain.length < 2) return [];
  if (!chainOrientation(chain)) return [];
  const from = Math.min(...chain);
  // BFS keyed on the sorted chain positions so equivalent
  // configurations dedupe.
  const keyOf = (c: readonly number[]) =>
    c.slice().sort((a, b) => a - b).join(',');
  const startKey = keyOf(chain);
  const visited = new Map<string, { chainCfg: number[]; path: Direction[] }>();
  visited.set(startKey, { chainCfg: chain.slice(), path: [] });
  const queue: { chainCfg: number[]; path: Direction[] }[] = [
    { chainCfg: chain.slice(), path: [] },
  ];
  while (queue.length > 0) {
    const { chainCfg, path } = queue.shift()!;
    for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
      const next = shiftChain(chainCfg, d);
      if (!next) continue;
      if (!canShift(grid, chainCfg, next)) continue;
      const k = keyOf(next);
      if (visited.has(k)) continue;
      const newPath = [...path, d];
      visited.set(k, { chainCfg: next, path: newPath });
      queue.push({ chainCfg: next, path: newPath });
    }
  }
  const out: SideSlideMove[] = [];
  for (const [k, { path }] of visited) {
    if (k === startKey) continue;
    // The leader's net displacement = sum of step offsets along the path.
    let leadingDest = from;
    for (const d of path) leadingDest += stepOf(d);
    out.push({ from, path, leadingDest });
  }
  return out;
};

export const executeSideSlide = (
  grid: Grid,
  chain: readonly number[],
  path: readonly Direction[]
): Grid => {
  if (chain.length < 2) throw new Error('Side Slide: chain must have 2+ cards');
  if (!isContiguousChain(chain)) throw new Error('Side Slide: chain not contiguous');
  if (path.length === 0) throw new Error('Side Slide: empty path');
  // Re-validate the path step by step — protects against stale moves
  // that were enumerated against a different grid state.
  let current = chain.slice();
  for (const d of path) {
    const next = shiftChain(current, d);
    if (!next || !canShift(grid, current, next)) {
      throw new Error('Side Slide: illegal step in path');
    }
    current = next;
  }
  const finalChain = current;
  // Apply the final position to the grid: clear originals first to
  // avoid in-line overwrites between members.
  const next = grid.slice();
  for (const idx of chain) next[idx] = null;
  for (let i = 0; i < chain.length; i++) next[finalChain[i]] = grid[chain[i]];
  return next;
};

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
  bonusDeckSize: number,
  // Extra context for the ♣ check: the player's current hand size and whether
  // the run is operating under No Swap rules (in which case ♣ is disabled
  // entirely at the cap, since taking it would force a swap).
  bonusHandSize: number = 0,
  noSwap: boolean = false
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
      if (noSwap && bonusHandSize >= BONUS_HAND_LIMIT) return false;
      return canDrawBonus(bonusDeckSize);
  }
};

// Short Circuit variant: any of the four suit perks is a valid pick,
// so the perk button should appear as long as AT LEAST ONE of them
// is currently legal. Returns true iff hop / slide / destroy / bonus
// has at least one runnable option in the current state.
export const anyPerkAvailable = (
  grid: Grid,
  bonusDeckSize: number,
  bonusHandSize: number = 0,
  noSwap: boolean = false
): boolean => {
  if (canHop(grid)) return true;
  if (canSlide(grid)) return true;
  if (canDestroy(grid)) return true;
  if (canDrawBonus(bonusDeckSize) && !(noSwap && bonusHandSize >= BONUS_HAND_LIMIT)) {
    return true;
  }
  return false;
};
