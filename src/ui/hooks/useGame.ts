import { useCallback, useReducer } from 'react';
import { Action, GameState, newGame, step } from '../../game/state';
import { Difficulty } from '../../game/rules';

interface GameApi {
  state: GameState;
  dispatch: (a: Action) => void;
}

type Reducer = (s: GameState, a: Action) => GameState;

const reducer: Reducer = (s, a) => step(s, a);

export const useGame = (difficulty: Difficulty, target?: number): GameApi => {
  const [state, rawDispatch] = useReducer(
    reducer,
    undefined as unknown as GameState,
    () => newGame(difficulty, undefined, target)
  );

  const dispatch = useCallback((a: Action) => rawDispatch(a), [rawDispatch]);

  return { state, dispatch };
};
