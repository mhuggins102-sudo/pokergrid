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
  trash: Card[];
  bonusDeck: BonusCard[]; // depleting
  bonusCards: BonusCard[]; // held (max BONUS_HAND_LIMIT)
  grid: Grid;
  drawn: Card | null;
  difficulty: Difficulty;
  target: number;
  phase: Phase;
  history: string[];
}

export type Action =
  | { type: 'PLACE' }
  | { type: 'DISCARD_NONE' } // sends drawn to trash (no discard pile)
  | { type: 'BEGIN_SUIT_ACTION' }
  | { type: 'RESOLVE_HOP'; i: number; j: number }
  | { type: 'SLIDE_SELECT_SOURCE'; slot: number }
  | { type: 'RESOLVE_SLIDE'; from: number; direction: Direction; distance: number }
  | { type: 'RESOLVE_DESTROY'; slot: number }
  | { type: 'BONUS_KEEP'; idx: number }
  | { type: 'BONUS_SELECT_NEW'; idx: number }
  | { type: 'BONUS_REPLACE'; oldIdx: number }
  | { type: 'BONUS_DECLINE' }
  | { type: 'CANCEL_ACTION' };

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

export const newGame = (
  difficulty: Difficulty,
  rng: () => number = Math.random,
  targetOverride?: number
): GameState => {
  const deck = freshShuffledDeck(rng);
  const bonusDeck = shuffle(BONUS_DECK_POOL, rng);
  const [first, ...rest] = deck;
  const grid = placeAtSpiralNext(emptyGrid(), first);
  const initial: GameState = {
    deck: rest,
    trash: [],
    bonusDeck,
    bonusCards: [],
    grid,
    drawn: null,
    difficulty,
    target: targetOverride ?? TARGET_BY_DIFFICULTY[difficulty],
    phase: { kind: 'awaiting-action' },
    history: ['Game start'],
  };
  return drawNext(initial);
};

// ---------- helpers ----------

const pushTrash = (s: GameState, card: Card): GameState => ({
  ...s,
  trash: [...s.trash, card],
});

// ---------- action handlers ----------

const handlePlace = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn) return s;
  const grid = placeAtSpiralNext(s.grid, s.drawn);
  return drawNext(log({ ...s, grid }, 'Place'));
};

const handleDiscardNone = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn)) return s;
  return drawNext(log(pushTrash(s, s.drawn), 'Discard (trashed)'));
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
  return drawNext(log(pushTrash({ ...s, grid }, s.drawn), `Hop ${i}↔${j}`));
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
    log(pushTrash({ ...s, grid }, s.drawn), `Slide ${direction} × ${distance}`)
  );
};

const handleResolveDestroy = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'awaiting-target-destroy') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const { grid, removed } = executeDestroy(s.grid, slot);
  const afterTarget = pushTrash({ ...s, grid }, removed);
  return drawNext(log(pushTrash(afterTarget, s.drawn), `Destroy slot ${slot}`));
};

// ---------- bonus card handlers ----------

// Send `drawn` cards back to bottom of bonus deck (in the given order), then
// trash the club, then advance.
const finishBonusFlow = (
  s: GameState,
  returningDrawn: BonusCard[],
  newBonusCards: BonusCard[]
): GameState => {
  if (!s.drawn || isJoker(s.drawn)) return s;
  return drawNext(
    log(
      pushTrash(
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
  return finishBonusFlow(s, returningDrawn, newHand);
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

export const step = (
  state: GameState,
  action: Action,
  rng: () => number = Math.random
): GameState => {
  switch (action.type) {
    case 'PLACE':
      return handlePlace(state);
    case 'DISCARD_NONE':
      return handleDiscardNone(state);
    case 'BEGIN_SUIT_ACTION':
      return handleBeginSuitAction(state, rng);
    case 'RESOLVE_HOP':
      return handleResolveHop(state, action.i, action.j);
    case 'SLIDE_SELECT_SOURCE':
      return handleSlideSelectSource(state, action.slot);
    case 'RESOLVE_SLIDE':
      return handleResolveSlide(state, action.from, action.direction, action.distance);
    case 'RESOLVE_DESTROY':
      return handleResolveDestroy(state, action.slot);
    case 'BONUS_KEEP':
      return handleBonusKeep(state, action.idx);
    case 'BONUS_SELECT_NEW':
      return handleBonusSelectNew(state, action.idx);
    case 'BONUS_REPLACE':
      return handleBonusReplace(state, action.oldIdx);
    case 'BONUS_DECLINE':
      return handleBonusDecline(state);
    case 'CANCEL_ACTION':
      return handleCancelAction(state);
  }
};
