import { useCallback, useReducer } from 'react';
import { Action, GameState, newGame, step } from '../../game/state';
import { Difficulty } from '../../game/rules';

interface GameApi {
  state: GameState;
  dispatch: (a: Action) => void;
  reset: (difficulty: Difficulty) => void;
}

type Reducer = (s: GameState, a: Action | { type: '__reset'; difficulty: Difficulty }) => GameState;

const reducer: Reducer = (s, a) => {
  if (a.type === '__reset') return newGame(a.difficulty);
  return step(s, a);
};

export const useGame = (difficulty: Difficulty): GameApi => {
  const [state, rawDispatch] = useReducer(reducer, undefined as unknown as GameState, () =>
    newGame(difficulty)
  );

  const dispatch = useCallback(
    (a: Action) => rawDispatch(a),
    [rawDispatch]
  );

  const reset = useCallback(
    (d: Difficulty) => rawDispatch({ type: '__reset', difficulty: d }),
    [rawDispatch]
  );

  return { state, dispatch, reset };
};
