import {
  currentDateISO,
  fnv1a,
  parseDateISO,
  seedForDate,
} from '../src/game/daily/seed';

describe('daily seed', () => {
  describe('currentDateISO', () => {
    it('formats UTC date as YYYY-MM-DD', () => {
      const d = new Date(Date.UTC(2026, 5, 7, 23, 59, 59));
      expect(currentDateISO(d)).toBe('2026-06-07');
    });

    it('zero-pads single-digit month and day', () => {
      const d = new Date(Date.UTC(2026, 0, 3));
      expect(currentDateISO(d)).toBe('2026-01-03');
    });

    it('uses UTC regardless of local timezone (sanity)', () => {
      // 2026-01-01 00:30 UTC is still 2026-01-01 in UTC even when local
      // timezone would place it in the previous day.
      const d = new Date(Date.UTC(2026, 0, 1, 0, 30));
      expect(currentDateISO(d)).toBe('2026-01-01');
    });
  });

  describe('parseDateISO', () => {
    it('parses valid YYYY-MM-DD', () => {
      const d = parseDateISO('2026-06-05');
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
      expect(d!.getUTCMonth()).toBe(5);
      expect(d!.getUTCDate()).toBe(5);
    });

    it('rejects malformed input', () => {
      expect(parseDateISO('2026-6-5')).toBeNull();
      expect(parseDateISO('06-05-2026')).toBeNull();
      expect(parseDateISO('not-a-date')).toBeNull();
      expect(parseDateISO('')).toBeNull();
    });
  });

  describe('fnv1a', () => {
    it('is deterministic for the same input', () => {
      expect(fnv1a('hello')).toBe(fnv1a('hello'));
    });

    it('returns unsigned 32-bit integers', () => {
      const h = fnv1a('pokergrid');
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    });

    it('produces different hashes for similar inputs', () => {
      expect(fnv1a('2026-06-05')).not.toBe(fnv1a('2026-06-06'));
      expect(fnv1a('2026-06-05')).not.toBe(fnv1a('2026-06-04'));
    });
  });

  describe('seedForDate', () => {
    it('is deterministic', () => {
      expect(seedForDate('2026-06-05')).toBe(seedForDate('2026-06-05'));
    });

    it('produces no collisions over a year of consecutive dates', () => {
      const seeds = new Set<number>();
      const start = new Date(Date.UTC(2026, 0, 1));
      for (let i = 0; i < 365; i++) {
        const d = new Date(start.getTime() + i * 86400_000);
        seeds.add(seedForDate(currentDateISO(d)));
      }
      expect(seeds.size).toBe(365);
    });
  });
});
