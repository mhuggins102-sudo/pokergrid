// Pending-submit queue drain, extracted from DailyProvider so the
// retry semantics are unit-testable without rendering the provider.
// The queue (localStore.ts) is the durable source of truth for "plays
// the server might not have yet": recordCompletion enqueues BEFORE the
// first network attempt and entries are only removed once the server
// confirms (success or AlreadySubmittedError). That ordering is what
// makes a mid-submit tab close recoverable — the entry is already on
// disk for the next drain.

import type { PendingSubmit } from './localStore';
import {
  AlreadySubmittedError,
  BackendUnavailableError,
} from './supabase';

export interface DrainDeps {
  getPendingSubmits: () => Promise<PendingSubmit[]>;
  removePendingSubmit: (deviceId: string, dateISO: string) => Promise<void>;
  submit: (p: PendingSubmit) => Promise<void>;
}

export interface DrainResult {
  // True when at least one entry reached the server (fresh submit or
  // confirmed already-there). Callers bump submitToken on this so
  // useDailyRank refetches against the now-existing row.
  anySubmitted: boolean;
  // Most recent transient failure, for the RankPanel error block.
  // null when every entry drained (or the queue was empty).
  lastError: { dateISO: string; error: unknown } | null;
}

// One pass over the queue. Best-effort: transient failures leave the
// entry in place for the next drain; AlreadySubmittedError means the
// server has the play (a previous submit landed but the response was
// lost), so the entry is dropped and counted as submitted.
export const drainPendingSubmitsOnce = async (
  deps: DrainDeps
): Promise<DrainResult> => {
  const pending = await deps.getPendingSubmits();
  let anySubmitted = false;
  let lastError: DrainResult['lastError'] = null;
  for (const p of pending) {
    try {
      await deps.submit(p);
      await deps.removePendingSubmit(p.deviceId, p.dateISO);
      anySubmitted = true;
    } catch (e) {
      if (e instanceof AlreadySubmittedError) {
        await deps.removePendingSubmit(p.deviceId, p.dateISO);
        anySubmitted = true;
        continue;
      }
      if (e instanceof BackendUnavailableError) {
        // Misconfiguration; nothing further to drain.
        break;
      }
      lastError = { dateISO: p.dateISO, error: e };
    }
  }
  return { anySubmitted, lastError };
};
