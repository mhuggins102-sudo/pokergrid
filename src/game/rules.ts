export type Difficulty = 'easy' | 'medium' | 'hard';

export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 150,
  medium: 225,
  hard: 300,
};

export const MODIFIERS_PER_RUN = 3;
