import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Play } from 'lucide-react';
import NameReveal from '@/components/home/NameReveal';
import ListenExperience from '@/components/home/ListenExperience';
import { supabase } from '@/lib/supabase';
import { usePlayer } from '@/contexts/PlayerContext';
import type { NewsArticle, PlayerTrack, Release, SocialLink, StreamingLink, Track } from '@/types';
import { coverUrl } from '@/lib/imageUrl';
import { formatDate, getAudioUrl, getTypeLabel } from '@/lib/utils';

interface HomeData {
  release: Release | null;
  tracks: Track[];
  streamingLinks: StreamingLink[];
  upcoming: Release | null;
  upcomingHasPreview: boolean;
  news: NewsArticle[];
  socials: SocialLink[];
}

const EMPTY_DATA: HomeData = {
  release: null,
  tracks: [],
  streamingLinks: [],
  upcoming: null,
  upcomingHasPreview: false,
  news: [],
  socials: [],
};

function fallbackSearchUrl(platform: 'spotify' | 'youtube', title: string) {
  const query = encodeURIComponent(`Cam Leinad ${title}`);
  return platform === 'spotify'
    ? `https://open.spotify.com/search/${query}`
    : `https://www.youtube.com/results?search_query=${query}`;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [listening, setListening] = useState(false);
  const { playTrack } = usePlayer();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const [releaseResult, upcomingResult, newsResult, socialsResult] = await Promise.all([
        supabase.from('releases').select('*').eq('status', 'RELEASED').order('release_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('releases').select('*').eq('status', 'UPCOMING').eq('show_upcoming_publicly', true).order('release_date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('news').select('*').eq('is_published', true).order('published_at', { ascending: false }).limit(2),
        supabase.from('social_links').select('*').eq('is_active', true).order('sort_order'),
      ]);

      const [tracksResult, linksResult, upcomingTracksResult] = await Promise.all([
        releaseResult.data
          ? supabase.from('tracks_public').select('*').eq('release_id', releaseResult.data.id).order('track_number')
          : Promise.resolve({ data: [], error: null }),
        releaseResult.data
          ? supabase.from('streaming_links').select('*').eq('release_id', releaseResult.data.id)
          : Promise.resolve({ data: [], error: null }),
        upcomingResult.data
          ? supabase.from('tracks_public').select('teaser_enabled,teaser_audio_url').eq('release_id', upcomingResult.data.id)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;

      const upcomingHasPreview = (upcomingTracksResult.data || []).some(track =>
        track.teaser_enabled === true && Boolean(track.teaser_audio_url)
      );
      setData({
        release: releaseResult.data as Release | null,
        tracks: (tracksResult.data || []) as Track[],
        streamingLinks: (linksResult.data || []) as StreamingLink[],
        upcoming: upcomingResult.data as Release | null,
        upcomingHasPreview,
        news: (newsResult.data || []) as NewsArticle[],
        socials: (socialsResult.data || []) as SocialLink[],
      });
      setLoadError(Boolean(
        releaseResult.error || upcomingResult.error || newsResult.error || socialsResult.error ||
        tracksResult.error || linksResult.error || upcomingTracksResult.error
      ));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  const eligibleTracks = data.tracks.filter(track => track.status === 'RELEASED' && Boolean(track.audio_url));
  const featuredTrack = (() => {
    const chosenTrackId = data.release?.featured_track_id;
    if (chosenTrackId) {
      const match = eligibleTracks.find(track => track.id === chosenTrackId);
      if (match) return match;
    }
    return eligibleTracks[0] || null;
  })();
  const playableTracks: PlayerTrack[] = eligibleTracks.map(track => ({
    id: track.id,
    title: track.title,
    artist: 'Cam Leinad',
    artwork: data.release?.artwork_url || null,
    audioUrl: getAudioUrl(track.audio_url),
    releaseSlug: data.release?.slug || '',
    releaseTitle: data.release?.title || '',
    duration: track.duration || undefined,
    lyrics: track.lyrics,
    syncedLyrics: track.lyrics_synced || null,
  }));
  const spotifyLink = data.streamingLinks.find(link => link.platform.toLowerCase() === 'spotify');
  const youtubeLink = data.streamingLinks.find(link => ['youtube', 'youtube_music'].includes(link.platform.toLowerCase()));
  const release = data.release;
  const upcomingDays = data.upcoming?.release_date
    ? Math.max(0, Math.ceil((new Date(data.upcoming.release_date).getTime() - Date.now()) / 86_400_000))
    : null;

  function startListening() {
    const selectedTrack = playableTracks.find(track => track.id === featuredTrack?.id) || playableTracks[0];
    if (!selectedTrack) return;
    playTrack(selectedTrack, playableTracks);
    setListening(true);
  }

  return (
    <div>
      <NameReveal />

      <section aria-labelledby="latest-release-title" className="mx-auto grid w-full max-w-[1100px] items-center gap-8 px-5 py-20 sm:px-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] md:gap-14 md:py-28">
        {loading ? <div className="aspect-square w-full skeleton" aria-hidden="true" /> : release?.artwork_url ? (
          <img src={coverUrl(release.artwork_url)} alt={`${release.title} cover artwork`} width={960} height={960} loading="lazy" className="aspect-square w-full object-cover" />
        ) : <div className="flex aspect-square w-full items-center justify-center bg-[var(--surface)] text-sm text-[var(--ink-muted)]">Cover artwork unavailable</div>}
        <div className="text-left">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            {loading ? 'LATEST RELEASE' : release ? `${getTypeLabel(release.type)} / ${formatDate(release.release_date)}` : 'LATEST RELEASE'}
          </p>
          <h1 id="latest-release-title" className="mb-5 font-display text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] text-[var(--ink)]">
            {loading ? 'Loading release' : release?.title || 'Music from Cam Leinad'}
          </h1>
          <p className="mb-7 max-w-xl text-base leading-relaxed text-[var(--ink-muted)]">
            {release?.description || 'A song to sit with, wherever you are.'}
          </p>
          <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href={spotifyLink?.url || fallbackSearchUrl('spotify', release?.title || 'Cam Leinad')} target="_blank" rel="noopener noreferrer" className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--accent)]">Listen on Spotify <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></a>
            <a href={youtubeLink?.url || fallbackSearchUrl('youtube', release?.title || 'Cam Leinad')} target="_blank" rel="noopener noreferrer" className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--accent)]">Watch on YouTube <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></a>
            <Link to="/music" className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--accent)]">All releases <span aria-hidden="true">→</span></Link>
          </div>
          <button type="button" onClick={startListening} disabled={!playableTracks.length || loading} aria-label={`Play ${featuredTrack?.title || release?.title || 'latest release'}`} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--base)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40">
            <Play aria-hidden="true" className="ml-0.5 h-5 w-5 fill-current" />
          </button>
          {loadError && <p role="alert" className="mt-5 text-sm text-[var(--ink-muted)]">Some release details could not be loaded. <button type="button" onClick={() => setRetryCount(count => count + 1)} className="underline underline-offset-4 hover:text-[var(--accent)]">Retry</button></p>}
        </div>
      </section>

      <AnimatePresence>
        {listening && featuredTrack && (
          <ListenExperience
            key={featuredTrack.id}
            track={playableTracks.find(track => track.id === featuredTrack.id)!}
            onClose={() => setListening(false)}
          />
        )}
      </AnimatePresence>

      <section aria-labelledby="journal-title" className="mx-auto w-full max-w-[1100px] border-t border-[var(--rule)] px-5 py-16 sm:px-8 md:py-20">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="journal-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">From the journal</h2>
          <Link to="/news" className="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">All posts <span aria-hidden="true">→</span></Link>
        </div>
        {loading ? <div className="h-32 skeleton" aria-hidden="true" /> : data.news.length ? (
          <div className="divide-y divide-[var(--rule)]">
            {data.news.slice(0, 2).map(article => (
              <article key={article.id} className="grid gap-3 py-6 first:pt-2 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-center md:gap-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{article.category || 'Journal'}</p>
                <div>
                  <h3 className="font-display text-2xl leading-tight text-[var(--ink)]"><Link to={`/news/${article.slug}`} className="transition-colors hover:text-[var(--accent)]">{article.title}</Link></h3>
                  {article.excerpt && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">{article.excerpt}</p>}
                  <time className="mt-2 block text-xs text-[var(--ink-muted)]" dateTime={article.published_at || undefined}>{formatDate(article.published_at)}</time>
                </div>
                <Link to={`/news/${article.slug}`} className="w-fit text-sm text-[var(--ink)] transition-colors hover:text-[var(--accent)]">Read <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        ) : <p className="py-8 text-sm text-[var(--ink-muted)]">No journal entries yet.</p>}
      </section>

      {data.upcoming && (
        <section aria-labelledby="upcoming-title" className="mx-auto grid w-full max-w-[1100px] grid-cols-[96px_minmax(0,1fr)] items-center gap-5 border-t border-[var(--rule)] px-5 py-12 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-8 sm:px-8">
          {data.upcoming.artwork_url ? <img src={coverUrl(data.upcoming.artwork_url)} alt={`${data.upcoming.title} cover artwork`} width={240} height={240} loading="lazy" className="aspect-square w-24 object-cover sm:w-[120px]" /> : <div className="aspect-square w-24 bg-[var(--surface)] sm:w-[120px]" />}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Upcoming</p>
            <h2 id="upcoming-title" className="font-display text-2xl text-[var(--ink)]">{data.upcoming.title}</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{formatDate(data.upcoming.release_date)}{upcomingDays !== null ? ` · ${upcomingDays} days` : ''}</p>
            {data.upcomingHasPreview && <p className="mt-2 text-xs text-[var(--accent)]">Preview available</p>}
          </div>
          <Link to={`/music/${data.upcoming.slug}`} className="col-span-2 mt-1 w-fit text-sm text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--accent)] sm:col-span-1 sm:mt-0">View release <span aria-hidden="true">→</span></Link>
        </section>
      )}

      <section aria-label="Social links" className="mx-auto flex w-full max-w-[1100px] flex-wrap justify-center gap-x-7 gap-y-3 border-t border-[var(--rule)] px-5 py-10 sm:px-8">
        {data.socials.map(link => (
          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">{link.label || link.platform}</a>
        ))}
      </section>
    </div>
  );
}
