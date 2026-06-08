// Daily Grid date + seed helpers.
//
// The "daily" identity is a UTC date string (YYYY-MM-DD). Locking on
// UTC keeps the leaderboard globally consistent: every player worldwide
// sees the same recipe + deck order on the same calendar day,
// regardless of their device timezone. The trade-off is that the
// "new daily drops" moment lands at different local times in different
// timezones — acceptable for a small game.

// Returns today's date in UTC as YYYY-MM-DD.
export const currentDateISO = (now: Date = new Date()): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Parse YYYY-MM-DD into a UTC Date (midnight). Returns null on invalid
// input so callers can guard against typos / corrupted save data.
export const parseDateISO = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (isNaN(date.getTime())) return null;
  return date;
};

// FNV-1a 32-bit hash. Used both to derive the deck seed and the
// recipe-roll channels. Stable across JS engines (32-bit unsigned
// arithmetic only).
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const fnv1a = (s: string): number => {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
};

// Seed for the Mulberry32 deck RNG. Salted so different daily channels
// (deck vs. initial-specials below vs. future hypothetical bonus-deck)
// can't accidentally share the same stream.
export const seedForDate = (dateISO: string): number => {
  return fnv1a(`pokergrid-deck::${dateISO}`);
};

// Separate seed for the Three Tricks initial-hand sample. Daily mode
// needs every player to start with the same 3 green cards; without
// its own seed we'd either reuse the deck stream (and the sample
// would steal random calls that newGame expects) or fall back to
// Math.random (and players would all see different starting hands).
export const seedForInitialSpecials = (dateISO: string): number => {
  return fnv1a(`pokergrid-initial-specials::${dateISO}`);
};
