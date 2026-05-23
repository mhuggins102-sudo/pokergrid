export type Difficulty = 'easy' | 'medium' | 'hard';

export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 300,
  medium: 400,
  hard: 500,
};
