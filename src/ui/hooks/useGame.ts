import { useCallback, useReducer } from 'react';
import { BonusCard } from '../../game/bonusCards';
import { Card } from '../../game/cards';
import { Action, GameState, newGame, step } from '../../game/state';
import { Difficulty } from '../../game/rules';

interface GameApi {
  state: GameState;
  dispatch: (a: Action) => void;
}

type Reducer = (s: GameState, a: Action) => GameState;

const reducer: Reducer = (s, a) => step(s, a);

export const useGame = (
  difficulty: Difficulty,
  target?: number,
  deckLimit?: number,
  noSwap?: boolean,
  keptBonusCards?: BonusCard[],
  deckExtras?: BonusCard[],
  superchargedDeckCards?: Card[],
  noDiscards?: boolean
): GameApi => {
  const [state, rawDispatch] = useReducer(
    reducer,
    undefined as unknown as GameState,
    () =>
      newGame(
        difficulty,
        undefined,
        target,
        deckLimit,
        noSwap ?? false,
        noDiscards ?? false,
        keptBonusCards,
        deckExtras,
        superchargedDeckCards
      )
  );

  const dispatch = useCallback((a: Action) => rawDispatch(a), [rawDispatch]);

  return { state, dispatch };
};
