// Daily Grid local storage. Phase 1 keeps everything on-device:
// device-id (the anonymous identity), optional player handle, and a
// map of completed-daily records. Phase 2 layers Supabase submission
// on top — the local store remains the source of truth for "did this
// device play this date?" and for re-rendering past results offline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../../game/state';
import type { DailyRecipe } from '../../game/daily/recipe';

const KEY_DEVICE_ID = 'pokergrid:daily:deviceId';
const KEY_HANDLE = 'pokergrid:daily:handle';
const KEY_PLAYS = 'pokergrid:daily:plays:v1';

// Lightweight hex string (32 chars / 128 bits). Not a true RFC 4122
// uuid — we don't need cross-system uniqueness guarantees, just
// per-device. crypto.getRandomValues on web + RN's React Native crypto
// polyfill cover most platforms; we fall back to Math.random when
// neither is present so the bootstrap can't throw.
const randomHex128 = (): string => {
  const bytes = new Uint8Array(16);
  const g: { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } } =
    globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
};

// Read-through bootstrap. First call writes a new device-id; later
// calls return the persisted value. Stable across app launches as long
// as the user doesn't clear app data.
export const getOrCreateDeviceId = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(KEY_DEVICE_ID);
  if (existing) return existing;
  const id = randomHex128();
  await AsyncStorage.setItem(KEY_DEVICE_ID, id);
  return id;
};

export const getHandle = async (): Promise<string | null> => {
  return AsyncStorage.getItem(KEY_HANDLE);
};

export const setHandle = async (handle: string | null): Promise<void> => {
  if (handle === null || handle === '') {
    await AsyncStorage.removeItem(KEY_HANDLE);
    return;
  }
  await AsyncStorage.setItem(KEY_HANDLE, handle);
};

// A single completed daily run. The full game state is stashed so the
// result screen can be re-rendered when the player revisits — without
// it we'd need a separate read-only daily-result screen. Storage cost
// is small (one record per date, max one per day).
export interface DailyPlay {
  dateISO: string;
  score: number;
  won: boolean;
  recipe: DailyRecipe;
  completedAt: number; // Date.now() at game-over
  // Serialized GameState — JSON-stringified at write time, parsed at
  // read time. Typed as `unknown` to avoid forcing every consumer to
  // re-validate; result-screen rendering treats it as a GameState
  // (the producer is the only one writing here, so the shape is
  // known-good).
  state: GameState;
}

export type DailyPlaysMap = Record<string, DailyPlay>;

export const getPlays = async (): Promise<DailyPlaysMap> => {
  const raw = await AsyncStorage.getItem(KEY_PLAYS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as DailyPlaysMap;
  } catch {
    // Corrupt save — start fresh. Phase 4 may add a recovery path.
  }
  return {};
};

export const savePlay = async (play: DailyPlay): Promise<DailyPlaysMap> => {
  const current = await getPlays();
  const next: DailyPlaysMap = { ...current, [play.dateISO]: play };
  await AsyncStorage.setItem(KEY_PLAYS, JSON.stringify(next));
  return next;
};

export const getPlay = async (dateISO: string): Promise<DailyPlay | null> => {
  const all = await getPlays();
  return all[dateISO] ?? null;
};
