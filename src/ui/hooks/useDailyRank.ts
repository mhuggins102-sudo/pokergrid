// useDailyRank — fetches rank + score histogram for a (dateISO, deviceId)
// pair from Supabase. Loading / error / success state surfaced to the
// caller so RankPanel can render skeletons / fallback copy.
//
// The hook re-fetches on:
//   - mount (after deviceId is known)
//   - deviceId or dateISO change
//   - any change to the daily plays map (so a fresh submission triggers
//     a re-fetch — once the local write fires, the remote leaderboard
//     should reflect it on the next call)

import { useCallback, useEffect, useState } from 'react';
import { useDaily } from '../daily/DailyProvider';
import {
  fetchHistogram,
  fetchRank,
  HistogramSnapshot,
  isBackendConfigured,
  RankSnapshot,
} from '../daily/supabase';

export type RankStatus =
  | 'pending'             // bootstrap in flight or fetch not yet started
  | 'loading'             // fetching in progress
  | 'ready'               // rank + histogram available
  | 'rank-pending'        // backend reachable but no row for this player
                          // yet (e.g. submission still in the offline
                          // queue, or the submit RPC hasn't landed)
  | 'backend-unavailable' // .env not set; we're running local-only
  | 'error';              // network / RPC failure

export interface DailyRankState {
  status: RankStatus;
  rank: RankSnapshot | null;
  histogram: HistogramSnapshot | null;
  refresh: () => void;
}

export const useDailyRank = (dateISO: string | null): DailyRankState => {
  const { deviceId, plays, submitToken } = useDaily();
  const [status, setStatus] = useState<RankStatus>('pending');
  const [rank, setRank] = useState<RankSnapshot | null>(null);
  const [histogram, setHistogram] = useState<HistogramSnapshot | null>(null);
  const [bumpToken, setBumpToken] = useState(0);

  const refresh = useCallback(() => setBumpToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isBackendConfigured()) {
        setStatus('backend-unavailable');
        return;
      }
      if (!deviceId || !dateISO) {
        setStatus('pending');
        return;
      }
      setStatus('loading');
      try {
        const [r, h] = await Promise.all([
          fetchRank(deviceId, dateISO),
          fetchHistogram(dateISO),
        ]);
        if (cancelled) return;
        setRank(r);
        setHistogram(h);
        setStatus(r === null ? 'rank-pending' : 'ready');
      } catch {
        if (cancelled) return;
        setRank(null);
        setHistogram(null);
        setStatus('error');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // `plays` triggers an initial fetch as soon as the local map
    // updates (gives a fast "rank-pending" → loading transition);
    // `submitToken` triggers the second fetch once the server submit
    // actually completes so the panel resolves to the real row.
  }, [deviceId, dateISO, plays, bumpToken, submitToken]);

  return { status, rank, histogram, refresh };
};
