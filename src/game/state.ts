import { Card, isJoker, StandardCard, Suit } from './cards';
import { freshShuffledDeck, shuffle } from './deck';
import { emptyGrid, Grid, isFull, nextSpiralSlot, placeAtSpiralNext } from './grid';
import { HandRank } from './hands';
import {
  BonusCard,
  BONUS_DECK_POOL,
  BONUS_HAND_LIMIT,
  cardMatchesSlot,
  isPlaceholder,
  isSpecialCard,
  SlotKind,
  slotPlaceholder,
  SPECIAL_DECK_POOL,
  SPOTLIGHT_ID,
} from './bonusCards';
import {
  BONUS_DECLINE_AT_CAP_BY_DIFFICULTY,
  CAN_PREVIEW_DECK_BY_DIFFICULTY,
  Difficulty,
  JOKERS_BY_DIFFICULTY,
  NO_DISCARDS_BY_DIFFICULTY,
  STARTER_BONUS_BY_DIFFICULTY,
  TARGET_BY_DIFFICULTY,
} from './rules';

// Re-exports for the few consumers that imported these from state.ts
// before the move. New code should import from ./rules directly.
export { STARTER_BONUS_BY_DIFFICULTY };
export const canPreviewDeck = (difficulty: Difficulty): boolean =>
  CAN_PREVIEW_DECK_BY_DIFFICULTY[difficulty];
import {
  canDrawBonus,
  canDestroy,
  canHop,
  canSlide,
  destroyableSlots,
  executeDestroy,
  executeHop,
  executeMegaDestroy,
  executeSideSlide,
  executeSlide,
  MEGA_DESTROY_MAX,
  occupiedSlots,
  SideSlideMove,
  sideSlideDestinationsFrom,
  SlideMove,
  slideDestinationsFrom,
  supercharchableSlots,
  validHopSwaps,
  validSideSlideSources,
  validSlideSources,
} from './actions';
import { Direction } from './grid';

export type TargetReturnTo = 'awaiting-action';

export type Phase =
  | { kind: 'awaiting-action' }
  | { kind: 'awaiting-target-hop'; pairs: [number, number][]; returnTo: TargetReturnTo }
  | {
      kind: 'awaiting-target-slide-source';
      sources: number[];
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'awaiting-target-slide-dest';
      source: number;
      moves: SlideMove[];
      returnTo: TargetReturnTo;
    }
  | { kind: 'awaiting-target-destroy'; targets: number[]; returnTo: TargetReturnTo }
  | {
      kind: 'bonus-card-resolving';
      drawn: BonusCard[]; // 1 or 2 cards
      // Categorized-slots (Mixed Bag) only: the slot the kept card
      // goes into. When set, BONUS_KEEP replaces bonusCards[targetSlot]
      // wholesale instead of pushing onto the end of the array.
      targetSlot?: number;
      returnTo: TargetReturnTo;
    }
  // Mixed Bag: ♣ first asks which slot to draw for. The player taps
  // a chip in the bonus strip (slot index 0/1/2). After picking, the
  // reducer draws from the bonus deck filtered to that slot's
  // category and transitions to bonus-card-resolving with
  // targetSlot set.
  | {
      kind: 'awaiting-bonus-slot-choice';
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'bonus-card-replacing';
      drawn: BonusCard[];
      pickedNew: number; // index into drawn
      returnTo: TargetReturnTo;
    }
  // Three Tricks challenge — special-card activation phases. `cardIdx`
  // points back into state.bonusCards so the handler can remove the
  // consumed card on commit. `slots` is the precomputed list of valid
  // grid targets (all occupied non-joker slots for doubler / wildcard,
  // all occupied slots for power-swap).
  | {
      kind: 'awaiting-special-power-swap-source';
      cardIdx: number;
      slots: number[];
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'awaiting-special-power-swap-dest';
      cardIdx: number;
      source: number;
      slots: number[];
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'awaiting-special-doubler';
      cardIdx: number;
      slots: number[];
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'awaiting-special-wildcard';
      cardIdx: number;
      slots: number[];
      returnTo: TargetReturnTo;
    }
  // Mega Destroy is a multi-target phase: the player taps up to
  // MEGA_DESTROY_MAX cards in any order, toggles them in `selected`,
  // then confirms. The Confirm action is dispatched once the player
  // has at least one slot picked.
  | {
      kind: 'awaiting-special-mega-destroy';
      cardIdx: number;
      slots: number[];
      selected: number[];
      returnTo: TargetReturnTo;
    }
  // Side Slide reuses the source / dest split from regular ♠ Slide:
  // pick a card whose row OR column chain has 2+ members, then pick
  // a perpendicular landing position.
  | {
      kind: 'awaiting-special-side-slide-source';
      cardIdx: number;
      sources: number[];
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'awaiting-special-side-slide-dest';
      cardIdx: number;
      source: number;
      moves: SideSlideMove[];
      returnTo: TargetReturnTo;
    }
  | { kind: 'game-over' };

export interface GameState {
  deck: Card[];
  // Cards taken out of play without being spent on a suit perk: either
  // discarded by the player (Discard button) or destroyed by a ♦ on the
  // grid. The "Trash Joker" bonus card checks this pile.
  discards: Card[];
  // Drawn playing cards that the player spent on a suit perk (♥ Swap,
  // ♠ Slide, ♦ Destroy, ♣ Bonus). The Burnout / Frugal bonus cards check
  // this pile's length.
  perkSpent: Card[];
  bonusDeck: BonusCard[]; // depleting
  bonusCards: BonusCard[]; // held (max BONUS_HAND_LIMIT)
  grid: Grid;
  drawn: Card | null;
  difficulty: Difficulty;
  target: number;
  phase: Phase;
  history: string[];
  // Snapshot stack for UNDO. Each entry is the state immediately BEFORE a
  // commit action (PLACE, RESOLVE_*, BONUS_KEEP/REPLACE/DECLINE, DISCARD_NONE).
  // Snapshots store `past: []` so the stack stays flat.
  past: GameState[];
  // Number of UNDO actions executed this run. Result-screen reads this to
  // decide whether to count the run for stats; the GameScreen reads it to
  // enforce per-mode caps (challenges = 0, targets-up = 1, free = unlimited).
  undoCount: number;
  // True once the player has used BONUS_REPLACE to swap out a held bonus card
  // (only possible at the cap). The "No Swap" challenge checks this.
  swappedBonus: boolean;
  // True when the No Swap challenge is active. Disables ♣ entirely at the
  // bonus-hand cap so the player can't accidentally lose the run by drawing
  // a bonus with no choice but to swap.
  noSwap: boolean;
  // True when the No Discards challenge or Extreme difficulty is
  // active. Disables the Discard button entirely — every drawn card
  // must be placed or spent on a suit perk.
  noDiscards: boolean;
  // True when the player is allowed to decline a ♣ Bonus draw even at
  // the bonus-hand cap (skip the forced swap). Easy difficulty sets
  // this; Medium / Hard / Extreme leave it false so hitting ♣ at cap
  // forces the swap.
  bonusDeclineAllowed: boolean;
  // True when the Short Circuit challenge is active. The drawn card's
  // suit no longer determines which perk fires — instead, on
  // BEGIN_SUIT_ACTION the reducer picks a uniformly-random perk from
  // those currently available (hop / slide / destroy / bonus). The
  // drawn card is still spent in perkSpent.
  randomPerks: boolean;
  // True when the Poker Purist challenge is active. The bonus deck
  // and hand both start empty and stay that way — no starter, no ♣
  // draws (canDrawBonus returns false against an empty bonusDeck),
  // and the UI hides the bonus card strip entirely. Scoring becomes
  // pure row + column poker math with no multiplier meta-layer.
  noBonusCards: boolean;
  // Mixed Bag challenge: lock each of the 3 hand slots to a category.
  // When set, bonusCards always has exactly 3 entries (length-fixed),
  // empty slots hold a placeholder card matching the slot's kind, and
  // ♣ draws are filtered to the slot's category. Undefined otherwise.
  slotCategories?: SlotKind[];
}

export type Action =
  | { type: 'PLACE' }
  | { type: 'DISCARD_NONE' } // sends drawn to discards (no perk used)
  | { type: 'BEGIN_SUIT_ACTION'; forSuit?: Suit }
  | { type: 'RESOLVE_HOP'; i: number; j: number }
  | { type: 'SLIDE_SELECT_SOURCE'; slot: number }
  | { type: 'RESOLVE_SLIDE'; from: number; direction: Direction; distance: number }
  | { type: 'RESOLVE_DESTROY'; slot: number }
  | { type: 'BONUS_KEEP'; idx: number }
  | { type: 'BONUS_SELECT_NEW'; idx: number }
  | { type: 'BONUS_REPLACE'; oldIdx: number }
  | { type: 'BONUS_DECLINE' }
  // Mixed Bag: pick a slot to draw for after ♣ fires.
  | { type: 'BONUS_PICK_SLOT'; slot: number }
  | { type: 'CANCEL_ACTION' }
  // Three Tricks: activate a held special card. The current draw is NOT
  // spent — these are independent of the suit-perk flow.
  | { type: 'ACTIVATE_SPECIAL_CARD'; idx: number }
  | { type: 'RESOLVE_POWER_SWAP_SOURCE'; slot: number }
  | { type: 'RESOLVE_POWER_SWAP'; i: number; j: number }
  | { type: 'RESOLVE_DOUBLER'; slot: number }
  | { type: 'RESOLVE_WILDCARD'; slot: number }
  | { type: 'TOGGLE_MEGA_DESTROY_TARGET'; slot: number }
  | { type: 'RESOLVE_MEGA_DESTROY' }
  | { type: 'SIDE_SLIDE_SELECT_SOURCE'; slot: number }
  | { type: 'RESOLVE_SIDE_SLIDE'; from: number; direction: Direction; distance: number }
  | { type: 'UNDO' };

const log = (s: GameState, msg: string): GameState => ({
  ...s,
  history: [...s.history, msg],
});

const drawNext = (state: GameState): GameState => {
  let s = state;
  while (true) {
    if (isFull(s.grid)) {
      return { ...s, drawn: null, phase: { kind: 'game-over' } };
    }
    if (s.deck.length === 0) {
      return { ...s, drawn: null, phase: { kind: 'game-over' } };
    }
    const [next, ...rest] = s.deck;
    if (isJoker(next)) {
      const grid = placeAtSpiralNext(s.grid, next);
      s = log({ ...s, deck: rest, grid }, 'Joker auto-placed');
      continue;
    }
    return { ...s, deck: rest, drawn: next, phase: { kind: 'awaiting-action' } };
  }
};

// STARTER_BONUS_BY_DIFFICULTY + canPreviewDeck used to live here; they're
// now in src/game/rules.ts alongside every other per-difficulty knob so
// the engine, UI popups, and rules screen all read from one place.

export const newGame = (
  difficulty: Difficulty,
  rng: () => number = Math.random,
  targetOverride?: number,
  // Optional: cap the playing deck to this many cards (after shuffle, before
  // the first card is placed). Used by the Short Deck challenge to remove 8
  // random cards from circulation.
  deckLimit?: number,
  // Optional: lock in No Swap rules — ♣ is unavailable at the bonus-hand cap.
  noSwap = false,
  // Optional: lock in No Discards rules — DISCARD_NONE is rejected by the
  // reducer; the Discard button hides in GameScreen.
  noDiscards = false,
  // Targets-Up carry-over: cards the player kept from the previous level's
  // power-up pick, pre-placed in the starting hand. The free easy/medium
  // starter is drawn AROUND these so the same card type isn't duplicated.
  keptBonusCards: BonusCard[] = [],
  // Targets-Up carry-over: extra bonus cards (the two NOT kept from each
  // previous level, powered up) shuffled into this level's bonus deck.
  deckExtras: BonusCard[] = [],
  // Targets-Up S-tier reward: standard cards with a supercharge ('wild'
  // or 'double') the player earned in a previous level. We replace the
  // matching un-supercharged card in the fresh shuffled deck so the
  // supercharged version can be drawn in this level.
  superchargedDeckCards: Card[] = [],
  // Optional: lock in Short Circuit rules — the drawn card's suit no
  // longer dictates which perk fires; instead BEGIN_SUIT_ACTION picks
  // a uniformly-random perk from those currently available.
  randomPerks = false,
  // Optional: lock in Poker Purist rules — no bonus cards anywhere.
  // Both the starting hand and the bonus deck are emptied; ♣ becomes
  // unavailable (canDrawBonus → false against an empty deck) and the
  // UI hides the bonus card strip.
  noBonusCards = false,
  // Three Tricks challenge: a fixed initial bonus hand that REPLACES
  // the normal starter draw. Combined with noBonusCards=true the
  // player starts with these specific cards (the three one-time
  // specials) and the bonus deck stays empty, so the ♣ perk can't
  // draw anything.
  initialBonusCards: BonusCard[] = [],
  // Mixed Bag challenge: positionally-categorized slots. Slot N is
  // locked to slotCategories[N]'s category (placeholder card seeded
  // at start). ♣ draws are filtered by slot category. The bonus deck
  // is built from BONUS_DECK_POOL + SPECIAL_DECK_POOL so the green
  // slot has something to draw.
  slotCategories?: SlotKind[]
): GameState => {
  // Joker count is determined by difficulty (Easy ships 2 jokers, Hard
  // ships 1, Extreme ships 0). Targets-Up infers difficulty from level
  // and Challenges always use Hard, so this single lookup covers every
  // mode without per-mode special casing.
  const jokerCount = JOKERS_BY_DIFFICULTY[difficulty];
  let deck = freshShuffledDeck(rng, jokerCount);
  if (deckLimit !== undefined && deckLimit < deck.length) {
    deck = deck.slice(0, deckLimit);
  }
  // Splice supercharged cards into the freshly shuffled deck by replacing
  // the matching standard card (same rank + suit) in place. Position is
  // preserved so the player can't predict when a supercharged card draws.
  for (const sc of superchargedDeckCards) {
    if (sc.kind !== 'standard') continue;
    const idx = deck.findIndex(
      d => d.kind === 'standard' && d.rank === sc.rank && d.suit === sc.suit
    );
    if (idx >= 0) deck[idx] = sc;
  }
  // The free easy/medium starter must come from the un-powered pool AND
  // must not duplicate any card the player has already kept across levels
  // (per the user's "the second card should not be one of the other
  // superpowered cards" rule). Filter the standard pool to exclude held
  // base ids before drawing the starter.
  //
  // Also exclude any base ids that already exist in deckExtras as a
  // powered variant — the powered version REPLACES the original copy
  // in the deck rather than coexisting with it. Otherwise the player
  // could draw both an upgraded Royal Touch ×1.8 AND a fresh Royal
  // Touch ×1.5 in the same level.
  const heldBaseIds = new Set(
    keptBonusCards.map(c => c.id.replace(/-pwr\d+$/, ''))
  );
  const poweredBaseIds = new Set(
    deckExtras.map(c => c.id.replace(/-pwr\d+$/, ''))
  );
  const excludedBaseIds = new Set<string>([...heldBaseIds, ...poweredBaseIds]);
  // Joker-dependent bonus cards (Trash Joker, Cozy Joker) can never
  // trigger when the deck has no jokers — Extreme runs and any future
  // no-joker challenges. Strip them from the draw pool so the player
  // doesn't waste a ♣ pulling a dud.
  if (jokerCount === 0) {
    excludedBaseIds.add('trash-joker-x1_25');
    excludedBaseIds.add('cozy-joker-x1_15');
  }
  const drawable = BONUS_DECK_POOL.filter(c => !excludedBaseIds.has(c.id));
  const shuffledBonus = shuffle(drawable, rng);
  // Poker Purist short-circuits the whole bonus setup — no starter
  // draw, no shuffled deck, no carry-overs. Hand and deck both stay
  // empty for the entire run. Three Tricks rides on top of this:
  // noBonusCards stays true (no draw deck, no ♣) but the assembled
  // hand is seeded with the three special action cards. Mixed Bag
  // (slotCategories) seeds positional placeholders so the slot
  // layout is fixed from turn 1.
  const starterCount = noBonusCards ? 0 : STARTER_BONUS_BY_DIFFICULTY[difficulty];
  // Player's hand starts with the kept carry-overs first, then the
  // difficulty-based free starter on top (capped at BONUS_HAND_LIMIT just
  // in case future power-ups push the carry to 3 cards on hard).
  const starterDraw = noBonusCards ? [] : shuffledBonus.slice(0, starterCount);
  const assembledHand = slotCategories
    ? slotCategories.map(kind => slotPlaceholder(kind))
    : noBonusCards
    ? initialBonusCards.slice(0, BONUS_HAND_LIMIT)
    : [...keptBonusCards, ...starterDraw].slice(0, BONUS_HAND_LIMIT);
  // Apply Spotlight's exclusivity rule if the starter draw or a
  // carry-over brought Spotlight into the hand alongside anything
  // else. The starter is the "last added" entry by construction,
  // so it wins ties; if only carry-overs exist, the most recent
  // carry-over wins (no current path produces multiple carry-overs,
  // but we use the last entry as a safe fallback).
  const lastAdded =
    starterDraw[starterDraw.length - 1] ??
    keptBonusCards[keptBonusCards.length - 1];
  const bonusCards = lastAdded
    ? enforceSpotlight(assembledHand, lastAdded)
    : assembledHand;
  // Bonus deck = standard pool minus the drawn starter + powered carry-overs
  // from earlier levels. Shuffled together so the powered cards can resurface
  // at any time. Poker Purist leaves it empty so ♣ never has anything to draw.
  // Mixed Bag mixes the regular pool with the special deck so the green
  // slot has cards to draw — they're filtered by slot kind at draw time.
  const remainingPool = shuffledBonus.slice(starterCount);
  const bonusDeck = noBonusCards
    ? []
    : slotCategories
    ? shuffle([...remainingPool, ...deckExtras, ...SPECIAL_DECK_POOL], rng)
    : shuffle([...remainingPool, ...deckExtras], rng);
  const [first, ...rest] = deck;
  const grid = placeAtSpiralNext(emptyGrid(), first);
  const initial: GameState = {
    deck: rest,
    discards: [],
    perkSpent: [],
    bonusDeck,
    bonusCards,
    grid,
    drawn: null,
    difficulty,
    target: targetOverride ?? TARGET_BY_DIFFICULTY[difficulty],
    phase: { kind: 'awaiting-action' },
    history: ['Game start'],
    past: [],
    undoCount: 0,
    swappedBonus: false,
    noSwap,
    // Free Play / Targets-Up derive these from difficulty; Challenges
    // override via their own flags (No Discards → true regardless of
    // difficulty; otherwise difficulty-based).
    noDiscards: noDiscards || NO_DISCARDS_BY_DIFFICULTY[difficulty],
    bonusDeclineAllowed: BONUS_DECLINE_AT_CAP_BY_DIFFICULTY[difficulty],
    randomPerks,
    noBonusCards,
    slotCategories,
  };
  return drawNext(initial);
};

// ---------- helpers ----------

// Cards that go to the discards pile (no perk usage): the Discard button,
// and the target of a ♦ Destroy. The "Trash Joker" bonus card looks here.
const pushDiscard = (s: GameState, card: Card): GameState => ({
  ...s,
  discards: [...s.discards, card],
});

// Cards spent on a suit perk: the drawn ♥/♠/♦/♣ that triggered the perk.
// Burnout / Frugal look here.
const pushPerkSpent = (s: GameState, card: Card): GameState => ({
  ...s,
  perkSpent: [...s.perkSpent, card],
});

// ---------- action handlers ----------

const handlePlace = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn) return s;
  const grid = placeAtSpiralNext(s.grid, s.drawn);
  return drawNext(log({ ...s, grid }, 'Place'));
};

const handleDiscardNone = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn)) return s;
  if (s.noDiscards) return s; // No Discards challenge — reject the action.
  return drawNext(log(pushDiscard(s, s.drawn), 'Discard'));
};

// Short Circuit: pick a uniformly-random suit whose perk would
// currently fire. The same availability gates that the suit switch
// below applies (canHop, canSlide, canDestroy, canDrawBonus + the
// noSwap cap rule for ♣) decide which suits are valid candidates,
// so the randomly-picked perk is guaranteed to actually run rather
// than no-op.
const pickRandomAvailablePerk = (s: GameState, rng: () => number): Suit | null => {
  const candidates: Suit[] = [];
  if (canHop(s.grid)) candidates.push('H');
  if (canSlide(s.grid)) candidates.push('S');
  if (canDestroy(s.grid)) candidates.push('D');
  if (
    canDrawBonus(s.bonusDeck.length) &&
    !(s.noSwap && s.bonusCards.length >= BONUS_HAND_LIMIT)
  ) {
    candidates.push('C');
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
};

const handleBeginSuitAction = (
  s: GameState,
  rng: () => number,
  forSuit?: Suit
): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn)) return s;
  const drawn = s.drawn;
  // Decide which perk to fire:
  //   - `forSuit` (caller override) wins. Used by the wild-card perk
  //     chooser to let the player pick any suit perk when the drawn
  //     card's suit is flexible.
  //   - Otherwise Short Circuit picks a uniformly-random available
  //     perk (the engine's existing behavior).
  //   - Otherwise the drawn card's own suit determines the perk.
  // perkSpent still records the actual drawn card so Burnout /
  // Frugal stay correct regardless of which branch fires.
  const effectiveSuit: Suit = forSuit
    ?? (s.randomPerks
      ? pickRandomAvailablePerk(s, rng) ?? drawn.suit
      : drawn.suit);
  switch (effectiveSuit) {
    case 'H': {
      if (!canHop(s.grid)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-hop',
          pairs: validHopSwaps(s.grid),
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'S': {
      if (!canSlide(s.grid)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-slide-source',
          sources: validSlideSources(s.grid),
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'D': {
      if (!canDestroy(s.grid)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-destroy',
          targets: destroyableSlots(s.grid),
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'C': {
      if (!canDrawBonus(s.bonusDeck.length)) return s;
      // No Swap challenge: ♣ is unavailable at the cap (would force a swap).
      if (s.noSwap && s.bonusCards.length >= BONUS_HAND_LIMIT) return s;
      // Mixed Bag: ♣ first asks which slot to draw for. The deck is
      // filtered to that slot's category once the player picks (see
      // handleBonusPickSlot). Skip this branch if no slot category
      // has any drawable cards left.
      if (s.slotCategories) {
        const anySlotDrawable = s.slotCategories.some(kind =>
          s.bonusDeck.some(c => cardMatchesSlot(c, kind))
        );
        if (!anySlotDrawable) return s;
        return {
          ...s,
          phase: { kind: 'awaiting-bonus-slot-choice', returnTo: 'awaiting-action' },
        };
      }
      // Draw up to 2 from the top of the bonus deck.
      const drawCount = Math.min(2, s.bonusDeck.length);
      const drawn = s.bonusDeck.slice(0, drawCount);
      const remainingDeck = s.bonusDeck.slice(drawCount);
      return {
        ...s,
        bonusDeck: remainingDeck,
        phase: { kind: 'bonus-card-resolving', drawn, returnTo: 'awaiting-action' },
      };
    }
  }
};

const handleResolveHop = (s: GameState, i: number, j: number): GameState => {
  if (s.phase.kind !== 'awaiting-target-hop') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const grid = executeHop(s.grid, i, j);
  return drawNext(log(pushPerkSpent({ ...s, grid }, s.drawn), `Hop ${i}↔${j}`));
};

const handleSlideSelectSource = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-target-slide-source') return s;
  if (!s.grid[slot]) return s;
  const moves = slideDestinationsFrom(s.grid, slot);
  if (moves.length === 0) return s;
  return {
    ...s,
    phase: {
      kind: 'awaiting-target-slide-dest',
      source: slot,
      moves,
      returnTo: s.phase.returnTo,
    },
  };
};

const handleResolveSlide = (
  s: GameState,
  from: number,
  direction: Direction,
  distance: number
): GameState => {
  if (s.phase.kind !== 'awaiting-target-slide-dest') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const valid = s.phase.moves.find(
    m => m.from === from && m.direction === direction && m.distance === distance
  );
  if (!valid) return s;
  const grid = executeSlide(s.grid, from, direction, distance);
  return drawNext(
    log(pushPerkSpent({ ...s, grid }, s.drawn), `Slide ${direction} × ${distance}`)
  );
};

const handleResolveDestroy = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-target-destroy') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const { grid, removed } = executeDestroy(s.grid, slot);
  // Target goes to discards (not a perk usage — collateral); the diamond
  // itself goes to perkSpent.
  const afterTarget = pushDiscard({ ...s, grid }, removed);
  return drawNext(log(pushPerkSpent(afterTarget, s.drawn), `Destroy slot ${slot}`));
};

// ---------- special card handlers (Three Tricks challenge) ----------

// Mark the special card at `cardIdx` as spent. The card stays in the
// bonus hand so its slot stays occupied (preserves the chip layout and,
// for future modes, blocks ♣ from drawing a fresh card into that
// position). The chip rendering dims used cards and the Use button
// disappears from the detail modal.
const consumeSpecial = (s: GameState, cardIdx: number): BonusCard[] => {
  return s.bonusCards.map((c, i) =>
    i === cardIdx ? { ...c, used: true } : c
  );
};

const handleActivateSpecial = (s: GameState, idx: number): GameState => {
  if (s.phase.kind !== 'awaiting-action') return s;
  if (idx < 0 || idx >= s.bonusCards.length) return s;
  const card = s.bonusCards[idx];
  if (!isSpecialCard(card)) return s;
  // A spent card can't be re-activated. The UI hides the Use button
  // for used cards but the reducer enforces it too in case anything
  // else tries to fire one.
  if (card.used) return s;
  switch (card.specialKind) {
    case 'power-swap': {
      const slots = occupiedSlots(s.grid);
      // Need at least two cards on the grid to swap. With a partially
      // filled board this can theoretically fail; reject gracefully.
      if (slots.length < 2) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-special-power-swap-source',
          cardIdx: idx,
          slots,
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'doubler':
    case 'wildcard': {
      const slots = supercharchableSlots(s.grid);
      if (slots.length === 0) return s;
      return {
        ...s,
        phase: {
          kind:
            card.specialKind === 'doubler'
              ? 'awaiting-special-doubler'
              : 'awaiting-special-wildcard',
          cardIdx: idx,
          slots,
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'mega-destroy': {
      const slots = occupiedSlots(s.grid);
      if (slots.length === 0) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-special-mega-destroy',
          cardIdx: idx,
          slots,
          selected: [],
          returnTo: 'awaiting-action',
        },
      };
    }
    case 'side-slide': {
      const sources = validSideSlideSources(s.grid);
      if (sources.length === 0) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-special-side-slide-source',
          cardIdx: idx,
          sources,
          returnTo: 'awaiting-action',
        },
      };
    }
  }
  return s;
};

const handlePowerSwapSource = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-power-swap-source') return s;
  if (!s.phase.slots.includes(slot)) return s;
  return {
    ...s,
    phase: {
      kind: 'awaiting-special-power-swap-dest',
      cardIdx: s.phase.cardIdx,
      source: slot,
      // Any other occupied slot is a valid dest.
      slots: s.phase.slots.filter(i => i !== slot),
      returnTo: s.phase.returnTo,
    },
  };
};

const handlePowerSwap = (s: GameState, i: number, j: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-power-swap-dest') return s;
  if (s.phase.source !== i && s.phase.source !== j) return s;
  const a = s.grid[i];
  const b = s.grid[j];
  if (!a || !b) return s;
  const grid = s.grid.slice();
  grid[i] = b;
  grid[j] = a;
  const newHand = consumeSpecial(s, s.phase.cardIdx);
  return log(
    { ...s, grid, bonusCards: newHand, phase: { kind: 'awaiting-action' } },
    `Power Swap ${i}↔${j}`
  );
};

const handleResolveDoubler = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-doubler') return s;
  if (!s.phase.slots.includes(slot)) return s;
  const card = s.grid[slot];
  if (!card || isJoker(card)) return s;
  const grid = s.grid.slice();
  // Re-supercharging replaces any prior supercharge (matches Targets Up
  // semantics — see cards.ts Supercharge comment).
  grid[slot] = { ...card, supercharge: 'double' };
  const newHand = consumeSpecial(s, s.phase.cardIdx);
  return log(
    { ...s, grid, bonusCards: newHand, phase: { kind: 'awaiting-action' } },
    `Doubler on slot ${slot}`
  );
};

const handleResolveWildcard = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-wildcard') return s;
  if (!s.phase.slots.includes(slot)) return s;
  const card = s.grid[slot];
  if (!card || isJoker(card)) return s;
  const grid = s.grid.slice();
  grid[slot] = { ...card, supercharge: 'wild' };
  const newHand = consumeSpecial(s, s.phase.cardIdx);
  return log(
    { ...s, grid, bonusCards: newHand, phase: { kind: 'awaiting-action' } },
    `Wildcard on slot ${slot}`
  );
};

const handleToggleMegaDestroyTarget = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-mega-destroy') return s;
  if (!s.phase.slots.includes(slot)) return s;
  const phase = s.phase;
  const already = phase.selected.indexOf(slot);
  let selected: number[];
  if (already >= 0) {
    selected = phase.selected.filter(i => i !== slot);
  } else {
    if (phase.selected.length >= MEGA_DESTROY_MAX) return s;
    selected = [...phase.selected, slot];
  }
  return { ...s, phase: { ...phase, selected } };
};

const handleResolveMegaDestroy = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-special-mega-destroy') return s;
  const phase = s.phase;
  if (phase.selected.length === 0) return s;
  const { grid, removed } = executeMegaDestroy(s.grid, phase.selected);
  const newHand = consumeSpecial(s, phase.cardIdx);
  return log(
    {
      ...s,
      grid,
      discards: [...s.discards, ...removed],
      bonusCards: newHand,
      phase: { kind: 'awaiting-action' },
    },
    `Mega Destroy on ${phase.selected.length} slot${phase.selected.length === 1 ? '' : 's'}`
  );
};

const handleSideSlideSelectSource = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-special-side-slide-source') return s;
  if (!s.phase.sources.includes(slot)) return s;
  const moves = sideSlideDestinationsFrom(s.grid, slot);
  if (moves.length === 0) return s;
  return {
    ...s,
    phase: {
      kind: 'awaiting-special-side-slide-dest',
      cardIdx: s.phase.cardIdx,
      source: slot,
      moves,
      returnTo: s.phase.returnTo,
    },
  };
};

const handleResolveSideSlide = (
  s: GameState,
  from: number,
  direction: Direction,
  distance: number
): GameState => {
  if (s.phase.kind !== 'awaiting-special-side-slide-dest') return s;
  const phase = s.phase;
  const valid = phase.moves.find(
    m => m.from === from && m.direction === direction && m.distance === distance
  );
  if (!valid) return s;
  const grid = executeSideSlide(s.grid, from, direction, distance);
  const newHand = consumeSpecial(s, phase.cardIdx);
  return log(
    { ...s, grid, bonusCards: newHand, phase: { kind: 'awaiting-action' } },
    `Side Slide ${direction} × ${distance}`
  );
};

// ---------- bonus card handlers ----------

// Send `drawn` cards back to bottom of bonus deck (in the given order), then
// retire the club to perkSpent, then advance.
const finishBonusFlow = (
  s: GameState,
  returningDrawn: BonusCard[],
  newBonusCards: BonusCard[]
): GameState => {
  if (!s.drawn || isJoker(s.drawn)) return s;
  return drawNext(
    log(
      pushPerkSpent(
        {
          ...s,
          bonusDeck: [...s.bonusDeck, ...returningDrawn],
          bonusCards: newBonusCards,
        },
        s.drawn
      ),
      'Bonus draw resolved'
    )
  );
};

// Spotlight is exclusive — it cannot share the bonus hand with any
// other card. The "last added wins" rule keeps the logic symmetric:
// if Spotlight ends up co-resident with one or more other cards,
// whichever was added in THIS transition stays and the rest get
// dropped. Callers pass the card they just added so the rule knows
// which side to evict.
const enforceSpotlight = (
  proposedHand: BonusCard[],
  justAdded: BonusCard
): BonusCard[] => {
  const hasSpotlight = proposedHand.some(c => c.id === SPOTLIGHT_ID);
  const hasOthers = proposedHand.some(c => c.id !== SPOTLIGHT_ID);
  if (!hasSpotlight || !hasOthers) return proposedHand;
  // Mixed hand → resolve to whoever was just added.
  if (justAdded.id === SPOTLIGHT_ID) {
    return proposedHand.filter(c => c.id === SPOTLIGHT_ID);
  }
  return proposedHand.filter(c => c.id !== SPOTLIGHT_ID);
};

const handleBonusKeep = (s: GameState, idx: number): GameState => {
  if (s.phase.kind !== 'bonus-card-resolving') return s;
  if (idx < 0 || idx >= s.phase.drawn.length) return s;
  const phase = s.phase;
  const kept = phase.drawn[idx];
  // Mixed Bag categorized-slot path: place the kept card at the
  // pre-chosen slot. Any prior occupant (placeholder OR a real card)
  // gets replaced — the player committed to that slot when they
  // picked it after ♣.
  if (phase.targetSlot !== undefined) {
    const newHand = s.bonusCards.slice();
    // If the previous occupant was a real bonus card (not a
    // placeholder), this is a forced swap — flag for the No Swap
    // achievement check the same way BONUS_REPLACE does.
    const prior = newHand[phase.targetSlot];
    const swappedReal = prior !== undefined && !isPlaceholder(prior);
    newHand[phase.targetSlot] = kept;
    const returning = phase.drawn.filter((_, i) => i !== idx);
    return finishBonusFlow(
      swappedReal ? { ...s, swappedBonus: true } : s,
      returning,
      newHand
    );
  }
  // Spotlight bypasses the cap check: it evicts every other held card
  // on pickup via enforceSpotlight, so the bonus-card-replacing
  // "which one to swap out?" step is meaningless — the held cards all
  // get discarded regardless of which the player would tap. For
  // every other card the at-cap path still routes through
  // BONUS_SELECT_NEW + BONUS_REPLACE.
  if (
    kept.id !== SPOTLIGHT_ID &&
    s.bonusCards.length >= BONUS_HAND_LIMIT
  ) {
    return s;
  }
  const returning = phase.drawn.filter((_, i) => i !== idx);
  const newHand = enforceSpotlight([...s.bonusCards, kept], kept);
  return finishBonusFlow(s, returning, newHand);
};

const handleBonusPickSlot = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-bonus-slot-choice') return s;
  if (!s.slotCategories) return s;
  if (slot < 0 || slot >= s.slotCategories.length) return s;
  const kind = s.slotCategories[slot];
  // Filter the deck to cards that fit this slot's category. Draw up
  // to 2 from the top of the filtered subset; the remaining (in
  // original order) becomes the new bonus deck.
  const eligible = s.bonusDeck.filter(c => cardMatchesSlot(c, kind));
  if (eligible.length === 0) return s;
  const drawCount = Math.min(2, eligible.length);
  const drawnSet = new Set(eligible.slice(0, drawCount));
  const drawn = eligible.slice(0, drawCount);
  const remainingDeck = s.bonusDeck.filter(c => !drawnSet.has(c));
  return {
    ...s,
    bonusDeck: remainingDeck,
    phase: {
      kind: 'bonus-card-resolving',
      drawn,
      targetSlot: slot,
      returnTo: 'awaiting-action',
    },
  };
};

const handleBonusSelectNew = (s: GameState, idx: number): GameState => {
  if (s.phase.kind !== 'bonus-card-resolving') return s;
  if (idx < 0 || idx >= s.phase.drawn.length) return s;
  if (s.bonusCards.length < BONUS_HAND_LIMIT) return s;
  return {
    ...s,
    phase: {
      kind: 'bonus-card-replacing',
      drawn: s.phase.drawn,
      pickedNew: idx,
      returnTo: s.phase.returnTo,
    },
  };
};

const handleBonusReplace = (s: GameState, oldIdx: number): GameState => {
  if (s.phase.kind !== 'bonus-card-replacing') return s;
  const phase = s.phase;
  if (oldIdx < 0 || oldIdx >= s.bonusCards.length) return s;
  const newCard = phase.drawn[phase.pickedNew];
  if (!newCard) return s;
  const replaced = s.bonusCards.slice();
  replaced[oldIdx] = newCard;
  const newHand = enforceSpotlight(replaced, newCard);
  // The OTHER drawn card returns to the bottom of the bonus deck. The replaced
  // bonus card is gone (we don't model a bonus-card trash explicitly).
  const returningDrawn = phase.drawn.filter((_, i) => i !== phase.pickedNew);
  // Mark that a forced-swap happened — the No Swap challenge looks at this.
  return finishBonusFlow({ ...s, swappedBonus: true }, returningDrawn, newHand);
};

const handleBonusDecline = (s: GameState): GameState => {
  if (
    s.phase.kind !== 'bonus-card-resolving' &&
    s.phase.kind !== 'bonus-card-replacing'
  ) {
    return s;
  }
  // At the cap, declining is normally not allowed — the player must take
  // one of the drawn cards and swap one out. Easy difficulty flips this
  // via bonusDeclineAllowed so the player can keep their existing hand.
  if (
    s.bonusCards.length >= BONUS_HAND_LIMIT &&
    !s.bonusDeclineAllowed
  ) {
    return s;
  }
  return finishBonusFlow(s, s.phase.drawn, s.bonusCards);
};

const handleCancelAction = (s: GameState): GameState => {
  switch (s.phase.kind) {
    case 'awaiting-action':
    case 'game-over':
      return s;
    case 'awaiting-target-slide-dest':
      // Back to source selection within the same slide flow.
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-slide-source',
          sources: validSlideSources(s.grid),
          returnTo: s.phase.returnTo,
        },
      };
    case 'bonus-card-replacing':
      // Back to the resolve-pick step.
      return {
        ...s,
        phase: {
          kind: 'bonus-card-resolving',
          drawn: s.phase.drawn,
          returnTo: s.phase.returnTo,
        },
      };
    case 'awaiting-special-power-swap-dest':
      // Back to source selection within the same power-swap flow —
      // includes the previously-picked source as a valid candidate
      // again so the player can re-pick the first card.
      return {
        ...s,
        phase: {
          kind: 'awaiting-special-power-swap-source',
          cardIdx: s.phase.cardIdx,
          slots: occupiedSlots(s.grid),
          returnTo: s.phase.returnTo,
        },
      };
    case 'awaiting-special-side-slide-dest':
      // Back to source selection within the same side-slide flow.
      return {
        ...s,
        phase: {
          kind: 'awaiting-special-side-slide-source',
          cardIdx: s.phase.cardIdx,
          sources: validSideSlideSources(s.grid),
          returnTo: s.phase.returnTo,
        },
      };
    case 'awaiting-target-hop':
    case 'awaiting-target-slide-source':
    case 'awaiting-target-destroy':
    case 'bonus-card-resolving':
    case 'awaiting-bonus-slot-choice':
    case 'awaiting-special-power-swap-source':
    case 'awaiting-special-doubler':
    case 'awaiting-special-wildcard':
    case 'awaiting-special-mega-destroy':
    case 'awaiting-special-side-slide-source':
      return { ...s, phase: { kind: s.phase.returnTo } };
  }
};

// Actions that "commit" a turn (mutate grid / deck / bonusCards in a way the
// player would want to undo). Each of these pushes a snapshot of the prior
// state onto the undo stack.
const SNAP_ACTIONS = new Set<Action['type']>([
  'PLACE',
  'DISCARD_NONE',
  'RESOLVE_HOP',
  'RESOLVE_SLIDE',
  'RESOLVE_DESTROY',
  'BONUS_KEEP',
  'BONUS_REPLACE',
  'BONUS_DECLINE',
  // Special-card commits — each consumes a one-time card and mutates the
  // grid, so undo should restore both.
  'RESOLVE_POWER_SWAP',
  'RESOLVE_DOUBLER',
  'RESOLVE_WILDCARD',
  'RESOLVE_MEGA_DESTROY',
  'RESOLVE_SIDE_SLIDE',
]);

const handleUndo = (s: GameState): GameState => {
  const last = s.past[s.past.length - 1];
  if (!last) return s;
  return {
    ...last,
    past: s.past.slice(0, -1),
    // undoCount tracks total undos across the run; never reverts.
    undoCount: s.undoCount + 1,
  };
};

export const step = (
  state: GameState,
  action: Action,
  rng: () => number = Math.random
): GameState => {
  if (action.type === 'UNDO') return handleUndo(state);
  let next: GameState;
  switch (action.type) {
    case 'PLACE':
      next = handlePlace(state);
      break;
    case 'DISCARD_NONE':
      next = handleDiscardNone(state);
      break;
    case 'BEGIN_SUIT_ACTION':
      next = handleBeginSuitAction(state, rng, action.forSuit);
      break;
    case 'RESOLVE_HOP':
      next = handleResolveHop(state, action.i, action.j);
      break;
    case 'SLIDE_SELECT_SOURCE':
      next = handleSlideSelectSource(state, action.slot);
      break;
    case 'RESOLVE_SLIDE':
      next = handleResolveSlide(state, action.from, action.direction, action.distance);
      break;
    case 'RESOLVE_DESTROY':
      next = handleResolveDestroy(state, action.slot);
      break;
    case 'BONUS_KEEP':
      next = handleBonusKeep(state, action.idx);
      break;
    case 'BONUS_SELECT_NEW':
      next = handleBonusSelectNew(state, action.idx);
      break;
    case 'BONUS_REPLACE':
      next = handleBonusReplace(state, action.oldIdx);
      break;
    case 'BONUS_DECLINE':
      next = handleBonusDecline(state);
      break;
    case 'BONUS_PICK_SLOT':
      next = handleBonusPickSlot(state, action.slot);
      break;
    case 'CANCEL_ACTION':
      next = handleCancelAction(state);
      break;
    case 'ACTIVATE_SPECIAL_CARD':
      next = handleActivateSpecial(state, action.idx);
      break;
    case 'RESOLVE_POWER_SWAP_SOURCE':
      next = handlePowerSwapSource(state, action.slot);
      break;
    case 'RESOLVE_POWER_SWAP':
      next = handlePowerSwap(state, action.i, action.j);
      break;
    case 'RESOLVE_DOUBLER':
      next = handleResolveDoubler(state, action.slot);
      break;
    case 'RESOLVE_WILDCARD':
      next = handleResolveWildcard(state, action.slot);
      break;
    case 'TOGGLE_MEGA_DESTROY_TARGET':
      next = handleToggleMegaDestroyTarget(state, action.slot);
      break;
    case 'RESOLVE_MEGA_DESTROY':
      next = handleResolveMegaDestroy(state);
      break;
    case 'SIDE_SLIDE_SELECT_SOURCE':
      next = handleSideSlideSelectSource(state, action.slot);
      break;
    case 'RESOLVE_SIDE_SLIDE':
      next = handleResolveSideSlide(state, action.from, action.direction, action.distance);
      break;
  }
  if (next === state) return state;
  if (SNAP_ACTIONS.has(action.type) && state.phase.kind !== 'game-over') {
    const snap: GameState = { ...state, past: [] };
    return { ...next, past: [...state.past, snap] };
  }
  return next;
};
