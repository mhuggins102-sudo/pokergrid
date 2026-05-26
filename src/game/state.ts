import { Card, isJoker, StandardCard } from './cards';
import { freshShuffledDeck, shuffle } from './deck';
import { emptyGrid, Grid, isFull, nextSpiralSlot, placeAtSpiralNext } from './grid';
import { HandRank } from './hands';
import {
  BonusCard,
  BONUS_DECK_POOL,
  BONUS_HAND_LIMIT,
} from './bonusCards';
import { Difficulty, TARGET_BY_DIFFICULTY } from './rules';
import {
  canDrawBonus,
  canDestroy,
  canHop,
  canSlide,
  destroyableSlots,
  executeDestroy,
  executeHop,
  executeSlide,
  SlideMove,
  slideDestinationsFrom,
  validHopSwaps,
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
      returnTo: TargetReturnTo;
    }
  | {
      kind: 'bonus-card-replacing';
      drawn: BonusCard[];
      pickedNew: number; // index into drawn
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
}

export type Action =
  | { type: 'PLACE' }
  | { type: 'DISCARD_NONE' } // sends drawn to discards (no perk used)
  | { type: 'BEGIN_SUIT_ACTION' }
  | { type: 'RESOLVE_HOP'; i: number; j: number }
  | { type: 'SLIDE_SELECT_SOURCE'; slot: number }
  | { type: 'RESOLVE_SLIDE'; from: number; direction: Direction; distance: number }
  | { type: 'RESOLVE_DESTROY'; slot: number }
  | { type: 'BONUS_KEEP'; idx: number }
  | { type: 'BONUS_SELECT_NEW'; idx: number }
  | { type: 'BONUS_REPLACE'; oldIdx: number }
  | { type: 'BONUS_DECLINE' }
  | { type: 'CANCEL_ACTION' }
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

// Easy and Medium players start with one random bonus card already in hand;
// Hard begins empty. Easy also gets to peek the remaining-deck composition
// during play (wired in the UI; see RemainingDeckModal).
export const STARTER_BONUS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 1,
  hard: 0,
};

export const canPreviewDeck = (difficulty: Difficulty): boolean =>
  difficulty === 'easy';

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
  // Targets-Up carry-over: cards the player kept from the previous level's
  // power-up pick, pre-placed in the starting hand. The free easy/medium
  // starter is drawn AROUND these so the same card type isn't duplicated.
  keptBonusCards: BonusCard[] = [],
  // Targets-Up carry-over: extra bonus cards (the two NOT kept from each
  // previous level, powered up) shuffled into this level's bonus deck.
  deckExtras: BonusCard[] = []
): GameState => {
  let deck = freshShuffledDeck(rng);
  if (deckLimit !== undefined && deckLimit < deck.length) {
    deck = deck.slice(0, deckLimit);
  }
  // The free easy/medium starter must come from the un-powered pool AND
  // must not duplicate any card the player has already kept across levels
  // (per the user's "the second card should not be one of the other
  // superpowered cards" rule). Filter the standard pool to exclude held
  // base ids before drawing the starter.
  const heldBaseIds = new Set(
    keptBonusCards.map(c => c.id.replace(/-pwr\d+$/, ''))
  );
  const drawable = BONUS_DECK_POOL.filter(c => !heldBaseIds.has(c.id));
  const shuffledBonus = shuffle(drawable, rng);
  const starterCount = STARTER_BONUS_BY_DIFFICULTY[difficulty];
  // Player's hand starts with the kept carry-overs first, then the
  // difficulty-based free starter on top (capped at BONUS_HAND_LIMIT just
  // in case future power-ups push the carry to 3 cards on hard).
  const starterDraw = shuffledBonus.slice(0, starterCount);
  const bonusCards = [...keptBonusCards, ...starterDraw].slice(0, BONUS_HAND_LIMIT);
  // Bonus deck = standard pool minus the drawn starter + powered carry-overs
  // from earlier levels. Shuffled together so the powered cards can resurface
  // at any time.
  const remainingPool = shuffledBonus.slice(starterCount);
  const bonusDeck = shuffle([...remainingPool, ...deckExtras], rng);
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
  return drawNext(log(pushDiscard(s, s.drawn), 'Discard'));
};

const handleBeginSuitAction = (s: GameState, rng: () => number): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn)) return s;
  const drawn = s.drawn;
  switch (drawn.suit) {
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

const handleBonusKeep = (s: GameState, idx: number): GameState => {
  if (s.phase.kind !== 'bonus-card-resolving') return s;
  if (idx < 0 || idx >= s.phase.drawn.length) return s;
  // Only valid when below the limit; at limit, use BONUS_SELECT_NEW + BONUS_REPLACE.
  if (s.bonusCards.length >= BONUS_HAND_LIMIT) return s;
  const kept = s.phase.drawn[idx];
  const returning = s.phase.drawn.filter((_, i) => i !== idx);
  return finishBonusFlow(s, returning, [...s.bonusCards, kept]);
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
  const newHand = s.bonusCards.slice();
  newHand[oldIdx] = newCard;
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
  // At the cap, declining is not allowed — the player must take one of the
  // drawn cards and swap out an old one.
  if (s.bonusCards.length >= BONUS_HAND_LIMIT) return s;
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
    case 'awaiting-target-hop':
    case 'awaiting-target-slide-source':
    case 'awaiting-target-destroy':
    case 'bonus-card-resolving':
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
      next = handleBeginSuitAction(state, rng);
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
    case 'CANCEL_ACTION':
      next = handleCancelAction(state);
      break;
  }
  if (next === state) return state;
  if (SNAP_ACTIONS.has(action.type) && state.phase.kind !== 'game-over') {
    const snap: GameState = { ...state, past: [] };
    return { ...next, past: [...state.past, snap] };
  }
  return next;
};
