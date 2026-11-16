import React, { createContext, useContext, useReducer, useRef, useEffect, useState } from 'react';
import type { PlayerTrack } from '@/types';
import { getAudioUrl } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface PlayerState {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  repeatMode: 'none' | 'one' | 'all';
  isExpanded: boolean;
  showLyrics: boolean;
}

type PlayerAction =
  | { type: 'PLAY_TRACK'; track: PlayerTrack; queue?: PlayerTrack[] }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SET_TIME'; time: number }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'TOGGLE_REPEAT' }
  | { type: 'TOGGLE_EXPANDED' }
  | { type: 'TOGGLE_LYRICS' }
  | { type: 'ADD_TO_QUEUE'; track: PlayerTrack }
  | { type: 'SET_QUEUE'; queue: PlayerTrack[] }
  | { type: 'REMOVE_FROM_QUEUE'; trackId: string }
  | { type: 'REORDER_QUEUE'; fromIndex: number; toIndex: number };

const initialState: PlayerState = {
  currentTrack: null,
  queue: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  isShuffle: false,
  repeatMode: 'none',
  isExpanded: false,
  showLyrics: false,
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'PLAY_TRACK':
      return {
        ...state,
        currentTrack: action.track,
        queue: action.queue || state.queue,
        isPlaying: true,
        currentTime: 0,
        showLyrics: false,
      };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };
    case 'NEXT': {
      if (!state.queue.length) return state;
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      let nextIdx = idx + 1;
      if (state.isShuffle) nextIdx = Math.floor(Math.random() * state.queue.length);
      if (nextIdx >= state.queue.length) {
        if (state.repeatMode === 'all') nextIdx = 0;
        else return { ...state, isPlaying: false };
      }
      return { ...state, currentTrack: state.queue[nextIdx], currentTime: 0, isPlaying: true };
    }
    case 'PREV': {
      if (state.currentTime > 3) return { ...state, currentTime: 0 };
      if (!state.queue.length) return state;
      const idx = state.queue.findIndex(t => t.id === state.currentTrack?.id);
      const prevIdx = Math.max(0, idx - 1);
      return { ...state, currentTrack: state.queue[prevIdx], currentTime: 0, isPlaying: true };
    }
    case 'SET_TIME': return { ...state, currentTime: action.time };
    case 'SET_DURATION': return { ...state, duration: action.duration };
    case 'SET_VOLUME': return { ...state, volume: action.volume, isMuted: action.volume === 0 };
    case 'TOGGLE_MUTE': return state.isMuted
      ? { ...state, isMuted: false, volume: state.volume || 0.8 }
      : { ...state, isMuted: true };
    case 'TOGGLE_SHUFFLE': return { ...state, isShuffle: !state.isShuffle };
    case 'TOGGLE_REPEAT': {
      const modes: PlayerState['repeatMode'][] = ['none', 'all', 'one'];
      const idx = modes.indexOf(state.repeatMode);
      return { ...state, repeatMode: modes[(idx + 1) % modes.length] };
    }
    case 'TOGGLE_EXPANDED': return { ...state, isExpanded: !state.isExpanded };
    case 'TOGGLE_LYRICS': return { ...state, showLyrics: !state.showLyrics };
    case 'ADD_TO_QUEUE':
      return state.queue.some(track => track.id === action.track.id) ? state : { ...state, queue: [...state.queue, action.track] };
    case 'SET_QUEUE': return { ...state, queue: action.queue };
    case 'REMOVE_FROM_QUEUE': return { ...state, queue: state.queue.filter(track => track.id !== action.trackId) };
    case 'REORDER_QUEUE': {
      if (action.fromIndex === action.toIndex || action.fromIndex < 0 || action.toIndex < 0 || action.fromIndex >= state.queue.length || action.toIndex >= state.queue.length) return state;
      const queue = [...state.queue];
      const [track] = queue.splice(action.fromIndex, 1);
      queue.splice(action.toIndex, 0, track);
      return { ...state, queue };
    }
    default: return state;
  }
}

interface PlayerContextType {
  state: PlayerState;
  dispatch: React.Dispatch<PlayerAction>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  queueOpen: boolean;
  toggleQueue: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

function loadPlayerPreferences(): PlayerState {
  try {
    const stored = localStorage.getItem('cam-player-preferences');
    if (!stored) return initialState;
    const preferences: unknown = JSON.parse(stored);
    if (!preferences || typeof preferences !== 'object') return initialState;
    const saved = preferences as Partial<PlayerState>;
    return {
      ...initialState,
      volume: typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : initialState.volume,
      isMuted: typeof saved.isMuted === 'boolean' ? saved.isMuted : initialState.isMuted,
      isShuffle: typeof saved.isShuffle === 'boolean' ? saved.isShuffle : initialState.isShuffle,
      repeatMode: saved.repeatMode === 'all' || saved.repeatMode === 'one' ? saved.repeatMode : 'none',
    };
  } catch {
    return initialState;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState, loadPlayerPreferences);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activePlaybackRef = useRef<{ trackId: string; playedAt: string; startedAt: number } | null>(null);
  const userIdRef = useRef<string | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const repeatModeRef = useRef(state.repeatMode);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueHydrated, setQueueHydrated] = useState(false);
  const [queueSyncReady, setQueueSyncReady] = useState(false);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => { userIdRef.current = user?.id || null; }, [user?.id]);
  useEffect(() => { trackIdRef.current = state.currentTrack?.id || null; }, [state.currentTrack?.id]);
  useEffect(() => { repeatModeRef.current = state.repeatMode; }, [state.repeatMode]);

  useEffect(() => {
    try {
      localStorage.setItem('cam-player-preferences', JSON.stringify({
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        volume: state.volume,
        isMuted: state.isMuted,
      }));
    } catch { /* Preferences remain available for the current session. */ }
  }, [state.isShuffle, state.repeatMode, state.volume, state.isMuted]);

  useEffect(() => {
    try {
      const storedQueue = localStorage.getItem('cam-play-queue');
      const value: unknown = storedQueue ? JSON.parse(storedQueue) : [];
      if (Array.isArray(value)) dispatch({ type: 'SET_QUEUE', queue: value as PlayerTrack[] });
    } catch {
      try { localStorage.removeItem('cam-play-queue'); } catch { /* Storage may be unavailable. */ }
    }
    setQueueHydrated(true);
  }, []);

  useEffect(() => {
    if (!queueHydrated || authLoading) return;
    let active = true;
    setQueueSyncReady(false);
    async function loadUserQueue() {
      if (!user) { setQueueSyncReady(true); return; }
      const { data, error } = await supabase.from('user_queues').select('items').eq('user_id', user.id).maybeSingle();
      if (!active) return;
      if (!error && data && Array.isArray(data.items)) dispatch({ type: 'SET_QUEUE', queue: data.items as PlayerTrack[] });
      setQueueSyncReady(true);
    }
    void loadUserQueue();
    return () => { active = false; };
  }, [authLoading, queueHydrated, user]);

  useEffect(() => {
    if (!queueHydrated || !queueSyncReady || authLoading) return;
    try { localStorage.setItem('cam-play-queue', JSON.stringify(state.queue)); } catch { /* Guest queue remains in memory. */ }
    if (user) {
      void supabase.from('user_queues').upsert({ user_id: user.id, items: state.queue, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }
  }, [authLoading, queueHydrated, queueSyncReady, state.queue, user]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    function savePlayedSegment() {
      const segment = activePlaybackRef.current;
      activePlaybackRef.current = null;
      const userId = userIdRef.current;
      if (!segment || !userId) return;
      const secondsPlayed = Math.max(0, Math.floor(audio.currentTime - segment.startedAt));
      if (secondsPlayed < 1) return;
      void supabase.from('plays').insert({
        user_id: userId,
        track_id: segment.trackId,
        played_at: segment.playedAt,
        seconds_played: secondsPlayed,
      });
    }

    audio.addEventListener('timeupdate', () => {
      dispatch({ type: 'SET_TIME', time: audio.currentTime });
    });
    audio.addEventListener('loadedmetadata', () => {
      dispatch({ type: 'SET_DURATION', duration: audio.duration });
    });
    audio.addEventListener('ended', () => {
      savePlayedSegment();
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0;
        dispatch({ type: 'SET_TIME', time: 0 });
        audio.play().catch(() => toast.error('Could not restart this track. Try again.'));
      } else {
        dispatch({ type: 'NEXT' });
      }
    });

    function handlePlay() {
      if (!activePlaybackRef.current && trackIdRef.current) {
        activePlaybackRef.current = { trackId: trackIdRef.current, playedAt: new Date().toISOString(), startedAt: audio.currentTime };
      }
      dispatch({ type: 'SET_PLAYING', playing: true });
    }

    function handlePause() {
      savePlayedSegment();
      dispatch({ type: 'SET_PLAYING', playing: false });
    }

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', () => toast.error('Could not play this track. Try again.'));

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const audioUrl = getAudioUrl(state.currentTrack?.audioUrl);
    if (audioUrl) {
      audio.src = audioUrl;
      audio.load();
    }
  }, [state.currentTrack?.id, state.currentTrack?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack?.audioUrl) return;
    if (state.isPlaying) audio.play().catch(() => toast.error('Could not start playback. Try again.'));
    else audio.pause();
  }, [state.isPlaying, state.currentTrack?.id, state.currentTrack?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.isMuted ? 0 : state.volume;
    }
  }, [state.volume, state.isMuted]);

  function playTrack(track: PlayerTrack, queue?: PlayerTrack[]) {
    dispatch({ type: 'PLAY_TRACK', track, queue });
  }

  function togglePlay() {
    dispatch({ type: 'TOGGLE_PLAY' });
  }

  function seekTo(time: number) {
    if (audioRef.current) audioRef.current.currentTime = time;
    dispatch({ type: 'SET_TIME', time });
  }

  function toggleQueue() {
    setQueueOpen(open => !open);
  }

  return (
    <PlayerContext.Provider value={{ state, dispatch, audioRef, playTrack, togglePlay, seekTo, queueOpen, toggleQueue }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider');
  return ctx;
}
