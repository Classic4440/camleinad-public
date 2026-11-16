import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import ReleaseCard from '@/components/features/ReleaseCard';
import FetchError from '@/components/ui/FetchError';
import type { Release, Track } from '@/types';
import { cn, DEFAULT_LABEL_SHORT_FORM, DEFAULT_RECORD_LABEL_NAME } from '@/lib/utils';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Singles', value: 'SINGLE' },
  { label: 'EPs', value: 'EP' },
  { label: 'Albums', value: 'ALBUM' },
  { label: 'Upcoming', value: 'upcoming' },
];

export default function MusicPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [recordLabelName, setRecordLabelName] = useState(DEFAULT_RECORD_LABEL_NAME);
  const [labelShortForm, setLabelShortForm] = useState(DEFAULT_LABEL_SHORT_FORM);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const [{ data, error }, { data: settings }] = await Promise.all([supabase
        .from('releases')
        .select('*, streaming_links(*)')
        .order('sort_order'), supabase.from('site_settings').select('key,value').in('key', ['record_label_name', 'label_short_form'])]);
      if (!active) return;
      let tracks: Track[] = [];
      let tracksError = false;
      if (!error) {
        const releases = data || [];
        const releasedIds = releases.filter(release => release.status === 'RELEASED').map(release => release.id);
        const upcomingIds = releases.filter(release => ['IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED'].includes(release.status)).map(release => release.id);
        const releasedTracksResult = releasedIds.length
          ? await supabase.from('tracks_public').select('*').in('release_id', releasedIds).order('track_number')
          : { data: [], error: null };
        const teaserTracksResult = upcomingIds.length
          ? await supabase.from('tracks_public').select('id,release_id,track_number,title,duration,status,teaser_enabled,teaser_audio_url,teaser_start_seconds,teaser_end_seconds,teaser_label').in('release_id', upcomingIds).order('track_number')
          : { data: [], error: null };
        tracksError = !!releasedTracksResult.error || !!teaserTracksResult.error;
        tracks = [
          ...(releasedTracksResult.data || []) as unknown as Track[],
          ...(teaserTracksResult.data || []) as unknown as Track[],
        ];
        if (!active) return;
        setReleases(releases.map(release => ({
          ...release,
          tracks: tracks.filter(track => track.release_id === release.id),
        })));
        settings?.forEach(setting => {
          if (setting.key === 'record_label_name' && setting.value) setRecordLabelName(setting.value);
          if (setting.key === 'label_short_form' && setting.value) setLabelShortForm(setting.value);
        });
      }
      setLoadError(!!error || tracksError);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  const publicReleases = releases.filter(release => release.status === 'RELEASED' || ['UPCOMING', 'IN_DEVELOPMENT', 'SCHEDULED'].includes(release.status));
  const filtered = publicReleases.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return ['UPCOMING', 'IN_DEVELOPMENT', 'SCHEDULED'].includes(r.status);
    return r.type === filter;
  });
  const featuredRelease = releases.find(release => release.featured && release.status === 'RELEASED') || releases.find(release => release.status === 'RELEASED');
  const featuredVisible = filter === 'all' && featuredRelease;
  const releasedReleases = filtered.filter(release => release.status === 'RELEASED' && (!featuredVisible || release.id !== featuredRelease?.id));
  const upcomingReleases = filtered.filter(release => ['UPCOMING', 'IN_DEVELOPMENT', 'SCHEDULED'].includes(release.status));
  const musicSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: publicReleases
      .map((release, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': release.type === 'SINGLE' ? 'MusicRecording' : 'MusicAlbum',
          name: release.title,
          byArtist: { '@type': 'MusicGroup', name: 'Cam Leinad', alternateName: 'CAM' },
          ...(release.status === 'RELEASED' && release.release_date ? { datePublished: release.release_date } : {}),
          url: `${window.location.origin}/music/${release.slug}`,
        },
      })),
  };

  return (
    <PageTransition>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(musicSchema)}</script>
      </Helmet>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        {/* Header */}
        <div className="mb-12">
          <p className="eyebrow">CAM LEINAD / DISCOGRAPHY</p>
          <h1 className="page-title">
            Music
          </h1>
        </div>

        {/* Filter tabs */}
        <div className="editorial-filters" role="group" aria-label="Filter releases">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn('editorial-filter', filter === f.value && 'is-active')}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Releases */}
        {loading ? (
          <div className="release-list">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-square skeleton" />
                <div className="h-3 rounded skeleton w-2/3" />
                <div className="h-3 rounded skeleton w-1/2" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <FetchError message="Couldn’t load releases. Try again." onRetry={() => setRetryCount(count => count + 1)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#72727E]">No releases found in this category.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {featuredVisible && featuredRelease && <section aria-labelledby="featured-release-title">
              <p className="eyebrow">FEATURED</p>
              <h2 id="featured-release-title" className="sr-only">{featuredRelease.title}</h2>
              <ReleaseCard release={featuredRelease} variant="featured" recordLabelName={recordLabelName} labelShortForm={labelShortForm} />
            </section>}
            {releasedReleases.length > 0 && <section aria-labelledby="released-grid-title">
              <h2 id="released-grid-title" className="eyebrow">RELEASED</h2>
              <div className="release-list">
                {releasedReleases.map(release => <ReleaseCard key={release.id} release={release} recordLabelName={recordLabelName} labelShortForm={labelShortForm} />)}
              </div>
            </section>}
            {upcomingReleases.length > 0 && <section aria-labelledby="upcoming-grid-title">
              <h2 id="upcoming-grid-title" className="eyebrow">COMING SOON</h2>
              <div className="release-list release-list--upcoming">
                {upcomingReleases.map(release => <ReleaseCard key={release.id} release={release} recordLabelName={recordLabelName} labelShortForm={labelShortForm} />)}
              </div>
            </section>}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
