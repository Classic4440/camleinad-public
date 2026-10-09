create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  played_at timestamptz not null default now(),
  seconds_played integer not null default 0 check (seconds_played >= 0)
);

create index if not exists plays_user_played_at_idx on public.plays (user_id, played_at desc);
create index if not exists plays_track_played_at_idx on public.plays (track_id, played_at desc);

alter table public.plays enable row level security;
grant select, insert on public.plays to authenticated;

drop policy if exists plays_select_own_or_admin on public.plays;
create policy plays_select_own_or_admin on public.plays
  for select to authenticated
  using (auth.uid() = user_id or public.is_current_user_admin());

drop policy if exists plays_insert_own on public.plays;
create policy plays_insert_own on public.plays
  for insert to authenticated
  with check (auth.uid() = user_id);

create or replace function public.get_admin_top_tracks()
returns table(track_id uuid, play_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'admin access required';
  end if;
  return query
    select p.track_id, count(*)::bigint
    from public.plays p
    group by p.track_id
    order by count(*) desc, p.track_id
    limit 5;
end;
$$;

revoke all on function public.get_admin_top_tracks() from public;
grant execute on function public.get_admin_top_tracks() to authenticated;