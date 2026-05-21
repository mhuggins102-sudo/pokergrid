export type Difficulty = 'easy' | 'medium' | 'hard';

export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 200,
  medium: 300,
  hard: 400,
};

export const MODIFIERS_PER_RUN = 3;
