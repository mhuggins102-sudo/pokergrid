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

// How many empty cells lie ahead of `from` in `direction`, before the
// grid edge or another occupied cell. Cells in `ignore` are treated as
// empty — used by the multi-card chain check below so the chain's own
// cells don't block its own movement.
const emptyCellsForward = (
  grid: Grid,
  from: number,
  direction: Direction,
  ignore?: ReadonlySet<number>
): number => {
  const r = Math.floor(from / GRID_SIZE);
  const c = from % GRID_SIZE;
  const dr = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const dc = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  let n = 0;
  while (true) {
    const r2 = r + dr * (n + 1);
    const c2 = c + dc * (n + 1);
    if (r2 < 0 || r2 >= GRID_SIZE || c2 < 0 || c2 >= GRID_SIZE) break;
    const idx = r2 * GRID_SIZE + c2;
    if (grid[idx] !== null && !(ignore?.has(idx))) break;
    n++;
  }
  return n;
};

// Per-direction maximum distance the entire chain can shift. Every
// chain member needs the same amount of free space ahead of it, so
// the effective max is the min over the chain. The chain's own
// cells are treated as empty (a chain moving up/down past itself is
// fine, but the chain orientation rules out that scenario anyway).
const chainSideSlideMaxDistance = (
  grid: Grid,
  chain: readonly number[],
  direction: Direction
): number => {
  if (chain.length < 2) return 0;
  const ignore = new Set(chain);
  let max = Infinity;
  for (const slot of chain) {
    const d = emptyCellsForward(grid, slot, direction, ignore);
    if (d < max) max = d;
    if (max === 0) return 0;
  }
  return max === Infinity ? 0 : max;
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
  direction: Direction;
  distance: number;
  // Slot the canonical "leader" of the chain (lowest-index member)
  // lands in. Used by the GameScreen to render the dest highlight.
  leadingDest: number;
  // The leader slot the leadingDest is calculated from.
  from: number;
}

// Valid perpendicular slide moves for a picked chain. Chain must be
// 2+ contiguous cells in a row or column.
export const sideSlideDestinationsForChain = (
  grid: Grid,
  chain: readonly number[]
): SideSlideMove[] => {
  if (chain.length < 2) return [];
  const orient = chainOrientation(chain);
  if (!orient) return [];
  // Use the lowest-index chain member as the "leader" so leadingDest
  // is deterministic and matches the player's mental model (the chain
  // moves as a unit).
  const from = Math.min(...chain);
  const directions: Direction[] =
    orient === 'row' ? ['up', 'down'] : ['left', 'right'];
  const out: SideSlideMove[] = [];
  for (const d of directions) {
    const max = chainSideSlideMaxDistance(grid, chain, d);
    if (max === 0) continue;
    const step =
      d === 'up' ? -GRID_SIZE
      : d === 'down' ? GRID_SIZE
      : d === 'left' ? -1 : 1;
    for (let dist = 1; dist <= max; dist++) {
      out.push({ from, direction: d, distance: dist, leadingDest: from + step * dist });
    }
  }
  return out;
};

export const executeSideSlide = (
  grid: Grid,
  chain: readonly number[],
  direction: Direction,
  distance: number
): Grid => {
  if (chain.length < 2) throw new Error('Side Slide: chain must have 2+ cards');
  if (!isContiguousChain(chain)) throw new Error('Side Slide: chain not contiguous');
  if (distance < 1 || distance > chainSideSlideMaxDistance(grid, chain, direction)) {
    throw new Error(`Side Slide: distance ${distance} out of range`);
  }
  const step =
    direction === 'up' ? -GRID_SIZE
    : direction === 'down' ? GRID_SIZE
    : direction === 'left' ? -1 : 1;
  const next = grid.slice();
  // Clear all chain positions before writing — neighbors in the chain
  // would otherwise overwrite each other when the step is small.
  for (const idx of chain) next[idx] = null;
  for (const idx of chain) next[idx + step * distance] = grid[idx];
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
