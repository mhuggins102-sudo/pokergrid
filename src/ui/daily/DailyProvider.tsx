// Daily Grid context — exposes the device's anonymous identity, the
// optional player handle, today's date + recipe, the map of completed
// daily plays, and a helper to record a fresh completion.
//
// Phase 2 wires this through to Supabase:
//   - recordCompletion writes locally, enqueues the submit in
//     AsyncStorage, then kicks a queue drain. Queue-first ordering
//     makes the submit durable: the entry is only removed once the
//     server confirms, so a tab/app close mid-submit just leaves it
//     for the next drain (bootstrap, app foreground, browser online,
//     or manual retry).
//   - setHandle pushes to the server first (so uniqueness validation
//     happens there) and only updates local on success.
//   - The whole thing degrades gracefully when env vars aren't set —
//     isBackendConfigured() returns false and we skip all network
//     calls, leaving the offline behavior identical to Phase 1.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { currentDateISO } from '../../game/daily/seed';
import { recipeFor, DailyRecipe } from '../../game/daily/recipe';
import {
  DailyPlay,
  DailyPlaysMap,
  PendingSubmit,
  enqueuePendingSubmit,
  getHandle,
  getOrCreateDeviceId,
  getPendingSubmits,
  getPlays,
  removePendingSubmit,
  savePlay,
  setHandle as persistHandle,
} from './localStore';
import {
  HandleInvalidError,
  HandleTakenError,
  isBackendConfigured,
  setHandleRemote,
  submitDailyPlay,
} from './supabase';
import { drainPendingSubmitsOnce } from './submitQueue';

interface DailyContextValue {
  deviceId: string | null;
  handle: string | null;
  // Returns one of:
  //   - 'ok'                 — handle persisted locally + remotely
  //   - 'taken'              — another player already claimed it
  //   - 'invalid'            — failed server-side validation
  //   - 'backend-unavailable' — local-only path; handle saved on-device
  //                            but no remote sync. The UI surfaces this
  //                            as a hint that uniqueness isn't checked.
  setHandle: (
    h: string | null
  ) => Promise<'ok' | 'taken' | 'invalid' | 'backend-unavailable'>;
  // UTC YYYY-MM-DD, locked at first mount.
  todayISO: string;
  todayRecipe: DailyRecipe;
  plays: DailyPlaysMap | null;
  recordCompletion: (play: DailyPlay) => Promise<DailyPlaysMap>;
  // True while the offline-submit queue is draining (post-foreground).
  // Mostly diagnostic — the UI doesn't need to surface it but the
  // RankPanel can use it to show a "re-syncing…" hint if it wants.
  drainingPendingSubmits: boolean;
  // Monotonically increments after every successful server submit
  // (live recordCompletion or queue drain). useDailyRank watches it
  // so the panel re-fetches once the server actually has the row —
  // the local plays update fires the first fetch before submitDailyPlay
  // completes, which would otherwise leave the panel stuck on the
  // initial "rank-pending" read.
  submitToken: number;
  // Last submit error captured per dateISO. RankPanel surfaces it in
  // the rank slot so a stuck "Submitting your score…" state turns into
  // a real error message instead of a misleading "still in flight".
  // null when no error is pending for the given date.
  lastSubmitError: { dateISO: string; detail: string } | null;
  // Force a drain of the offline submit queue. Wired into the rank
  // panel's manual retry — when the AppState 'active' transition
  // doesn't fire (e.g. PWA tab stays focused the whole time) the
  // queue otherwise sits indefinitely. Resolves when the drain
  // attempt finishes regardless of outcome.
  drainQueue: () => Promise<void>;
}

const DailyContext = createContext<DailyContextValue | null>(null);

// Local play → remote submit-args. Centralized so the recordCompletion
// path and the queue-drain path build the same payload shape.
const submitArgsFor = (
  deviceId: string,
  play: DailyPlay
): PendingSubmit => ({
  deviceId,
  dateISO: play.dateISO,
  score: play.score,
  won: play.won,
  recipe: play.recipe,
  usedUndo: play.state.undoCount > 0,
  enqueuedAt: Date.now(),
});

// Format any submit failure into a single display string for the rank
// panel. The leading [bracketed token] is what the player asked to
// see on mobile: prefer the PG error code when supabase-js gives us
// one, otherwise fall back to the error class name (SubmitTimeoutError
// etc.) so a non-coded failure still surfaces SOMETHING readable
// instead of just a free-form message.
const formatSubmitError = (e: unknown): string => {
  const err = e as {
    code?: string;
    message?: string;
    hint?: string;
    details?: string;
  };
  const errName = (e as Error | null | undefined)?.name;
  const codeToken =
    err.code ??
    (errName && errName !== 'Error' ? errName : 'UNKNOWN');
  return [
    `[${codeToken}]`,
    err.message ?? String(e),
    err.hint,
    err.details,
  ]
    .filter((p): p is string => !!p)
    .join(' · ');
};

export const DailyProvider = ({ children }: { children: React.ReactNode }) => {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [handle, setHandleState] = useState<string | null>(null);
  const [plays, setPlays] = useState<DailyPlaysMap | null>(null);
  const [drainingPendingSubmits, setDraining] = useState(false);
  const [submitToken, setSubmitToken] = useState(0);
  const bumpSubmitToken = useCallback(() => setSubmitToken(t => t + 1), []);
  const [lastSubmitError, setLastSubmitError] = useState<
    { dateISO: string; detail: string } | null
  >(null);

  const todayISO = useMemo(() => currentDateISO(), []);
  const todayRecipe = useMemo(() => recipeFor(todayISO), [todayISO]);

  // Bootstrap on mount.
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

  // Drain the offline-submit queue. Called after bootstrap, on every
  // app-foreground / browser-online event, after recordCompletion
  // enqueues, and from the rank panel's manual retry. Best-effort:
  // entries that still fail are left in the queue for the next drain,
  // but the most recent failure is surfaced via lastSubmitError so
  // the user can see WHY the retry didn't go through instead of
  // staring at a hung spinner.
  const drainOnce = useCallback(async () => {
    const { anySubmitted, lastError } = await drainPendingSubmitsOnce({
      getPendingSubmits,
      removePendingSubmit,
      submit: p =>
        submitDailyPlay({
          deviceId: p.deviceId,
          dateISO: p.dateISO,
          score: p.score,
          won: p.won,
          recipe: p.recipe as DailyRecipe,
          usedUndo: p.usedUndo,
        }),
    });
    if (lastError) {
      // Transient (network / timeout / unknown). The entry stays
      // queued for the next drain; capture the failure so the UI can
      // show what's happening.
      const detail = formatSubmitError(lastError.error);
      setLastSubmitError({ dateISO: lastError.dateISO, detail });
      console.error('[daily] drainQueue retry failed', {
        dateISO: lastError.dateISO,
        error: lastError.error,
        formatted: detail,
      });
    }
    // Intentionally NOT clearing lastSubmitError on success — the
    // rank-ready state takes priority in the panel, so the player
    // sees the rank as soon as the refetch resolves; the underlying
    // error stays in state for diagnostic review.
    if (anySubmitted) bumpSubmitToken();
  }, [bumpSubmitToken]);

  // Re-entrance guard. The bootstrap drain, the AppState listener,
  // the browser-online listener, the post-completion drain and manual
  // retry taps can all fire while a drain is already in flight;
  // overlapping drains race the queue's read-modify-write storage
  // cycle (entries can be lost) and double-submit. Concurrent callers
  // share the in-flight promise; the rerun flag coalesces them into
  // one extra pass so an entry enqueued mid-drain isn't missed.
  // Ref-based (not state) so the guard can't go stale across renders.
  const drainRef = useRef<{ running: Promise<void> | null; rerun: boolean }>({
    running: null,
    rerun: false,
  });
  const drainQueue = useCallback((): Promise<void> => {
    if (!isBackendConfigured()) return Promise.resolve();
    const d = drainRef.current;
    if (d.running) {
      d.rerun = true;
      return d.running;
    }
    d.running = (async () => {
      setDraining(true);
      try {
        do {
          d.rerun = false;
          await drainOnce();
        } while (d.rerun);
      } finally {
        setDraining(false);
        d.running = null;
      }
    })();
    return d.running;
  }, [drainOnce]);

  // First drain runs after the deviceId bootstrap finishes (so the
  // queue isn't drained before we have a device-id to compare against).
  // Wrapped in a ref so the effect doesn't re-fire on every render.
  const initialDrainDone = useRef(false);
  useEffect(() => {
    if (!deviceId || initialDrainDone.current) return;
    initialDrainDone.current = true;
    drainQueue();
  }, [deviceId, drainQueue]);

  // Foreground listener. Each transition into 'active' triggers a
  // drain attempt — covers the "submission failed → app backgrounded
  // → user comes back later with connectivity" case.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') drainQueue();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [drainQueue]);

  // Browser connectivity listener. On web, AppState 'active' maps to
  // visibilitychange — a PWA tab that stays focused while the network
  // drops and returns never fires it, so queued submits would sit
  // until a manual retry. The 'online' event covers that gap.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onOnline = () => {
      void drainQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drainQueue]);

  const setHandle = useCallback(
    async (
      h: string | null
    ): Promise<'ok' | 'taken' | 'invalid' | 'backend-unavailable'> => {
      const trimmed = h && h.trim().length > 0 ? h.trim() : null;
      if (!isBackendConfigured()) {
        // No backend — accept the handle locally as the source of
        // truth. The UI surfaces this so the player knows uniqueness
        // isn't being checked.
        await persistHandle(trimmed);
        setHandleState(trimmed);
        return 'backend-unavailable';
      }
      if (!deviceId) {
        // Bootstrap hasn't finished. Caller should retry; this is
        // exceedingly rare in practice (the editor doesn't render
        // until deviceId resolves) but it's not worth crashing on.
        return 'backend-unavailable';
      }
      try {
        await setHandleRemote(deviceId, trimmed);
        await persistHandle(trimmed);
        setHandleState(trimmed);
        return 'ok';
      } catch (e) {
        if (e instanceof HandleTakenError) return 'taken';
        if (e instanceof HandleInvalidError) return 'invalid';
        // Other errors (network, etc.) — fall through to "backend
        // unavailable" so the UI gets a sensible status.
        return 'backend-unavailable';
      }
    },
    [deviceId]
  );

  const recordCompletion = useCallback(
    async (play: DailyPlay): Promise<DailyPlaysMap> => {
      console.log('[daily] recordCompletion start', {
        dateISO: play.dateISO,
        score: play.score,
        won: play.won,
      });
      // Local-first write so the result screen has something to render
      // even if the network roundtrip is in flight.
      const next = await savePlay(play);
      setPlays(next);
      console.log('[daily] local savePlay done');

      if (!deviceId || !isBackendConfigured()) {
        console.log('[daily] backend not configured or no deviceId; skipping submit');
        return next;
      }

      // Queue-first: the pending entry hits disk BEFORE the first
      // network attempt, and the drain removes it only once the
      // server confirms. The old order (submit, enqueue on failure)
      // had an unrecoverable window — close the tab during the 20s
      // submit and the play was neither on the server nor queued, so
      // the rank panel's retry (which only drains the queue) could
      // never get the score onto the leaderboard.
      await enqueuePendingSubmit(submitArgsFor(deviceId, play));
      console.log('[daily] pending submit enqueued; draining');
      // Fire-and-forget so the result screen renders immediately; the
      // drain reports success via submitToken and failure via
      // lastSubmitError, both of which RankPanel already watches.
      void drainQueue();
      return next;
    },
    [deviceId, drainQueue]
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
      drainingPendingSubmits,
      submitToken,
      lastSubmitError,
      drainQueue,
    }),
    [
      deviceId,
      handle,
      setHandle,
      todayISO,
      todayRecipe,
      plays,
      recordCompletion,
      drainingPendingSubmits,
      submitToken,
      lastSubmitError,
      drainQueue,
    ]
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
