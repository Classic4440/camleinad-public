alter table public.newsletter_subscribers enable row level security;

grant insert on public.newsletter_subscribers to anon, authenticated;

drop policy if exists newsletter_subscribers_public_insert on public.newsletter_subscribers;
create policy newsletter_subscribers_public_insert
  on public.newsletter_subscribers
  for insert
  to anon, authenticated
  with check (email is not null and btrim(email) <> '');