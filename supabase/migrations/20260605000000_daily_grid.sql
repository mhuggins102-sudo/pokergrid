-- Daily Grid backend — players + plays + RPCs.
--
-- Run this on a fresh Supabase project. The recommended path is the
-- Supabase CLI (`supabase db push`), but copy/pasting the contents into
-- the SQL editor in the dashboard also works for the v1 setup.
--
-- Design notes:
--
-- * Identity is an anonymous device-id (text, not uuid). The client
--   bootstraps a random hex string on first launch and persists it in
--   AsyncStorage. There is no auth; RLS is enforced by routing all
--   reads / writes through SECURITY DEFINER RPCs that take device_id
--   as an explicit parameter. Anyone can spoof any device-id by passing
--   it directly — this is the accepted v1 risk per the implementation
--   plan, and the plan flags Phase 4 anti-cheat mitigations.
--
-- * (device_id, date) is unique on daily_plays. The submit_daily_play
--   RPC INSERTS (does not upsert) so a second attempt by the same
--   device on the same date raises unique_violation. The client
--   surfaces that gracefully as "already played" — no take-backs.

-- citext for case-insensitive handle uniqueness.
create extension if not exists citext;

-- pgcrypto for gen_random_uuid().
create extension if not exists pgcrypto;

-- -------------------- tables --------------------

create table if not exists public.players (
  device_id   text         primary key,
  handle      citext       unique,
  created_at  timestamptz  not null default now()
);

create table if not exists public.daily_plays (
  id            uuid         primary key default gen_random_uuid(),
  device_id     text         not null references public.players (device_id) on delete cascade,
  date          date         not null,
  score         integer      not null check (score >= 0 and score <= 10000),
  won           boolean      not null,
  recipe        jsonb        not null,
  used_undo     boolean      not null default false,
  submitted_at  timestamptz  not null default now(),
  unique (device_id, date)
);

-- Leaderboard scans are (date, score desc). Heavy index lift goes here.
create index if not exists daily_plays_date_score_idx
  on public.daily_plays (date, score desc);

-- -------------------- RLS --------------------

alter table public.players       enable row level security;
alter table public.daily_plays   enable row level security;

-- No anon policies. All access flows through the RPCs below; direct
-- table access from the public anon role is denied by default.

-- -------------------- RPCs --------------------

-- Submits a daily play. Auto-creates the player row on first submission
-- so the client doesn't need a separate "register" call.
create or replace function public.submit_daily_play (
  p_device_id  text,
  p_date       date,
  p_score      integer,
  p_won        boolean,
  p_recipe     jsonb,
  p_used_undo  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Upsert the player row first. Insert-only on the play table itself.
  insert into public.players (device_id)
    values (p_device_id)
  on conflict (device_id) do nothing;

  insert into public.daily_plays (
    device_id, date, score, won, recipe, used_undo
  ) values (
    p_device_id, p_date, p_score, p_won, p_recipe, p_used_undo
  );
end;
$$;

-- Player's rank on a given date, plus total players for that date.
-- top_percent = ceil((rank / total) * 100) — 1 = top 1%, 100 = bottom.
-- Returns no rows when the player hasn't played that date.
create or replace function public.daily_rank (
  p_device_id  text,
  p_date       date
) returns table (
  rank         integer,
  total        integer,
  score        integer,
  top_percent  integer
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      device_id,
      score,
      rank() over (order by score desc) as r,
      count(*) over () as t
    from public.daily_plays
    where date = p_date
  )
  select
    r::integer        as rank,
    t::integer        as total,
    score             as score,
    greatest(1, ceil((r::numeric / t) * 100))::integer as top_percent
  from ranked
  where device_id = p_device_id;
$$;

-- 15-bin score histogram for a given date. Returns a jsonb object:
--   { bins: [{ lo, hi, count }, ...], median, min, max, total }
-- When no plays exist for the date, returns an empty histogram.
create or replace function public.daily_histogram (
  p_date  date,
  p_bins  integer default 15
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total   integer;
  v_min     integer;
  v_max     integer;
  v_median  numeric;
  v_step    numeric;
  v_bins    jsonb;
begin
  select count(*), min(score), max(score)
    into v_total, v_min, v_max
    from public.daily_plays
    where date = p_date;

  if v_total is null or v_total = 0 then
    return jsonb_build_object(
      'bins',   '[]'::jsonb,
      'median', null,
      'min',    null,
      'max',    null,
      'total',  0
    );
  end if;

  -- Continuous median (interpolating between the middle two ranks for
  -- even counts).
  select percentile_cont(0.5) within group (order by score)
    into v_median
    from public.daily_plays
    where date = p_date;

  -- Edge case: every player scored identically → step = 0 would divide
  -- by zero. Collapse to a single full bin.
  if v_max = v_min then
    return jsonb_build_object(
      'bins',
        jsonb_build_array(jsonb_build_object('lo', v_min, 'hi', v_max, 'count', v_total)),
      'median', v_median,
      'min',    v_min,
      'max',    v_max,
      'total',  v_total
    );
  end if;

  v_step := (v_max - v_min)::numeric / p_bins;

  with binned as (
    select
      least(
        p_bins - 1,
        floor((score - v_min) / v_step)::integer
      ) as bin_idx,
      count(*) as cnt
    from public.daily_plays
    where date = p_date
    group by 1
  ),
  with_edges as (
    select
      bin_idx,
      (v_min + bin_idx * v_step)::integer       as lo,
      (v_min + (bin_idx + 1) * v_step)::integer as hi,
      cnt
    from binned
  )
  select jsonb_agg(
    jsonb_build_object('lo', lo, 'hi', hi, 'count', cnt)
    order by bin_idx
  )
  into v_bins
  from with_edges;

  return jsonb_build_object(
    'bins',   coalesce(v_bins, '[]'::jsonb),
    'median', v_median,
    'min',    v_min,
    'max',    v_max,
    'total',  v_total
  );
end;
$$;

-- Sets the player's handle. Returns void; raises unique_violation when
-- the requested handle is already taken by another device. Pass NULL or
-- the empty string to clear the handle (revert to "Anon-XXXX" display).
create or replace function public.set_player_handle (
  p_device_id  text,
  p_handle     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle  text := nullif(trim(p_handle), '');
begin
  -- Auto-create the player row so handle-setting works before the
  -- player's first daily play.
  insert into public.players (device_id)
    values (p_device_id)
  on conflict (device_id) do nothing;

  -- Validate format: 3-16 chars, alphanumeric + underscore + hyphen.
  -- The "Anon-" prefix is reserved for the default display name.
  if v_handle is not null then
    if char_length(v_handle) < 3 or char_length(v_handle) > 16 then
      raise exception 'handle must be 3-16 characters' using errcode = '22023';
    end if;
    if v_handle !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'handle may only contain letters, digits, underscore, and hyphen' using errcode = '22023';
    end if;
    if v_handle ilike 'anon-%' then
      raise exception 'the "Anon-" prefix is reserved' using errcode = '22023';
    end if;
  end if;

  update public.players
    set handle = v_handle
    where device_id = p_device_id;
end;
$$;

-- Read the player's own row. Returns no rows for unknown device-ids.
create or replace function public.get_player (
  p_device_id  text
) returns table (
  device_id  text,
  handle     text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select device_id, handle::text, created_at
    from public.players
    where device_id = p_device_id;
$$;

-- -------------------- grants --------------------

-- The RPCs are SECURITY DEFINER so they run with owner privileges and
-- bypass the row-blocking RLS on the underlying tables. We just need
-- the anon role to be ALLOWED TO CALL them.
grant execute on function public.submit_daily_play (text, date, integer, boolean, jsonb, boolean) to anon, authenticated;
grant execute on function public.daily_rank        (text, date)                                  to anon, authenticated;
grant execute on function public.daily_histogram   (date, integer)                               to anon, authenticated;
grant execute on function public.set_player_handle (text, text)                                  to anon, authenticated;
grant execute on function public.get_player        (text)                                        to anon, authenticated;
