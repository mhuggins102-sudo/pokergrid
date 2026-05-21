import { Card, StandardCard, isJoker } from './cards';
import { freshShuffledDeck, shuffle } from './deck';
import { emptyGrid, Grid, isFull, placeAtLowest } from './grid';
import { HandRank } from './hands';
import { Modifier, drawRandomModifiers } from './modifiers';
import { ClubBonus } from './scoring';
import {
  Difficulty,
  MODIFIERS_PER_RUN,
  TARGET_BY_DIFFICULTY,
} from './rules';
import {
  canExecuteClubs,
  canExecuteDiamonds,
  canExecuteHearts,
  canExecuteSpades,
  executeClubs,
  executeHearts,
  executeSpades,
  SpadeMove,
  validHeartsSwaps,
  validSpadeMoves,
  availableClubTargets,
} from './actions';

export type TargetReturnTo = 'awaiting-action' | 'diamond-resolving';

export type Phase =
  | { kind: 'awaiting-action' }
  | { kind: 'awaiting-target-hearts'; pairs: [number, number][]; returnTo: TargetReturnTo }
  | { kind: 'awaiting-target-spades'; moves: SpadeMove[]; returnTo: TargetReturnTo }
  | { kind: 'awaiting-target-clubs'; targets: HandRank[]; returnTo: TargetReturnTo }
  | { kind: 'diamond-choosing'; choices: [StandardCard, StandardCard] }
  | { kind: 'diamond-resolving' }
  | { kind: 'diamond-place-swap' }
  | { kind: 'game-over' };

export interface GameState {
  deck: Card[];
  discard: StandardCard[]; // jokers can never be discarded
  trash: StandardCard[]; // cards permanently removed via suit actions or diamond-trash
  grid: Grid;
  drawn: Card | null;
  clubs: ClubBonus;
  modifiers: Modifier[];
  difficulty: Difficulty;
  target: number;
  phase: Phase;
  history: string[];
}

export type Action =
  | { type: 'PLACE' }
  | { type: 'DISCARD_NONE' } // also "trash" while in diamond-resolving
  | { type: 'BEGIN_SUIT_ACTION' }
  | { type: 'RESOLVE_HEARTS'; i: number; j: number }
  | { type: 'RESOLVE_SPADES'; from: number; to: number }
  | { type: 'RESOLVE_CLUBS'; hand: HandRank }
  | { type: 'CHOOSE_DIAMOND'; idx: 0 | 1 }
  | { type: 'BEGIN_DIAMOND_SWAP' }
  | { type: 'RESOLVE_DIAMOND_SWAP'; slot: number }
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
      const grid = placeAtLowest(s.grid, next);
      s = log({ ...s, deck: rest, grid }, 'Joker auto-placed');
      continue;
    }
    return { ...s, deck: rest, drawn: next, phase: { kind: 'awaiting-action' } };
  }
};

export const newGame = (
  difficulty: Difficulty,
  rng: () => number = Math.random
): GameState => {
  const deck = freshShuffledDeck(rng);
  const modifiers = drawRandomModifiers(MODIFIERS_PER_RUN, rng);
  const [first, ...rest] = deck;
  const grid = placeAtLowest(emptyGrid(), first);
  const initial: GameState = {
    deck: rest,
    discard: [],
    trash: [],
    grid,
    drawn: null,
    clubs: {},
    modifiers,
    difficulty,
    target: TARGET_BY_DIFFICULTY[difficulty],
    phase: { kind: 'awaiting-action' },
    history: ['Game start'],
  };
  return drawNext(initial);
};

// ---------- internal helpers ----------

const pushDiscard = (s: GameState, card: Card): GameState => {
  if (isJoker(card)) {
    throw new Error('Joker cannot be discarded');
  }
  return { ...s, discard: [...s.discard, card] };
};

const pushTrash = (s: GameState, card: Card): GameState => {
  if (isJoker(card)) {
    throw new Error('Joker cannot be trashed');
  }
  return { ...s, trash: [...s.trash, card] };
};

const isLiveActionPhase = (k: Phase['kind']): k is 'awaiting-action' | 'diamond-resolving' =>
  k === 'awaiting-action' || k === 'diamond-resolving';

// ---------- action handlers ----------

const handlePlace = (s: GameState): GameState => {
  if (!isLiveActionPhase(s.phase.kind) || !s.drawn) return s;
  const grid = placeAtLowest(s.grid, s.drawn);
  return drawNext(log({ ...s, grid }, 'Place'));
};

// In awaiting-action: discards the drawn card. In diamond-resolving: trashes it.
const handleDiscardNone = (s: GameState): GameState => {
  if (!isLiveActionPhase(s.phase.kind) || !s.drawn) return s;
  if (isJoker(s.drawn)) return s;
  if (s.phase.kind === 'diamond-resolving') {
    return drawNext(log(pushTrash(s, s.drawn), 'Trash diamond pick'));
  }
  return drawNext(log(pushDiscard(s, s.drawn), 'Discard (no action)'));
};

const handleBeginSuitAction = (s: GameState, rng: () => number): GameState => {
  if (!isLiveActionPhase(s.phase.kind) || !s.drawn || isJoker(s.drawn)) return s;
  const drawn = s.drawn;
  const returnTo: TargetReturnTo =
    s.phase.kind === 'diamond-resolving' ? 'diamond-resolving' : 'awaiting-action';

  switch (drawn.suit) {
    case 'H': {
      if (!canExecuteHearts(s.grid, drawn)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-hearts',
          pairs: validHeartsSwaps(s.grid, drawn),
          returnTo,
        },
      };
    }
    case 'S': {
      if (!canExecuteSpades(s.grid, drawn)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-spades',
          moves: validSpadeMoves(s.grid, drawn),
          returnTo,
        },
      };
    }
    case 'C': {
      if (!canExecuteClubs(s.clubs)) return s;
      return {
        ...s,
        phase: {
          kind: 'awaiting-target-clubs',
          targets: availableClubTargets(s.clubs),
          returnTo,
        },
      };
    }
    case 'D': {
      // Diamond chain is forbidden: the chosen pick from a diamond cannot
      // re-trigger another diamond action.
      if (s.phase.kind === 'diamond-resolving') return s;
      if (!canExecuteDiamonds(s.discard.length)) return s;
      if (s.discard.length === 1) {
        // Only one card in discard: it auto-becomes the new drawn pick.
        // The diamond card is trashed (suit-action use).
        const sole = s.discard[0];
        const afterDiamond = pushTrash({ ...s, discard: [] }, drawn);
        return log(
          { ...afterDiamond, drawn: sole, phase: { kind: 'diamond-resolving' } },
          'Diamond auto-redraw'
        );
      }
      const shuffled = shuffle(s.discard, rng);
      const a = shuffled[0];
      const b = shuffled[1];
      const rest = shuffled.slice(2);
      return {
        ...s,
        discard: rest,
        phase: { kind: 'diamond-choosing', choices: [a, b] },
      };
    }
  }
};

const handleResolveHearts = (
  s: GameState,
  i: number,
  j: number
): GameState => {
  if (s.phase.kind !== 'awaiting-target-hearts') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const grid = executeHearts(s.grid, i, j);
  // Suit-action card is trashed, not discarded.
  const next = pushTrash({ ...s, grid }, s.drawn);
  return drawNext(log(next, `Hearts swap ${i}↔${j}`));
};

const handleResolveSpades = (
  s: GameState,
  from: number,
  to: number
): GameState => {
  if (s.phase.kind !== 'awaiting-target-spades') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const grid = executeSpades(s.grid, from, to);
  const next = pushTrash({ ...s, grid }, s.drawn);
  return drawNext(log(next, `Spades move ${from}→${to}`));
};

const handleResolveClubs = (s: GameState, hand: HandRank): GameState => {
  if (s.phase.kind !== 'awaiting-target-clubs') return s;
  if (!s.drawn || isJoker(s.drawn) || s.drawn.suit !== 'C') return s;
  const clubs = executeClubs(s.clubs, s.drawn, hand);
  const next = pushTrash({ ...s, clubs }, s.drawn);
  return drawNext(log(next, `Clubs boost ${hand}`));
};

const handleChooseDiamond = (s: GameState, idx: 0 | 1): GameState => {
  if (s.phase.kind !== 'diamond-choosing') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  const [a, b] = s.phase.choices;
  const chosen = idx === 0 ? a : b;
  const other = idx === 0 ? b : a;
  // Un-chosen card returns to discard. Original diamond is trashed.
  const afterReturn = pushDiscard(s, other);
  const afterDiamond = pushTrash(afterReturn, s.drawn);
  return log(
    { ...afterDiamond, drawn: chosen, phase: { kind: 'diamond-resolving' } },
    `Diamond redraw choice ${idx}`
  );
};

const handleBeginDiamondSwap = (s: GameState): GameState => {
  if (s.phase.kind !== 'diamond-resolving') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  // Need at least one non-joker grid card to swap with.
  const hasTarget = s.grid.some(c => c !== null && !isJoker(c));
  if (!hasTarget) return s;
  return { ...s, phase: { kind: 'diamond-place-swap' } };
};

const handleResolveDiamondSwap = (s: GameState, slot: number): GameState => {
  if (s.phase.kind !== 'diamond-place-swap') return s;
  if (!s.drawn || isJoker(s.drawn)) return s;
  if (slot < 0 || slot >= s.grid.length) return s;
  const existing = s.grid[slot];
  if (!existing || isJoker(existing)) return s; // can't displace empty or joker
  const grid = s.grid.slice();
  grid[slot] = s.drawn;
  // Displaced card goes to discard (per rule).
  const next = pushDiscard({ ...s, grid }, existing);
  return drawNext(log(next, `Diamond swap-place @ slot ${slot}`));
};

const handleCancelAction = (s: GameState): GameState => {
  switch (s.phase.kind) {
    case 'awaiting-action':
    case 'game-over':
    case 'diamond-choosing':
    case 'diamond-resolving':
      // Cannot cancel: terminal/in-flight states with no parent to return to.
      return s;
    case 'diamond-place-swap':
      return { ...s, phase: { kind: 'diamond-resolving' } };
    case 'awaiting-target-hearts':
    case 'awaiting-target-spades':
    case 'awaiting-target-clubs':
      return { ...s, phase: { kind: s.phase.returnTo } as Phase };
  }
};

// ---------- reducer ----------

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
    case 'RESOLVE_HEARTS':
      return handleResolveHearts(state, action.i, action.j);
    case 'RESOLVE_SPADES':
      return handleResolveSpades(state, action.from, action.to);
    case 'RESOLVE_CLUBS':
      return handleResolveClubs(state, action.hand);
    case 'CHOOSE_DIAMOND':
      return handleChooseDiamond(state, action.idx);
    case 'BEGIN_DIAMOND_SWAP':
      return handleBeginDiamondSwap(state);
    case 'RESOLVE_DIAMOND_SWAP':
      return handleResolveDiamondSwap(state, action.slot);
    case 'CANCEL_ACTION':
      return handleCancelAction(state);
  }
};
