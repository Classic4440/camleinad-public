import { Link } from 'react-router-dom';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn, DEFAULT_LABEL_SHORT_FORM, DEFAULT_RECORD_LABEL_NAME, getAudioUrl, getStatusLabel, getStatusClass, getTypeLabel, formatDate } from '@/lib/utils';
import { thumbUrl } from '@/lib/imageUrl';
import type { Release, Track } from '@/types';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Headphones, ListPlus, Music2, Youtube } from 'lucide-react';

interface ReleaseCardProps {
  release: Release;
  variant?: 'grid' | 'featured' | 'compact';
  recordLabelName?: string;
  labelShortForm?: string;
}

export default function ReleaseCard({ release, variant = 'grid', recordLabelName = DEFAULT_RECORD_LABEL_NAME, labelShortForm = DEFAULT_LABEL_SHORT_FORM }: ReleaseCardProps) {
  const { playTrack, dispatch } = usePlayer();
  const { user } = useAuth();
  const [isFav, setIsFav] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const artwork = release.artwork_url || null;
  const hasPlayableAudio = release.status === 'RELEASED' && Boolean(release.tracks?.some(track => track.audio_url));
  const platformLinks = (release.streaming_links || []).flatMap(link => {
    const platform = link.platform.toLowerCase();
    if (platform === 'spotify') return [{ ...link, icon: Headphones }];
    if (platform === 'apple_music') return [{ ...link, icon: Music2 }];
    if (platform === 'youtube_music') return [{ ...link, icon: Youtube }];
    return [];
  });

  useEffect(() => {
    if (!user) return;
    supabase.from('favorites').select('id').eq('user_id', user.id).eq('release_id', release.id).maybeSingle()
      .then(({ data }) => setIsFav(!!data));
  }, [user, release.id]);

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    if (!user || favoriteSaving) return;
    setFavoriteSaving(true);
    if (isFav) {
      const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('release_id', release.id);
      if (error) { toast.error('Could not update favorites. Try again.'); setFavoriteSaving(false); return; }
      setIsFav(false);
    } else {
      const { error } = await supabase.from('favorites').insert({ user_id: user.id, release_id: release.id });
      if (error) { toast.error('Could not update favorites. Try again.'); setFavoriteSaving(false); return; }
      setIsFav(true);
    }
    setFavoriteSaving(false);
  }

  async function handlePlay(e: React.MouseEvent) {
    e.preventDefault();
    const { data: tracks, error } = await supabase
      .from('tracks_public')
      .select('*')
      .eq('release_id', release.id)
      .order('track_number');
    if (error) { toast.error('Could not load tracks. Try again.'); return; }
    const playableTracks = tracks?.filter(track => track.audio_url) || [];
    if (playableTracks.length > 0) {
      const playerTracks = playableTracks.map((t: Track) => ({
        id: t.id,
        title: t.title,
        artist: 'Cam Leinad',
        artwork,
        audioUrl: getAudioUrl(t.audio_url),
        releaseSlug: release.slug,
        releaseTitle: release.title,
        duration: t.duration || undefined,
        lyrics: t.lyrics,
      }));
      playTrack(playerTracks[0], playerTracks);
    }
  }

  function addReleaseToQueue(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const playableTracks = release.tracks?.filter(track => track.audio_url) || [];
    if (!playableTracks.length) { toast.error('Audio is not available for this release yet.'); return; }
    playableTracks.forEach(track => dispatch({
      type: 'ADD_TO_QUEUE', track: {
        id: track.id,
        title: track.title,
        artist: 'Cam Leinad',
        artwork,
        audioUrl: getAudioUrl(track.audio_url),
        releaseSlug: release.slug,
        releaseTitle: release.title,
        duration: track.duration || undefined,
        lyrics: track.lyrics,
      }
    }));
    toast.success(`${playableTracks.length} ${playableTracks.length === 1 ? 'track' : 'tracks'} added to queue.`);
  }

  const artworkBlock = artwork ? (
    <img src={thumbUrl(artwork)} alt={`${release.title} cover artwork`} width={200} height={200} loading="lazy" className="release-row__art" />
  ) : <div className="release-row__art release-row__art--empty" aria-label={`${release.title} artwork unavailable`} />;

  return (
    <article className={cn('release-row', variant === 'featured' && 'release-row--featured', release.status !== 'RELEASED' && 'release-row--upcoming')}>
      <Link to={`/music/${release.slug}`} className="release-row__image">{artworkBlock}</Link>
      <div className="release-row__details">
        <p className="eyebrow">{getTypeLabel(release.type)}{release.release_date && ` / ${formatDate(release.release_date)}`}</p>
        <Link to={`/music/${release.slug}`} className="release-row__title">{release.title}</Link>
        <p className="release-row__meta">{release.status === 'RELEASED' ? `Released on ${recordLabelName} (${labelShortForm})` : `Coming soon from ${recordLabelName} (${labelShortForm})`}</p>
        {['IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED'].includes(release.status) && release.tracks?.some(track => track.teaser_enabled === true && track.teaser_audio_url) && <p className="mt-1 text-xs text-[var(--accent)]">Preview available</p>}
        {release.description && <p className="release-row__description">{release.description}</p>}
        <div className="release-row__actions">
          {release.status === 'RELEASED' && hasPlayableAudio && <button type="button" onClick={handlePlay} className="text-link">Listen</button>}
          {release.status === 'RELEASED' && <button type="button" onClick={addReleaseToQueue} className="text-link"><ListPlus aria-hidden="true" className="w-4 h-4" /> Queue</button>}
          {user && <button type="button" onClick={toggleFavorite} disabled={favoriteSaving} className="text-link" aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}>{isFav ? 'Saved' : 'Save'}</button>}
          {platformLinks.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">{link.label || link.platform} <span aria-hidden="true">↗</span></a>)}
        </div>
      </div>
      <span className="release-row__status">{getStatusLabel(release.status)}</span>
    </article>
  );
}
