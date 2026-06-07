// Daily Grid context — exposes the device's anonymous identity, the
// optional player handle, today's date + recipe, the map of completed
// daily plays, and a helper to record a fresh completion.
//
// Phase 2 wires this through to Supabase:
//   - recordCompletion writes locally, then tries the remote submit.
//     Network failure queues the submit in AsyncStorage; the queue
//     drains on app foreground via the AppState listener below.
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
import { AppState, AppStateStatus } from 'react-native';
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
  AlreadySubmittedError,
  BackendUnavailableError,
  HandleInvalidError,
  HandleTakenError,
  isBackendConfigured,
  setHandleRemote,
  submitDailyPlay,
} from './supabase';

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

  // Drain the offline-submit queue. Called once after the bootstrap
  // finishes, and again on every app-foreground event. Best-effort:
  // entries that still fail are left in the queue for the next drain.
  const drainQueue = useCallback(async () => {
    if (!isBackendConfigured()) return;
    setDraining(true);
    try {
      const pending = await getPendingSubmits();
      let anySubmitted = false;
      for (const p of pending) {
        try {
          await submitDailyPlay({
            deviceId: p.deviceId,
            dateISO: p.dateISO,
            score: p.score,
            won: p.won,
            recipe: p.recipe as DailyRecipe,
            usedUndo: p.usedUndo,
          });
          await removePendingSubmit(p.deviceId, p.dateISO);
          setLastSubmitError(prev =>
            prev?.dateISO === p.dateISO ? null : prev
          );
          anySubmitted = true;
        } catch (e) {
          if (e instanceof AlreadySubmittedError) {
            // The server already has this play. Most likely cause:
            // first submission landed before the response made it
            // back to the client; the local write happened and the
            // queue retry collides. Drop the queue entry.
            await removePendingSubmit(p.deviceId, p.dateISO);
            setLastSubmitError(prev =>
              prev?.dateISO === p.dateISO ? null : prev
            );
            anySubmitted = true;
            continue;
          }
          if (e instanceof BackendUnavailableError) {
            // Misconfiguration; nothing to drain.
            break;
          }
          // Likely a transient network failure. Leave entry; next
          // drain will retry.
        }
      }
      if (anySubmitted) bumpSubmitToken();
    } finally {
      setDraining(false);
    }
  }, [bumpSubmitToken]);

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

      const args = submitArgsFor(deviceId, play);
      const submitStart = Date.now();
      console.log('[daily] calling submitDailyPlay');
      try {
        await submitDailyPlay({
          deviceId,
          dateISO: play.dateISO,
          score: play.score,
          won: play.won,
          recipe: play.recipe,
          usedUndo: play.state.undoCount > 0,
        });
        console.log('[daily] submitDailyPlay succeeded', {
          elapsedMs: Date.now() - submitStart,
        });
        // Server now has the row. Bump the token so useDailyRank
        // refires its fetch — without this nudge the panel stays
        // stuck on the rank-pending read that fired the moment
        // setPlays(next) updated the local map. Also clear any
        // prior submit error for this date.
        setLastSubmitError(prev =>
          prev?.dateISO === play.dateISO ? null : prev
        );
        bumpSubmitToken();
      } catch (e) {
        if (e instanceof AlreadySubmittedError) {
          console.log('[daily] submitDailyPlay: AlreadySubmittedError — server has it', {
            elapsedMs: Date.now() - submitStart,
          });
          // Server already has this play — treat as success and
          // bump so the panel refreshes against the existing row.
          setLastSubmitError(prev =>
            prev?.dateISO === play.dateISO ? null : prev
          );
          bumpSubmitToken();
          return next;
        }
        // Anything else: queue for later drain. The local write above
        // already happened, so the player keeps their score record
        // regardless of the network outcome. Capture a compact error
        // detail (code + message + hint, joined) so RankPanel can
        // surface it instead of dangling on "Submitting…", and also
        // log the raw error for DevTools.
        const err = e as { code?: string; message?: string; hint?: string; details?: string };
        const detail = [
          err.code ? `[${err.code}]` : null,
          err.message ?? String(e),
          err.hint,
          err.details,
        ].filter((p): p is string => !!p).join(' · ');
        setLastSubmitError({ dateISO: play.dateISO, detail });
        console.error('[daily] submitDailyPlay failed; queued for retry', {
          elapsedMs: Date.now() - submitStart,
          error: e,
          formatted: detail,
        });
        await enqueuePendingSubmit(args);
      }
      return next;
    },
    [deviceId, bumpSubmitToken]
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
