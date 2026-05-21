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

export type Phase =
  | { kind: 'awaiting-action' }
  | { kind: 'awaiting-target-hearts'; pairs: [number, number][] }
  | { kind: 'awaiting-target-spades'; moves: SpadeMove[] }
  | { kind: 'awaiting-target-clubs'; targets: HandRank[] }
  | { kind: 'diamond-choosing'; choices: [StandardCard, StandardCard] }
  | { kind: 'game-over' };

export interface GameState {
  deck: Card[];
  discard: StandardCard[]; // jokers can never be discarded
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
  | { type: 'DISCARD_NONE' }
  | { type: 'BEGIN_SUIT_ACTION' }
  | { type: 'RESOLVE_HEARTS'; i: number; j: number }
  | { type: 'RESOLVE_SPADES'; from: number; to: number }
  | { type: 'RESOLVE_CLUBS'; hand: HandRank }
  | { type: 'CHOOSE_DIAMOND'; idx: 0 | 1 }
  | { type: 'CANCEL_ACTION' };

const log = (s: GameState, msg: string): GameState => ({
  ...s,
  history: [...s.history, msg],
});

// Draw the next card from deck, auto-placing jokers and ending the game when
// appropriate. Used after every successful place/discard.
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

const requirePhase = (s: GameState, k: Phase['kind']) => {
  if (s.phase.kind !== k) throw new Error(`Bad phase: expected ${k}, got ${s.phase.kind}`);
};

// ---------- action handlers ----------

const handlePlace = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn) return s;
  const grid = placeAtLowest(s.grid, s.drawn);
  return drawNext(log({ ...s, grid }, 'Place'));
};

const handleDiscardNone = (s: GameState): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn) return s;
  if (isJoker(s.drawn)) return s; // illegal — joker can't be discarded
  return drawNext(log(pushDiscard(s, s.drawn), 'Discard (no action)'));
};

const handleBeginSuitAction = (s: GameState, rng: () => number): GameState => {
  if (s.phase.kind !== 'awaiting-action' || !s.drawn || isJoker(s.drawn)) return s;
  const drawn = s.drawn;
  switch (drawn.suit) {
    case 'H': {
      if (!canExecuteHearts(s.grid)) return s;
      return {
        ...s,
        phase: { kind: 'awaiting-target-hearts', pairs: validHeartsSwaps(s.grid) },
      };
    }
    case 'S': {
      if (!canExecuteSpades(s.grid, drawn)) return s;
      return {
        ...s,
        phase: { kind: 'awaiting-target-spades', moves: validSpadeMoves(s.grid, drawn) },
      };
    }
    case 'C': {
      if (!canExecuteClubs(s.clubs)) return s;
      return {
        ...s,
        phase: { kind: 'awaiting-target-clubs', targets: availableClubTargets(s.clubs) },
      };
    }
    case 'D': {
      if (!canExecuteDiamonds(s.discard.length)) return s;
      if (s.discard.length === 1) {
        // Forced placement of the lone discarded card.
        const card = s.discard[0];
        const grid = placeAtLowest(s.grid, card);
        const withDrawn = pushDiscard({ ...s, grid, discard: [] }, drawn);
        return drawNext(log(withDrawn, 'Diamond forced-place'));
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
  requirePhase(s, 'awaiting-target-hearts');
  if (!s.drawn || isJoker(s.drawn)) return s;
  const grid = executeHearts(s.grid, i, j);
  const next = pushDiscard({ ...s, grid }, s.drawn);
  return drawNext(log(next, `Hearts swap ${i}↔${j}`));
};

const handleResolveSpades = (
  s: GameState,
  from: number,
  to: number
): GameState => {
  requirePhase(s, 'awaiting-target-spades');
  if (!s.drawn || isJoker(s.drawn)) return s;
  const grid = executeSpades(s.grid, from, to);
  const next = pushDiscard({ ...s, grid }, s.drawn);
  return drawNext(log(next, `Spades move ${from}→${to}`));
};

const handleResolveClubs = (s: GameState, hand: HandRank): GameState => {
  requirePhase(s, 'awaiting-target-clubs');
  if (!s.drawn || isJoker(s.drawn) || s.drawn.suit !== 'C') return s;
  const clubs = executeClubs(s.clubs, s.drawn, hand);
  const next = pushDiscard({ ...s, clubs }, s.drawn);
  return drawNext(log(next, `Clubs boost ${hand}`));
};

const handleChooseDiamond = (s: GameState, idx: 0 | 1): GameState => {
  requirePhase(s, 'diamond-choosing');
  if (s.phase.kind !== 'diamond-choosing') return s; // narrow
  if (!s.drawn || isJoker(s.drawn)) return s;
  const [a, b] = s.phase.choices;
  const chosen = idx === 0 ? a : b;
  const other = idx === 0 ? b : a;
  const grid = placeAtLowest(s.grid, chosen);
  const afterReturn = pushDiscard({ ...s, grid }, other);
  const afterDrawn = pushDiscard(afterReturn, s.drawn);
  return drawNext(log(afterDrawn, `Diamond place choice ${idx}`));
};

const handleCancelAction = (s: GameState): GameState => {
  if (s.phase.kind === 'awaiting-action' || s.phase.kind === 'game-over') return s;
  // Note: cancelling a Diamond after the draw has already happened is not
  // allowed (the two cards were already pulled). The UI should not offer a
  // cancel button in the diamond-choosing phase.
  if (s.phase.kind === 'diamond-choosing') return s;
  return { ...s, phase: { kind: 'awaiting-action' } };
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
    case 'CANCEL_ACTION':
      return handleCancelAction(state);
  }
};
