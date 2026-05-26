import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {
  BONUS_DECK_POOL,
  BonusCard,
  powerUpBonusCard,
} from '../game/bonusCards';

// Targets-Up resume save. Mirrors the React-context pattern used by Settings
// and Stats. Captures the level / wins counters plus the powered-up bonus
// card the player kept across the previous level and the powered extras
// shuffled back into the deck, so closing the app between levels resumes
// the full carry-over state — not just the level number.

// Serialized form of a BonusCard. We can't JSON-serialize the lineEffect /
// gridEffect function references, so we persist just enough to look the
// card up in BONUS_DECK_POOL and re-apply N power-ups on load.
interface SerializedBonusCard {
  baseId: string;
  powerLevel: number;
}

export interface TUSave {
  level: number;
  wins: number;
  ts: number;
  keptCard?: SerializedBonusCard | null;
  deckExtras?: SerializedBonusCard[];
}

const STORAGE_KEY = 'pokergrid:tu-save:v1';

const serializeBonusCard = (c: BonusCard): SerializedBonusCard => ({
  baseId: c.id.replace(/-pwr\d+$/, ''),
  powerLevel: c.powerLevel ?? 0,
});

const deserializeBonusCard = (s: SerializedBonusCard): BonusCard | null => {
  const base = BONUS_DECK_POOL.find(c => c.id === s.baseId);
  if (!base) return null;
  let card = base;
  for (let i = 0; i < s.powerLevel; i++) {
    card = powerUpBonusCard(card);
  }
  return card;
};

export const loadTUSave = async (): Promise<TUSave | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TUSave>;
    if (typeof parsed.level !== 'number' || typeof parsed.wins !== 'number') {
      return null;
    }
    return {
      level: parsed.level,
      wins: parsed.wins,
      ts: parsed.ts ?? Date.now(),
      keptCard: parsed.keptCard ?? null,
      deckExtras: parsed.deckExtras ?? [],
    };
  } catch {
    return null;
  }
};

export const writeTUSave = async (s: TUSave): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const deleteTUSave = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

// Reconstruct the actual BonusCard objects from a save (looking up the
// base in BONUS_DECK_POOL and re-applying any power-ups). Used by App when
// resuming via "Continue Targets Up".
export const hydrateSavedCards = (
  s: TUSave | null
): { keptCard: BonusCard | undefined; deckExtras: BonusCard[] } => {
  if (!s) return { keptCard: undefined, deckExtras: [] };
  const keptCard = s.keptCard
    ? deserializeBonusCard(s.keptCard) ?? undefined
    : undefined;
  const deckExtras = (s.deckExtras ?? [])
    .map(deserializeBonusCard)
    .filter((c): c is BonusCard => c !== null);
  return { keptCard, deckExtras };
};

interface TUSaveContextValue {
  save: TUSave | null;
  saveProgress: (
    level: number,
    wins: number,
    keptCard?: BonusCard,
    deckExtras?: BonusCard[]
  ) => void;
  clearProgress: () => void;
}

const TUSaveContext = React.createContext<TUSaveContextValue>({
  save: null,
  saveProgress: () => {},
  clearProgress: () => {},
});

export const TUSaveProvider = ({ children }: { children: React.ReactNode }) => {
  const [save, setSave] = React.useState<TUSave | null>(null);

  React.useEffect(() => {
    loadTUSave().then(setSave);
  }, []);

  const saveProgress = React.useCallback(
    (
      level: number,
      wins: number,
      keptCard?: BonusCard,
      deckExtras?: BonusCard[]
    ) => {
      const s: TUSave = {
        level,
        wins,
        ts: Date.now(),
        keptCard: keptCard ? serializeBonusCard(keptCard) : null,
        deckExtras: (deckExtras ?? []).map(serializeBonusCard),
      };
      setSave(s);
      writeTUSave(s);
    },
    []
  );

  const clearProgress = React.useCallback(() => {
    setSave(null);
    deleteTUSave();
  }, []);

  const value = React.useMemo(
    () => ({ save, saveProgress, clearProgress }),
    [save, saveProgress, clearProgress]
  );
  return React.createElement(TUSaveContext.Provider, { value }, children);
};

export const useTUSave = () => React.useContext(TUSaveContext);
