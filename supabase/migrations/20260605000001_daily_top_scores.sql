-- Daily Grid — top-scores + median + win-rate RPC.
--
-- Adds `daily_top_scores(p_device_id, p_date, p_limit)` which returns
-- median + total + win-rate + the top N leaderboard rows (each tagged
-- with is_own so the client can highlight the player's row).
--
-- `win_rate_pct` is the share of submissions whose `won` flag is true
-- — i.e. share of players who beat the target. Computed server-side
-- straight off the boolean column, so the value reflects whatever
-- target each player saw at submission time (matches their recorded
-- recipe even if the global config changes later).
--
-- The original `daily_histogram` RPC from the first migration stays
-- in place — it's no longer called from the client, but dropping it
-- requires a function-signature change that's not worth the churn.
--
-- Apply this in the Supabase SQL editor like the first migration.

create or replace function public.daily_top_scores (
  p_device_id  text,
  p_date       date,
  p_limit      integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total        integer;
  v_wins         integer;
  v_median       numeric;
  v_top          jsonb;
  v_win_rate     integer;
begin
  select
      count(*),
      count(*) filter (where won)
    into v_total, v_wins
    from public.daily_plays
    where date = p_date;

  if v_total = 0 then
    return jsonb_build_object(
      'median',        null,
      'total',         0,
      'win_rate_pct',  null,
      'top_scores',    '[]'::jsonb
    );
  end if;

  -- Round to whole-percent so the client can render it as an int.
  v_win_rate := round((v_wins::numeric / v_total) * 100)::integer;

  select percentile_cont(0.5) within group (order by score)
    into v_median
    from public.daily_plays
    where date = p_date;

  with ranked as (
    select
      device_id,
      handle::text,
      score,
      rank() over (order by score desc) as r
    from public.daily_plays
    where date = p_date
  )
  select jsonb_agg(
    -- display_name falls back to "Anon-XXXX" using the first 4 hex
    -- chars of the device-id when the player hasn't set a handle.
    -- We compute it server-side so the client doesn't need to know
    -- other players' device-ids — keeps the API surface scoped to
    -- "what's displayable" rather than "what's identifying".
    jsonb_build_object(
      'rank',         r::integer,
      'display_name', coalesce(handle, 'Anon-' || substring(device_id, 1, 4)),
      'score',        score,
      'is_own',       (device_id = p_device_id)
    )
    order by r
  )
  into v_top
  from ranked
  where r <= p_limit;

  return jsonb_build_object(
    'median',        v_median,
    'total',         v_total,
    'win_rate_pct',  v_win_rate,
    'top_scores',    coalesce(v_top, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.daily_top_scores (text, date, integer) to anon, authenticated;
