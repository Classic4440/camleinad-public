import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/supabase';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import TeaserPlayer from '@/components/public/TeaserPlayer';
import SyncedLyrics from '@/components/public/SyncedLyrics';
import Avatar from '@/components/ui/Avatar';
import { coverUrl } from '@/lib/imageUrl';
import type { PlayerTrack, Release, Track, StreamingLink, Comment } from '@/types';
import { getAudioUrl, getStatusLabel, getStatusClass, getTypeLabel, formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { DEFAULT_LABEL_SHORT_FORM, DEFAULT_RECORD_LABEL_NAME } from '@/lib/utils';
import { BookOpenText, ListPlus, Lock, X } from 'lucide-react';
import { Copy, Share2 } from 'lucide-react';

export default function ReleaseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [release, setRelease] = useState<Release | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [links, setLinks] = useState<StreamingLink[]>([]);
  const [recordLabelName, setRecordLabelName] = useState(DEFAULT_RECORD_LABEL_NAME);
  const [labelShortForm, setLabelShortForm] = useState(DEFAULT_LABEL_SHORT_FORM);
  const [comments, setComments] = useState<Comment[]>([]);
  const [trackComments, setTrackComments] = useState<Record<string, Comment[]>>({});
  const [openTrackId, setOpenTrackId] = useState<string | null>(null);
  const [openLyricsTrackId, setOpenLyricsTrackId] = useState<string | null>(null);
  const [trackCommentText, setTrackCommentText] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [trackCommentSubmitting, setTrackCommentSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const { state: playerState, playTrack, dispatch } = usePlayer();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!slug) return;
    let active = true;
    async function load() {
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
      const { data: rel, error: releaseError } = await supabase.from('releases').select('*').eq('slug', slug).single();
      if (!active) return;
      if (releaseError) { setLoadError(true); setLoading(false); return; }
      if (!rel) { setNotFound(true); setLoading(false); return; }
      setRelease(rel);
      const isUpcomingRelease = ['IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED'].includes(rel.status);
      const [tracksResult, linksResult, commentsResult, labelSettingsResult] = await Promise.all([
        supabase.from('tracks_public')
          .select((isUpcomingRelease
            ? 'id,release_id,track_number,title,duration,status,lyrics,lyrics_synced,teaser_enabled,teaser_audio_url,teaser_start_seconds,teaser_end_seconds,teaser_label'
            : '*') as any)
          .eq('release_id', rel.id).order('track_number'),
        supabase.from('streaming_links').select('*').eq('release_id', rel.id),
        supabase.from('comments').select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)').eq('release_id', rel.id).eq('is_hidden', false).order('created_at'),
        supabase.from('site_settings').select('key,value').in('key', ['record_label_name', 'label_short_form']),
      ]);
      if (!active) return;
      const publicTracks = (tracksResult.data || []) as unknown as Track[];
      const trackIds = publicTracks.map(track => track.id);
      let trackThreadComments: Comment[] = [];
      let trackThreadError = false;
      if (trackIds.length) {
        const { data, error } = await supabase.from('comments')
          .select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)')
          .in('track_id', trackIds).eq('is_hidden', false).order('created_at');
        if (!active) return;
        trackThreadError = !!error;
        trackThreadComments = data || [];
      }
      if (tracksResult.error || linksResult.error || commentsResult.error || trackThreadError) setLoadError(true);
      setTracks(publicTracks);
      setLinks(linksResult.data || []);
      setComments(commentsResult.data || []);
      setTrackComments(trackThreadComments.reduce<Record<string, Comment[]>>((byTrack, comment) => {
        if (!comment.track_id) return byTrack;
        (byTrack[comment.track_id] ||= []).push(comment);
        return byTrack;
      }, {}));
      labelSettingsResult.data?.forEach(setting => {
        if (setting.key === 'record_label_name' && setting.value) setRecordLabelName(setting.value);
        if (setting.key === 'label_short_form' && setting.value) setLabelShortForm(setting.value);
      });
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [slug, retryCount]);

  const artwork = release?.artwork_url || null;
  const isUpcomingRelease = release && ['IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED'].includes(release.status);
  const teaserLabel = isUpcomingRelease
    ? tracks.find(track => track.teaser_enabled === true && track.teaser_audio_url && track.teaser_label)?.teaser_label
    : undefined;
  const lyricsTrack = tracks.find(track => track.id === openLyricsTrackId) || null;
  const isThisTrackPlaying = Boolean(lyricsTrack && playerState.currentTrack?.id === lyricsTrack.id);

  async function handlePlay(track?: Track) {
    if (!release) return;
    const playableTracks = tracks.filter(t => t.audio_url);
    const playerTracks = playableTracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: 'Cam Leinad',
      artwork,
      audioUrl: getAudioUrl(t.audio_url),
      releaseSlug: release.slug,
      releaseTitle: release.title,
      lyrics: t.lyrics,
      syncedLyrics: t.lyrics_synced,
    }));
    const startTrack = track
      ? playerTracks.find(t => t.id === track.id) || playerTracks[0]
      : playerTracks[0];
    if (startTrack) playTrack(startTrack, playerTracks);
  }

  function addTrackToQueue(track: Track) {
    if (!track.audio_url || !release) { toast.error('Audio is not available for this track yet.'); return; }
    dispatch({
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
        syncedLyrics: track.lyrics_synced,
      }
    });
    toast.success('Added to queue.');
  }

  async function submitComment() {
    if (!user || !release || !commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    const { data, error } = await supabase.from('comments')
      .insert({ user_id: user.id, release_id: release.id, body: commentText.trim() })
      .select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)').single();
    setCommentSubmitting(false);
    if (error) { toast.error('Could not post your comment. Try again.'); return; }
    if (data) {
      setComments(c => [...c, data]);
      setCommentText('');
    }
  }

  async function submitTrackComment(trackId: string) {
    if (!user || !trackCommentText.trim() || trackCommentSubmitting) return;
    setTrackCommentSubmitting(true);
    const { data, error } = await supabase.from('comments')
      .insert({
        user_id: user.id,
        track_id: trackId,
        parent_comment_id: replyToCommentId,
        body: trackCommentText.trim(),
      })
      .select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)')
      .single();
    setTrackCommentSubmitting(false);
    if (error) { toast.error('Could not post your track comment. Try again.'); return; }
    if (data) {
      setTrackComments(current => ({ ...current, [trackId]: [...(current[trackId] || []), data] }));
      setTrackCommentText('');
      setReplyToCommentId(null);
    }
  }

  async function deleteTrackComment(trackId: string, commentId: string) {
    if (!isAdmin) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('track_id', trackId);
    if (error) { toast.error('Could not delete this comment.'); return; }
    setTrackComments(current => ({
      ...current,
      [trackId]: (current[trackId] || []).filter(comment => comment.id !== commentId && comment.parent_comment_id !== commentId),
    }));
  }

  async function copyReleaseLink() {
    if (!release) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/music/${release.slug}`);
      toast.success('Release link copied.');
    } catch {
      toast.error('Could not copy the release link.');
    }
  }

  async function nativeShareRelease() {
    if (!release || !navigator.share) return;
    try {
      await navigator.share({ title: `${release.title} — Cam Leinad`, url: `${window.location.origin}/music/${release.slug}` });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Could not share this release.');
    }
  }

  function createPlayerTrack(track: Track): PlayerTrack {
    return {
      id: track.id,
      title: track.title,
      artist: 'Cam Leinad',
      artwork,
      audioUrl: getAudioUrl(track.audio_url),
      releaseSlug: release?.slug || '',
      releaseTitle: release?.title || '',
      duration: track.duration || undefined,
      lyrics: track.lyrics,
      syncedLyrics: track.lyrics_synced,
    };
  }

  function playLyricsTrack(track: Track) {
    if (!track.audio_url) return;
    const queue = tracks.filter(item => item.audio_url).map(createPlayerTrack);
    const playerTrack = queue.find(item => item.id === track.id);
    if (playerTrack) playTrack(playerTrack, queue);
  }

  if (loading) return <div className="pt-28 flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /><div className="sr-only">Loading release</div></div>;
  if (loadError) return <div className="pt-28 max-w-3xl mx-auto px-4"><FetchError message="Couldn’t load this release. Try again." onRetry={() => setRetryCount(count => count + 1)} /></div>;
  if (notFound || !release) return (
    <div className="pt-28 text-center py-20">
      <p className="text-[#72727E] mb-4">Release not found.</p>
      <Link to="/music" className="text-violet-400 hover:text-violet-300">← Back to Music</Link>
    </div>
  );

  const isReleased = release.status === 'RELEASED';
  const hasPlayableAudio = isReleased && tracks.some(track => track.audio_url);
  const musicSchema = {
    '@context': 'https://schema.org',
    '@type': release.type === 'SINGLE' ? 'MusicRecording' : 'MusicAlbum',
    name: release.title,
    byArtist: { '@type': 'MusicGroup', name: 'Cam Leinad', alternateName: labelShortForm },
    recordLabel: recordLabelName,
    ...(isReleased && release.release_date ? { datePublished: release.release_date } : {}),
    ...(artwork ? { image: artwork } : {}),
    ...(tracks.length > 0 && release.type !== 'SINGLE' ? {
      track: tracks.map(track => ({ '@type': 'MusicRecording', name: track.title })),
    } : {}),
    url: `${window.location.origin}/music/${release.slug}`,
  };

  return (
    <PageTransition>
      <Helmet>
        <meta property="og:type" content={release.type === 'SINGLE' ? 'music.song' : 'music.album'} />
        <meta property="og:title" content={`${release.title} — Cam Leinad`} />
        <meta property="og:description" content={release.description || `${release.title} by Cam Leinad, released on ${recordLabelName}.`} />
        <meta property="og:url" content={`${window.location.origin}/music/${release.slug}`} />
        {artwork && <meta property="og:image" content={artwork} />}
        <meta name="twitter:card" content="summary_large_image" />
        {artwork && <meta name="twitter:image" content={artwork} />}
        <script type="application/ld+json">{JSON.stringify(musicSchema)}</script>
      </Helmet>
      <section className="release-cover" aria-label={`${release.title} cover artwork`}>
        {artwork ? <img src={coverUrl(artwork)} alt={`${release.title} cover artwork`} width={800} height={800} loading="eager" fetchPriority="high" /> : <div className="release-cover__empty" />}
        <p aria-hidden="true">{release.title}</p>
      </section>
      <div className="release-detail__body editorial-section">
        <Link to="/music" className="inline-flex items-center gap-2 text-sm text-[#72727E] hover:text-white transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Music
        </Link>

        <div className="release-detail__content">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={getStatusClass(release.status)}>{getStatusLabel(release.status)}</span>
              <span className="text-[#72727E] text-sm">{getTypeLabel(release.type)}</span>
              {release.release_date && <span className="text-[#72727E] text-sm">· {formatDate(release.release_date)}</span>}
            </div>

            <h1 className="page-title mb-2">{release.title}</h1>
            <p className="text-lg text-[#A8A8B3] mb-6">Cam Leinad</p>
            <p className="text-sm text-[#72727E] mb-2">{isReleased ? 'Released' : 'Coming soon'} on {recordLabelName} ({labelShortForm})</p>
            <div className="text-xs text-[#72727E] mb-6 space-y-1" aria-label="Copyright information">
              <p>℗ 2026 {recordLabelName}</p>
            </div>

            {release.description && (
              <p className="text-[#A8A8B3] leading-relaxed mb-8 max-w-xl">{release.description}</p>
            )}

            {links.length > 0 && <div className="release-streaming" aria-label="Streaming links">{links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">{link.label || link.platform} <span aria-hidden="true">↗</span></a>)}</div>}

            {hasPlayableAudio && (
              <button onClick={() => handlePlay()} className="text-link release-detail__play mb-10">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Play {getTypeLabel(release.type)}
              </button>
            )}

            {(() => {
              console.log('[ReleaseDetail] tracks:', tracks.map(t => ({ id: t.id, title: t.title, teaser_enabled: t.teaser_enabled, teaser_audio_url: t.teaser_audio_url })));
              return null;
            })()}
            {tracks.length > 0 && (
              <div className="mb-10">
                {teaserLabel && <p className="text-sm text-[var(--ink-muted)] mb-3">{teaserLabel}</p>}
                <p className="text-xs uppercase tracking-widest text-[#72727E] mb-4">Tracklist · {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}</p>
                <div className="space-y-1">
                  {tracks.map(track => {
                    const trackThread = trackComments[track.id] || [];
                    const topLevelComments = trackThread.filter(comment => !comment.parent_comment_id);
                    const threadIsOpen = openTrackId === track.id;
                    const hasTeaser = isUpcomingRelease && track.teaser_enabled === true && typeof track.teaser_audio_url === 'string' && track.teaser_audio_url.trim().length > 0;
                    const isLocked = isUpcomingRelease && !hasTeaser;
                    return (
                      <div key={track.id}>
                        <div className={cn('release-track flex items-center gap-2', isLocked && 'opacity-50')}>
                          <button type="button" disabled={!isReleased || !track.audio_url} className={cn('flex min-w-0 flex-1 items-center gap-4 px-4 py-3 rounded-xl group transition-colors text-left', isReleased && track.audio_url ? 'cursor-pointer' : 'cursor-default', isLocked && 'opacity-60')} onClick={() => isReleased && track.audio_url && handlePlay(track)} aria-label={isReleased && track.audio_url ? `Play track ${track.track_number}: ${track.title}` : isLocked ? `${track.title}, unreleased` : `${track.title}, teaser available`}>
                            {isReleased && track.audio_url && <svg className="w-4 h-4 text-violet-400 hidden group-hover:block flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                            {isLocked && <Lock aria-hidden="true" className="w-4 h-4 flex-shrink-0" />}
                            <span className="text-[#72727E] text-sm w-5 text-center">{String(track.track_number).padStart(2, '0')}</span>
                            <span className="release-track__title text-sm flex-1">{track.title}{hasTeaser && <span className="ml-2 inline-flex rounded-sm border border-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-[var(--accent)]">TEASER</span>}</span>
                            {!isLocked && track.duration && <span className="text-[#72727E] text-xs">{track.duration}</span>}
                            {isLocked && <span className="text-[#72727E] text-xs uppercase tracking-wider">Unreleased</span>}
                          </button>
                          {!isLocked && <button type="button" onClick={() => { setOpenTrackId(threadIsOpen ? null : track.id); setReplyToCommentId(null); setTrackCommentText(''); }} aria-expanded={threadIsOpen} aria-controls={`track-thread-${track.id}`} className="shrink-0 px-3 py-2 text-xs text-[#A8A8B3] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">{trackThread.length} {trackThread.length === 1 ? 'comment' : 'comments'}</button>}
                          {!isLocked && <button type="button" onClick={() => setOpenLyricsTrackId(track.id)} aria-label={`Show lyrics for ${track.title}`} className="inline-flex shrink-0 items-center gap-1.5 px-2 py-2 text-xs text-[var(--ink-muted)] hover:text-[var(--accent)]"><BookOpenText aria-hidden="true" className="h-4 w-4" />Lyrics</button>}
                          {isReleased && <button type="button" disabled={!track.audio_url} onClick={() => addTrackToQueue(track)} aria-label={`Add ${track.title} to queue`} className="shrink-0 p-2 text-[#A8A8B3] hover:text-white disabled:opacity-50"><ListPlus aria-hidden="true" className="w-4 h-4" /></button>}
                        </div>
                        {hasTeaser && track.teaser_audio_url && (
                          <div className="ml-4 sm:ml-9 mb-3">
                            <TeaserPlayer
                              teaserUrl={track.teaser_audio_url}
                              trackTitle={track.title}
                              durationSeconds={(track.teaser_end_seconds ?? 0) - (track.teaser_start_seconds ?? 0)}
                            />
                          </div>
                        )}
                        {!isLocked && threadIsOpen && <section id={`track-thread-${track.id}`} className="ml-4 sm:ml-9 mb-4 rounded-xl border border-white/8 bg-white/[0.02] p-4" aria-label={`Comments on ${track.title}`}>
                          {trackThread.length === 0 ? <p className="text-sm text-[#72727E] mb-4">No comments yet. Be the first to comment.</p> : (
                            <div className="space-y-4 mb-5">
                              {topLevelComments.map(comment => {
                                const replies = trackThread.filter(reply => reply.parent_comment_id === comment.id);
                                const displayName = comment.profile?.display_name || comment.profile?.username || 'Fan';
                                return <div key={comment.id} className="space-y-3">
                                  <article className="flex gap-3">
                                    <Avatar src={comment.profile?.avatar_url} name={displayName} size={32} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-sm font-medium text-white">{displayName}</span><time className="text-xs text-[#72727E]" dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div>
                                      <p className="text-sm text-[#A8A8B3] mt-1 whitespace-pre-wrap">{comment.body}</p>
                                      <div className="flex gap-3 mt-2">{user && <button type="button" onClick={() => { setReplyToCommentId(comment.id); setTrackCommentText(''); }} className="text-xs text-violet-300 hover:text-white">Reply</button>}{isAdmin && <button type="button" onClick={() => void deleteTrackComment(track.id, comment.id)} className="text-xs text-red-300 hover:text-red-200">Delete</button>}</div>
                                    </div>
                                  </article>
                                  {replies.map(reply => {
                                    const replyName = reply.profile?.display_name || reply.profile?.username || 'Fan';
                                    return <article key={reply.id} className="ml-8 flex gap-3 border-l border-white/10 pl-3">
                                      <Avatar src={reply.profile?.avatar_url} name={replyName} size={28} />
                                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-sm font-medium text-white">{replyName}</span><time className="text-xs text-[#72727E]" dateTime={reply.created_at}>{new Date(reply.created_at).toLocaleString()}</time></div><p className="text-sm text-[#A8A8B3] mt-1 whitespace-pre-wrap">{reply.body}</p>{isAdmin && <button type="button" onClick={() => void deleteTrackComment(track.id, reply.id)} className="text-xs text-red-300 hover:text-red-200 mt-2">Delete</button>}</div>
                                    </article>;
                                  })}
                                </div>;
                              })}
                            </div>
                          )}
                          {user ? <form onSubmit={event => { event.preventDefault(); void submitTrackComment(track.id); }} className="space-y-3">
                            {replyToCommentId && <div className="flex items-center justify-between text-xs text-[#A8A8B3]"><span>Replying to comment</span><button type="button" onClick={() => setReplyToCommentId(null)} className="text-violet-300 hover:text-white">Cancel</button></div>}
                            <label htmlFor={`track-comment-${track.id}`} className="sr-only">Write a comment on {track.title}</label>
                            <textarea id={`track-comment-${track.id}`} maxLength={2000} value={trackCommentText} onChange={event => setTrackCommentText(event.target.value)} rows={2} placeholder={replyToCommentId ? 'Write a reply...' : 'Add your thoughts...'} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm resize-none focus:outline-none focus:border-violet-500/50" />
                            <button type="submit" disabled={!trackCommentText.trim() || trackCommentSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{trackCommentSubmitting && <LoadingSpinner />}{trackCommentSubmitting ? 'Posting…' : replyToCommentId ? 'Post reply' : 'Post comment'}</button>
                          </form> : <p className="text-sm text-[#72727E]"> <Link to="/auth" className="text-violet-300 hover:text-white">Sign in</Link> to join the thread.</p>}
                        </section>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {lyricsTrack && (
          <div className="fixed inset-0 z-[90] flex items-end bg-black/50 md:items-stretch md:justify-end" onClick={() => setOpenLyricsTrackId(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="track-lyrics-title"
              onClick={event => event.stopPropagation()}
              className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-xl border border-[var(--rule)] bg-[var(--base)] text-[var(--ink)] md:max-h-none md:h-full md:w-full md:max-w-md md:rounded-none md:border-y-0 md:border-r-0"
            >
              <header className="flex items-center justify-between gap-4 border-b border-[var(--rule)] px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">Lyrics</p>
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 id="track-lyrics-title" className="truncate text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>{lyricsTrack.title}</h2>
                  </div>
                  {isThisTrackPlaying ? (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)]" role="status">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" aria-hidden="true" />
                      Now playing
                    </span>
                  ) : (
                    <button type="button" onClick={() => playLyricsTrack(lyricsTrack)} className="mt-1 text-xs text-[var(--accent)] hover:underline">Play {lyricsTrack.title} to sync lyrics</button>
                  )}
                </div>
                <button type="button" onClick={() => setOpenLyricsTrackId(null)} aria-label="Close lyrics" className="rounded p-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"><X aria-hidden="true" size={20} /></button>
              </header>
              <SyncedLyrics
                synced={lyricsTrack.lyrics_synced || null}
                plainLyrics={lyricsTrack.lyrics}
                trackId={lyricsTrack.id}
                onStartTrack={lyricsTrack.audio_url ? () => playLyricsTrack(lyricsTrack) : undefined}
              />
            </section>
          </div>
        )}

        <section className="mt-14 border-t border-white/5 pt-10" aria-labelledby="share-release-title">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">Pass it along</p>
          <h2 id="share-release-title" className="text-xl font-semibold text-white mb-5">Share this release</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void copyReleaseLink()} className="inline-flex items-center gap-2 rounded-lg glass border border-white/10 px-4 py-2.5 text-sm text-white hover:border-violet-400/40"><Copy className="w-4 h-4" /> Copy link</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${release.title} — Cam Leinad ${window.location.origin}/music/${release.slug}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg glass border border-white/10 px-4 py-2.5 text-sm text-white hover:border-violet-400/40"><Share2 className="w-4 h-4" /> Share on WhatsApp</a>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <button type="button" onClick={() => void nativeShareRelease()} className="inline-flex items-center gap-2 rounded-lg glass border border-white/10 px-4 py-2.5 text-sm text-white hover:border-violet-400/40">Share</button>}
          </div>
          <p className="text-xs text-[#72727E] mt-4">For Instagram, copy the link and paste it in your story.</p>
        </section>

        <div className="mt-16 border-t border-white/5 pt-12">
          <h2 className="text-xl font-semibold text-white mb-6">Comments</h2>
          {user ? (
            <div className="flex gap-4 mb-8">
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Share your thoughts..." rows={3} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm resize-none focus:outline-none focus:border-violet-500/50" />
              <button onClick={submitComment} disabled={!commentText.trim() || commentSubmitting} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium self-end transition-colors disabled:opacity-40">
                <span className="flex items-center gap-2">{commentSubmitting && <LoadingSpinner />}{commentSubmitting ? 'Posting…' : 'Post'}</span>
              </button>
            </div>
          ) : (
            <p className="text-[#72727E] text-sm mb-6"><Link to="/auth" className="text-violet-400 hover:text-violet-300">Sign in</Link> to leave a comment.</p>
          )}
          {comments.length === 0 ? (
            <p className="text-[#72727E] text-sm">No comments yet. Be the first!</p>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="glass rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-400">{comment.profile?.username?.[0]?.toUpperCase() || '?'}</div>
                    <span className="text-sm font-medium text-white">{comment.profile?.display_name || comment.profile?.username || 'Fan'}</span>
                    <span className="text-xs text-[#72727E]">{new Date(comment.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-[#A8A8B3]">{comment.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
