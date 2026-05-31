export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

// Four lookup tables, one per "axis" of the difficulty curve. Each is
// the single source of truth for that aspect — the engine, the home-
// screen difficulty info popup, and the rules / tutorial screens all
// read from these.

export const TARGET_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 400,
  medium: 450,
  hard: 500,
  // Extreme matches Medium's 450 target on the number, but strips every
  // assist — no jokers, no discards, no deck peek, no undo — so it's the
  // toughest mode despite sharing Medium's headline number.
  extreme: 450,
};

// How many jokers ship in the playing deck. 0 (Extreme) means the deck
// is a pure 52-card deck; 2 (Easy) gives two wild slots, doubling the
// chance of a joker landing on the grid.
export const JOKERS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 2,
  medium: 1,
  hard: 1,
  extreme: 0,
};

// Free Play undo cap per difficulty. Targets-Up and Challenges set their
// own caps via App.tsx; this only applies to Free Play runs.
export const UNDOS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 1,
  hard: 0,
  extreme: 0,
};

// How many bonus cards the player starts the run holding. Easy / Medium
// open with a freebie so the player has something to plan around from
// the very first draw; Hard / Extreme start empty.
export const STARTER_BONUS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1,
  medium: 1,
  hard: 0,
  extreme: 0,
};

// When true, the player can decline a ♣ Bonus draw even at the bonus-
// hand cap (skip the forced swap). When false, hitting ♣ at cap forces
// the player to swap one of their held cards out.
export const BONUS_DECLINE_AT_CAP_BY_DIFFICULTY: Record<Difficulty, boolean> = {
  easy: true,
  medium: false,
  hard: false,
  extreme: false,
};

// When true, the Discard button is hidden and DISCARD_NONE is rejected
// by the reducer — every drawn card must be placed or spent on a perk.
export const NO_DISCARDS_BY_DIFFICULTY: Record<Difficulty, boolean> = {
  easy: false,
  medium: false,
  hard: false,
  extreme: true,
};

// Easy + Medium can peek the remaining-deck composition mid-run
// (RemainingDeckModal). Hard and Extreme run blind.
export const CAN_PREVIEW_DECK_BY_DIFFICULTY: Record<Difficulty, boolean> = {
  easy: true,
  medium: true,
  hard: false,
  extreme: false,
};
