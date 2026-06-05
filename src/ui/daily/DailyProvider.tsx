// Daily Grid context — exposes the device's anonymous identity, the
// optional player handle, today's date + recipe, the map of completed
// daily plays, and a helper to record a fresh completion.
//
// Phase 1: everything is on-device. Phase 2 will layer Supabase
// submission on top of `recordCompletion` so the local write and the
// network submit happen as one step.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { currentDateISO } from '../../game/daily/seed';
import { recipeFor, DailyRecipe } from '../../game/daily/recipe';
import {
  DailyPlay,
  DailyPlaysMap,
  getHandle,
  getOrCreateDeviceId,
  getPlays,
  savePlay,
  setHandle as persistHandle,
} from './localStore';

interface DailyContextValue {
  // Anonymous device-id. `null` while the lazy bootstrap is in flight
  // on first launch.
  deviceId: string | null;
  // Optional player handle. `null` means "use default Anon-xxxx".
  handle: string | null;
  setHandle: (h: string | null) => Promise<void>;
  // UTC YYYY-MM-DD, computed once on mount. Locked at mount so a
  // session crossing midnight UTC keeps the same "today" until the app
  // is relaunched — matches the rule that a daily-grid run started
  // before midnight submits under its start date.
  todayISO: string;
  todayRecipe: DailyRecipe;
  // Local completed plays, keyed by dateISO. `null` while loading; an
  // empty object means "loaded, no plays yet".
  plays: DailyPlaysMap | null;
  // Records a completed daily locally. Returns the new plays map.
  // Phase 2 will also POST to Supabase here.
  recordCompletion: (play: DailyPlay) => Promise<DailyPlaysMap>;
}

const DailyContext = createContext<DailyContextValue | null>(null);

export const DailyProvider = ({ children }: { children: React.ReactNode }) => {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [handle, setHandleState] = useState<string | null>(null);
  const [plays, setPlays] = useState<DailyPlaysMap | null>(null);

  // todayISO is locked at first mount so a single session has a stable
  // notion of "today" even if it crosses UTC midnight mid-run.
  const todayISO = useMemo(() => currentDateISO(), []);
  const todayRecipe = useMemo(() => recipeFor(todayISO), [todayISO]);

  // Lazy bootstrap on mount: read or create the device-id, read the
  // optional handle, read the existing plays map. All three run in
  // parallel — none depend on the others. The provider's children
  // render immediately with null values; consumers should guard
  // against the null state where it matters (LandingScreen does so to
  // avoid flashing a "play daily" CTA before we know the play
  // already-completed state).
  useEffect(() => {
    let cancelled = false;
    Promise.all([getOrCreateDeviceId(), getHandle(), getPlays()]).then(
      ([id, h, p]) => {
        if (cancelled) return;
        setDeviceId(id);
        setHandleState(h);
        setPlays(p);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setHandle = useCallback(async (h: string | null) => {
    await persistHandle(h);
    setHandleState(h);
  }, []);

  const recordCompletion = useCallback(
    async (play: DailyPlay): Promise<DailyPlaysMap> => {
      const next = await savePlay(play);
      setPlays(next);
      return next;
    },
    []
  );

  const value = useMemo<DailyContextValue>(
    () => ({
      deviceId,
      handle,
      setHandle,
      todayISO,
      todayRecipe,
      plays,
      recordCompletion,
    }),
    [deviceId, handle, setHandle, todayISO, todayRecipe, plays, recordCompletion]
  );

  return <DailyContext.Provider value={value}>{children}</DailyContext.Provider>;
};

export const useDaily = (): DailyContextValue => {
  const ctx = useContext(DailyContext);
  if (!ctx) throw new Error('useDaily must be used inside DailyProvider');
  return ctx;
};

// Convenience: derive the default display name from the device-id when
// the player hasn't set a custom handle. Returns the handle as-is if
// set, otherwise "Anon-XXXX" using the first 4 hex chars of the
// device-id. Returns "Anon-…" placeholder until the bootstrap
// completes.
export const displayNameFor = (
  deviceId: string | null,
  handle: string | null
): string => {
  if (handle) return handle;
  if (!deviceId) return 'Anon-…';
  return `Anon-${deviceId.slice(0, 4)}`;
};
