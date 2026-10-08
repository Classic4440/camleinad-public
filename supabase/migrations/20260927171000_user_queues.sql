create table if not exists public.user_queues (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_queues_items_array check (jsonb_typeof(items) = 'array')
);

alter table public.user_queues enable row level security;
grant select, insert, update, delete on public.user_queues to authenticated;

drop policy if exists user_queues_select_own on public.user_queues;
create policy user_queues_select_own on public.user_queues
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_queues_insert_own on public.user_queues;
create policy user_queues_insert_own on public.user_queues
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_queues_update_own on public.user_queues;
create policy user_queues_update_own on public.user_queues
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_queues_delete_own on public.user_queues;
create policy user_queues_delete_own on public.user_queues
  for delete to authenticated using (auth.uid() = user_id);