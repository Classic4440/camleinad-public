import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import type { SocialLink, Video } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'All', label: 'All' },
  { value: 'official', label: 'Official' },
  { value: 'visualizer', label: 'Visualizer' },
  { value: 'lyric', label: 'Lyric' },
  { value: 'behind-the-scenes', label: 'Behind the Scenes' },
  { value: 'shorts', label: 'Shorts' },
];

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [cat, setCat] = useState('All');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [youtubeLink, setYoutubeLink] = useState<SocialLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const [videosResult, socialsResult] = await Promise.all([
        supabase.from('videos').select('*').eq('is_published', true).order('sort_order').order('published_at', { ascending: false }),
        supabase.from('social_links').select('*').eq('is_active', true).eq('platform', 'youtube').limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setLoadError(!!videosResult.error);
      if (!videosResult.error) setVideos(videosResult.data || []);
      setYoutubeLink(socialsResult.data || null);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  const filtered = cat === 'All' ? videos : videos.filter(v => v.category === cat);

  function getYtThumb(id: string) {
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }
  function getYtEmbed(id: string) {
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  }

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-12">
          <p className="eyebrow">CAM LEINAD / MOVING IMAGE</p>
          <h1 className="page-title">Videos</h1>
        </div>

        {/* Filter */}
        <div className="editorial-filters" role="group" aria-label="Filter videos">
          {CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={cat === value}
              onClick={() => setCat(value)}
              className={cn(
                'editorial-filter',
                cat === value && 'is-active'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="video-list">
            {[...Array(3)].map((_, i) => <div key={i} className="aspect-video rounded-2xl skeleton" />)}
          </div>
        ) : loadError ? (
          <FetchError message="Couldn’t load videos. Try again." onRetry={() => setRetryCount(count => count + 1)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            {videos.length === 0 ? (
              <>
                <p className="text-[#72727E] text-lg mb-3">No videos yet. Subscribe on YouTube for new content.</p>
                <a href={youtubeLink?.url || 'https://www.youtube.com/'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline">
                  Subscribe on YouTube <ExternalLink size={14} aria-hidden="true" />
                </a>
              </>
            ) : <p className="text-[#72727E] text-lg">No videos in this category.</p>}
          </div>
        ) : (
          <div className="video-list">
            {filtered.map(video => (
              <article key={video.id} className="video-row">
                <div className="video-row__image">
                  {activeVideoId === video.id && video.youtube_id ? (
                    <iframe title={video.title} src={getYtEmbed(video.youtube_id)} className="h-full w-full" loading="lazy" allowFullScreen allow="autoplay; encrypted-media; picture-in-picture" />
                  ) : activeVideoId === video.id && video.url ? (
                    <video src={video.url} controls autoPlay className="h-full w-full" />
                  ) : (
                    <button type="button" disabled={!video.youtube_id && !video.url} aria-label={`Play ${video.title}`} className="video-facade h-full w-full disabled:cursor-not-allowed" onClick={() => setActiveVideoId(video.id)}>
                      {(video.thumbnail_url || (video.youtube_id ? getYtThumb(video.youtube_id) : null)) && <img src={video.thumbnail_url || getYtThumb(video.youtube_id!)} alt={`${video.title} thumbnail`} width={1280} height={720} loading="lazy" className="h-full w-full object-cover" />}
                      <span className="video-facade__play" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="video-row__copy">
                  <p className="eyebrow">{video.category}{video.published_at && ` / ${new Date(video.published_at).getFullYear()}`}</p>
                  <h2>{video.title}</h2>
                  {video.description && <p>{video.description}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
