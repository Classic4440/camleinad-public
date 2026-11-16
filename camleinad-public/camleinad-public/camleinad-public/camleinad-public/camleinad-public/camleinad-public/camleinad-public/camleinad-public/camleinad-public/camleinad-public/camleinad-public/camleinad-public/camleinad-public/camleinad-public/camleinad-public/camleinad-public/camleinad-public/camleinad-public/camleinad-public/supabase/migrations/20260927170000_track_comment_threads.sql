alter table public.comments
  add column if not exists track_id uuid references public.tracks(id) on delete cascade,
  add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_track_thread_created_at_idx
  on public.comments (track_id, created_at)
  where track_id is not null;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to anon, authenticated;

alter table public.comments enable row level security;
grant delete on public.comments to authenticated;

drop policy if exists comments_track_thread_select on public.comments;
create policy comments_track_thread_select
  on public.comments
  for select
  to anon, authenticated
  using (
    track_id is not null
    and (is_hidden = false or public.is_current_user_admin())
  );

drop policy if exists comments_track_thread_insert on public.comments;
create policy comments_track_thread_insert
  on public.comments
  for insert
  to authenticated
  with check (
    track_id is not null
    and release_id is null
    and news_id is null
    and user_id = auth.uid()
    and is_hidden = false
    and (
      parent_comment_id is null
      or exists (
        select 1
        from public.comments parent
        where parent.id = parent_comment_id
          and parent.track_id = track_id
          and parent.parent_comment_id is null
          and parent.is_hidden = false
      )
    )
  );

drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete
  on public.comments
  for delete
  to authenticated
  using (public.is_current_user_admin());