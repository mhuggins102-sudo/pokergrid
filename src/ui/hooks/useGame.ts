import { useCallback, useReducer } from 'react';
import { BonusCard, SlotKind } from '../../game/bonusCards';
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
  noDiscards?: boolean,
  randomPerks?: boolean,
  noBonusCards?: boolean,
  initialBonusCards?: BonusCard[],
  slotCategories?: SlotKind[],
  randomGridFill?: number
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
        superchargedDeckCards,
        randomPerks ?? false,
        noBonusCards ?? false,
        initialBonusCards ?? [],
        slotCategories,
        randomGridFill ?? 0
      )
  );

  const dispatch = useCallback((a: Action) => rawDispatch(a), [rawDispatch]);

  return { state, dispatch };
};
