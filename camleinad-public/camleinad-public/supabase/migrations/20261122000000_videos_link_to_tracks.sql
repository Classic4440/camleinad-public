-- Lets the lyric-video builder (scripts/lyric-videos) tie each generated video to its track
-- and know when it is out of date. Already applied to the live project.
alter table public.videos
  add column if not exists track_id uuid references public.tracks (id) on delete cascade,
  add column if not exists source_updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'videos_track_id_key') then
    alter table public.videos add constraint videos_track_id_key unique (track_id);
  end if;
end$$;
