import { useEffect, useState } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Heart, ListMusic, MoveDown, MoveUp, Trash2, X } from 'lucide-react';
import SyncedLyrics from '@/components/public/SyncedLyrics';
import { toast } from 'sonner';

function formatTime(s: number) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function MusicPlayer() {
  const { state, dispatch, seekTo, playTrack, queueOpen, toggleQueue } = usePlayer();
  const { user } = useAuth();
  const { currentTrack, isPlaying, currentTime, duration, volume, isMuted, isShuffle, repeatMode, isExpanded, showLyrics } = state;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setIsFavorite(false);
    if (!user || !currentTrack) return () => { active = false; };
    void supabase.from('favorites').select('id').eq('user_id', user.id).eq('track_id', currentTrack.id).maybeSingle()
      .then(({ data }) => { if (active) setIsFavorite(!!data); });
    return () => { active = false; };
  }, [currentTrack, user]);

  async function toggleFavorite() {
    if (!currentTrack || favoriteSaving) return;
    if (!user) { toast.error('Sign in to save favorite tracks.'); return; }
    setFavoriteSaving(true);
    const result = isFavorite
      ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('track_id', currentTrack.id)
      : await supabase.from('favorites').insert({ user_id: user.id, track_id: currentTrack.id });
    setFavoriteSaving(false);
    if (result.error) { toast.error('Could not update favorites. Try again.'); return; }
    setIsFavorite(!isFavorite);
  }

  if (!currentTrack && !state.queue.length) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {queueOpen && <>
        <button type="button" aria-label="Close queue" onClick={toggleQueue} className="player-queue__overlay" />
        <aside
          aria-label="Play queue"
          className="player-queue fixed z-[60] right-0 top-0 bottom-0 w-full max-w-sm glass-strong border-l border-white/10 flex flex-col max-md:top-auto max-md:left-0 max-md:max-w-none max-md:max-h-[78vh] max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
            <div><h2 className="text-lg font-semibold text-white">Queue</h2><p className="text-xs text-[#A8A8B3]">{state.queue.length} tracks</p></div>
            <button type="button" onClick={toggleQueue} aria-label="Close queue" className="p-2 rounded-lg text-[#A8A8B3] hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          {state.queue.length ? <ol className="overflow-y-auto p-3 space-y-2">
            {state.queue.map((track, index) => <li key={`${track.id}-${index}`} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => {
              if (dragIndex !== null) dispatch({ type: 'REORDER_QUEUE', fromIndex: dragIndex, toIndex: index });
              setDragIndex(null);
            }} onDragEnd={() => setDragIndex(null)} className={cn('glass rounded-xl border border-white/10 p-3 flex items-center gap-3', dragIndex === index && 'opacity-50')}>
              <span aria-hidden="true" className="cursor-grab text-[#72727E] select-none">⋮⋮</span>
              {track.artwork ? <img src={track.artwork} alt="" width={44} height={44} loading="lazy" className="w-11 h-11 rounded-lg object-cover" /> : <div className="w-11 h-11 rounded-lg bg-white/5" />}
              <div className="min-w-0 flex-1"><p className="text-sm text-white truncate">{track.title}</p><p className="text-xs text-[#A8A8B3] truncate">{track.artist}</p></div>
              <div className="flex flex-col gap-1">
                <button type="button" disabled={index === 0} aria-label={`Move ${track.title} up`} onClick={() => dispatch({ type: 'REORDER_QUEUE', fromIndex: index, toIndex: index - 1 })} className="text-[#A8A8B3] hover:text-white disabled:opacity-30"><MoveUp className="w-4 h-4" /></button>
                <button type="button" disabled={index === state.queue.length - 1} aria-label={`Move ${track.title} down`} onClick={() => dispatch({ type: 'REORDER_QUEUE', fromIndex: index, toIndex: index + 1 })} className="text-[#A8A8B3] hover:text-white disabled:opacity-30"><MoveDown className="w-4 h-4" /></button>
              </div>
              <button type="button" disabled={!track.audioUrl} aria-label={`Play ${track.title}`} onClick={() => playTrack(track, state.queue)} className="text-violet-300 hover:text-white disabled:opacity-30">▶</button>
              <button type="button" aria-label={`Remove ${track.title} from queue`} onClick={() => dispatch({ type: 'REMOVE_FROM_QUEUE', trackId: track.id })} className="text-[#72727E] hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
            </li>)}
          </ol> : <div className="p-8 text-center"><ListMusic aria-hidden="true" className="mx-auto w-8 h-8 text-[#72727E] mb-3" /><p className="text-sm text-[#A8A8B3]">Your queue is empty.</p><p className="text-xs text-[#72727E] mt-1">Add tracks from a release page.</p></div>}
        </aside>
      </>}

      {/* Expanded lyrics panel */}
      {isExpanded && currentTrack && (
        <div
          className="glass-strong border-t border-white/10 overflow-hidden"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
            <div className="flex items-center gap-6">
              {currentTrack.artwork && (
                <img src={currentTrack.artwork} alt={currentTrack.title} width={96} height={96} loading="lazy" className="w-24 h-24 rounded-xl object-cover" />
              )}
              <div>
                <h3 className="text-lg font-semibold text-white">{currentTrack.title}</h3>
                <p className="text-sm text-[#A8A8B3]">{currentTrack.artist}</p>
                <p className="text-xs text-[#72727E] mt-1">{currentTrack.releaseTitle}</p>
              </div>
            </div>
            <section className="min-w-0" aria-labelledby="player-lyrics-heading">
              <div className="flex items-center justify-between gap-3 mb-3"><h3 id="player-lyrics-heading" className="text-sm font-semibold text-white">Lyrics</h3><button type="button" onClick={() => dispatch({ type: 'TOGGLE_LYRICS' })} aria-expanded={showLyrics} className="text-xs text-violet-300 hover:text-white">{showLyrics ? 'Hide lyrics' : 'Show lyrics'}</button></div>
              {showLyrics ? currentTrack.syncedLyrics?.length || currentTrack.lyrics ? <SyncedLyrics synced={currentTrack.syncedLyrics || null} plainLyrics={currentTrack.lyrics || null} trackId={currentTrack.id} compact /> : <p className="text-sm text-[#72727E]">Lyrics are not available for this track.</p> : <p className="text-sm text-[#72727E]">Open the lyrics panel to follow along.</p>}
            </section>
          </div>
        </div>
      )}

      {/* Player bar */}
      {!currentTrack ? <div className="glass-strong border-t border-white/10"><div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between"><p className="text-sm text-[#A8A8B3]">{state.queue.length} tracks in your queue</p><button type="button" onClick={toggleQueue} aria-expanded={queueOpen} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"><ListMusic className="w-4 h-4" />Queue</button></div></div> : <div className="glass-strong border-t border-white/10">
        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration || 1)}
          onChange={event => seekTo(Number(event.target.value))}
          aria-label="Seek track"
          className="block h-1 w-full cursor-pointer accent-[var(--accent)]"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          {/* Track info */}
          <div className="flex items-center gap-3 w-52 min-w-0">
            {currentTrack.artwork ? (
              <img src={currentTrack.artwork} alt="" width={40} height={40} loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex-shrink-0 flex items-center justify-center">
                <span className="text-violet-400 text-xs">♪</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentTrack.title}</p>
              <p className="text-xs text-[#A8A8B3] truncate">{currentTrack.artist}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={favoriteSaving}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className={cn('shrink-0 p-2 transition-colors disabled:opacity-50', isFavorite ? 'text-[var(--accent)]' : 'text-[#72727E] hover:text-[var(--accent)]')}
            >
              <Heart aria-hidden="true" className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-1 justify-center">
            {/* Shuffle */}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })}
              className={cn('p-1.5 rounded-lg transition-colors', isShuffle ? 'text-violet-400' : 'text-[#72727E] hover:text-white')}
              aria-label="Shuffle"
              aria-pressed={isShuffle}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>
            {/* Prev */}
            <button onClick={() => dispatch({ type: 'PREV' })} className="p-1.5 text-[#A8A8B3] hover:text-white transition-colors" aria-label="Previous">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
            {/* Play/Pause */}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black hover:bg-white/90 transition-colors shadow-lg shadow-white/20"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="w-5 h-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            {/* Next */}
            <button onClick={() => dispatch({ type: 'NEXT' })} className="p-1.5 text-[#A8A8B3] hover:text-white transition-colors" aria-label="Next">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            {/* Repeat */}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_REPEAT' })}
              className={cn('p-1.5 rounded-lg transition-colors', repeatMode !== 'none' ? 'text-violet-400' : 'text-[#72727E] hover:text-white')}
              aria-label={`Repeat ${repeatMode === 'none' ? 'off' : repeatMode}`}
              aria-pressed={repeatMode !== 'none'}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                {repeatMode === 'one'
                  ? <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
                  : <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                }
              </svg>
            </button>
          </div>

          {/* Time + Volume */}
          <div className="flex items-center gap-3 w-52 justify-end">
            <button type="button" onClick={toggleQueue} aria-label="Open play queue" aria-expanded={queueOpen} className={cn('p-1.5 rounded-lg transition-colors', queueOpen ? 'text-violet-300' : 'text-[#72727E] hover:text-white')}>
              <ListMusic className="w-4 h-4" />
            </button>
            <span className="text-xs text-[#72727E] tabular-nums hidden sm:block">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            {/* Volume */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
                className="text-[#72727E] hover:text-white transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  {isMuted ? <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                  }
                </svg>
              </button>
              <input
                type="range" min={0} max={1} step={0.05}
                value={isMuted ? 0 : volume}
                onChange={e => dispatch({ type: 'SET_VOLUME', volume: parseFloat(e.target.value) })}
                className="w-20 accent-violet-500"
                aria-label="Volume"
              />
            </div>
            {/* Expand */}
            <button
              onClick={() => dispatch({ type: 'TOGGLE_EXPANDED' })}
              className="text-[#72727E] hover:text-white transition-colors"
              aria-label="Expand player"
            >
              <svg className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} fill="currentColor" viewBox="0 0 24 24">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}
