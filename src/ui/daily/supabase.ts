// Supabase client + RPC wrappers for Daily Grid.
//
// Setup (one-time, per environment):
//   1. Create a Supabase project at https://supabase.com
//   2. Apply the SQL migration from supabase/migrations/ via the CLI
//      (`supabase db push`) or by pasting the SQL into the dashboard's
//      SQL editor.
//   3. Copy `.env.example` to `.env` at the repo root and fill in
//      EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from
//      the project's API settings.
//
// When the env vars are missing the client returns null and every RPC
// helper throws `BackendUnavailableError`. The DailyProvider catches
// that and falls back to the offline / local-only path so the app
// stays usable without a backend.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DailyRecipe } from '../../game/daily/recipe';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // We don't use Supabase Auth — identity is the anonymous
      // device-id we pass as an RPC parameter. Turning persistence
      // off avoids the supabase-auth-js layer hitting AsyncStorage
      // on every cold start.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const isBackendConfigured = (): boolean => client !== null;

export class BackendUnavailableError extends Error {
  constructor() {
    super('Daily Grid backend is not configured');
    this.name = 'BackendUnavailableError';
  }
}

const requireClient = (): SupabaseClient => {
  if (!client) throw new BackendUnavailableError();
  return client;
};

// ---------------- RPC payload shapes ----------------

export interface SubmitPlayArgs {
  deviceId: string;
  dateISO: string;
  score: number;
  won: boolean;
  recipe: DailyRecipe;
  usedUndo: boolean;
}

export interface RankSnapshot {
  rank: number;       // 1-based
  total: number;      // total submissions for the date
  score: number;      // the player's score
  topPercent: number; // 1..100, smaller is better
}

export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}

export interface HistogramSnapshot {
  bins: HistogramBin[];
  median: number | null;
  min: number | null;
  max: number | null;
  total: number;
}

export interface PlayerRow {
  deviceId: string;
  handle: string | null;
  createdAt: string;
}

// ---------------- RPC wrappers ----------------

export const submitDailyPlay = async (args: SubmitPlayArgs): Promise<void> => {
  const c = requireClient();
  const { error } = await c.rpc('submit_daily_play', {
    p_device_id: args.deviceId,
    p_date: args.dateISO,
    p_score: args.score,
    p_won: args.won,
    p_recipe: args.recipe,
    p_used_undo: args.usedUndo,
  });
  if (error) {
    // Postgres unique_violation = 23505. The (device_id, date) unique
    // constraint enforces one-play-per-date; if the client retried a
    // submission that already landed, surface that as a soft signal
    // the caller can treat as "already submitted, move on" rather
    // than a real error.
    if (error.code === '23505') {
      throw new AlreadySubmittedError();
    }
    throw error;
  }
};

export class AlreadySubmittedError extends Error {
  constructor() {
    super('Daily already submitted for this device + date');
    this.name = 'AlreadySubmittedError';
  }
}

export const fetchRank = async (
  deviceId: string,
  dateISO: string
): Promise<RankSnapshot | null> => {
  const c = requireClient();
  const { data, error } = await c.rpc('daily_rank', {
    p_device_id: deviceId,
    p_date: dateISO,
  });
  if (error) throw error;
  // RPC returns an array; empty means "no play submitted for this
  // (device, date)" — caller treats that as "rank pending".
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  return {
    rank: row.rank,
    total: row.total,
    score: row.score,
    topPercent: row.top_percent,
  };
};

export const fetchHistogram = async (
  dateISO: string,
  bins: number = 15
): Promise<HistogramSnapshot> => {
  const c = requireClient();
  const { data, error } = await c.rpc('daily_histogram', {
    p_date: dateISO,
    p_bins: bins,
  });
  if (error) throw error;
  // RPC returns jsonb directly — supabase-js parses it for us.
  const h = (data ?? {}) as Partial<HistogramSnapshot>;
  return {
    bins: h.bins ?? [],
    median: h.median ?? null,
    min: h.min ?? null,
    max: h.max ?? null,
    total: h.total ?? 0,
  };
};

export const setHandleRemote = async (
  deviceId: string,
  handle: string | null
): Promise<void> => {
  const c = requireClient();
  const { error } = await c.rpc('set_player_handle', {
    p_device_id: deviceId,
    p_handle: handle ?? '',
  });
  if (error) {
    // Unique-violation surfaces as "handle taken" to the UI.
    if (error.code === '23505') throw new HandleTakenError();
    // Custom 22023 codes are the validation errors raised by the RPC.
    if (error.code === '22023') throw new HandleInvalidError(error.message);
    throw error;
  }
};

export class HandleTakenError extends Error {
  constructor() {
    super('Handle is already taken');
    this.name = 'HandleTakenError';
  }
}

export class HandleInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandleInvalidError';
  }
}

export const getPlayer = async (deviceId: string): Promise<PlayerRow | null> => {
  const c = requireClient();
  const { data, error } = await c.rpc('get_player', { p_device_id: deviceId });
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  return {
    deviceId: row.device_id,
    handle: row.handle ?? null,
    createdAt: row.created_at,
  };
};
