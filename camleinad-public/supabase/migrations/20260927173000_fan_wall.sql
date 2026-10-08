create table if not exists public.fan_wall_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint fan_wall_posts_user_id_fkey references public.profiles(id) on delete cascade,
  track_id uuid null constraint fan_wall_posts_track_id_fkey references public.tracks(id) on delete set null,
  body text not null check (char_length(body) between 1 and 280),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists fan_wall_posts_created_at_idx on public.fan_wall_posts (created_at desc);
alter table public.fan_wall_posts enable row level security;
grant select on public.fan_wall_posts to anon, authenticated;
grant insert, update, delete on public.fan_wall_posts to authenticated;

create or replace function public.enforce_fan_wall_hourly_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (
    select 1 from public.fan_wall_posts p
    where p.user_id = new.user_id
      and p.created_at > now() - interval '1 hour'
  ) then
    raise exception 'one post per user per hour' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists fan_wall_hourly_limit on public.fan_wall_posts;
create trigger fan_wall_hourly_limit
  before insert on public.fan_wall_posts
  for each row execute function public.enforce_fan_wall_hourly_limit();

drop policy if exists fan_wall_posts_read_visible on public.fan_wall_posts;
create policy fan_wall_posts_read_visible on public.fan_wall_posts
  for select to anon, authenticated
  using (is_hidden = false or public.is_current_user_admin());

drop policy if exists fan_wall_posts_insert_own on public.fan_wall_posts;
create policy fan_wall_posts_insert_own on public.fan_wall_posts
  for insert to authenticated
  with check (auth.uid() = user_id and is_hidden = false and char_length(body) between 1 and 280);

drop policy if exists fan_wall_posts_admin_update on public.fan_wall_posts;
create policy fan_wall_posts_admin_update on public.fan_wall_posts
  for update to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists fan_wall_posts_admin_delete on public.fan_wall_posts;
create policy fan_wall_posts_admin_delete on public.fan_wall_posts
  for delete to authenticated
  using (public.is_current_user_admin());