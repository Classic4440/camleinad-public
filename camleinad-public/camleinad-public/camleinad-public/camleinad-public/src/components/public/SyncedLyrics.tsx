import { useEffect, useMemo, useRef } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { cn } from '@/lib/utils';
import { parseTimedLyrics } from '@/lib/lyrics';

interface SyncedLyricsProps {
    synced: { time: number; line: string }[] | null;
    plainLyrics: string | null;
    trackId: string;
    compact?: boolean;
    onStartTrack?: () => void;
}

export default function SyncedLyrics({ synced, plainLyrics, trackId, compact = false, onStartTrack }: SyncedLyricsProps) {
    const { state, dispatch, playTrack, togglePlay, seekTo } = usePlayer();
    const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const lines = useMemo(() => {
        const source = synced?.length ? synced : parseTimedLyrics(plainLyrics || '') || [];
        return [...source].sort((left, right) => left.time - right.time);
    }, [plainLyrics, synced]);
    const isCurrentTrack = state.currentTrack?.id === trackId;
    const currentTime = isCurrentTrack ? state.currentTime : 0;
    const activeIndex = lines.reduce((active, line, index) => line.time >= 0 && line.time <= currentTime ? index : active, -1);

    useEffect(() => {
        if (isCurrentTrack && activeIndex >= 0) {
            lineRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeIndex, isCurrentTrack]);

    function handleLineClick(time: number) {
        if (time < 0) return;
        if (!isCurrentTrack) {
            const queuedTrack = state.queue.find(track => track.id === trackId);
            if (queuedTrack) playTrack(queuedTrack, state.queue);
            else if (onStartTrack) onStartTrack();
            else return;
        } else if (!state.isPlaying) {
            togglePlay();
        }
        window.setTimeout(() => seekTo(time), 100);
    }

    if (lines.length) {
        return (
            <div className={cn('overflow-y-auto', compact ? 'max-h-44 space-y-1 pr-2' : 'flex-1 space-y-3 px-5 py-6')} aria-live="polite">
                {lines.map((line, index) => {
                    const active = index === activeIndex;
                    return (
                        <button
                            ref={element => { lineRefs.current[index] = element; }}
                            key={`${line.time}-${index}`}
                            type="button"
                            onClick={() => handleLineClick(line.time)}
                            aria-current={active ? 'true' : undefined}
                            className={cn('block w-full rounded px-2 text-left leading-relaxed transition-colors', compact ? 'py-1 text-sm' : 'py-1 text-base', line.time >= 0 && 'cursor-pointer hover:text-[var(--accent)]')}
                            style={{
                                color: active ? 'var(--accent)' : 'var(--ink-muted)',
                                opacity: active ? 1 : 0.55,
                                fontWeight: active ? 600 : 400,
                                transition: 'color 200ms ease, opacity 200ms ease',
                            }}
                        >
                            {line.line}
                        </button>
                    );
                })}
            </div>
        );
    }

    return plainLyrics?.trim()
        ? <p className={cn('whitespace-pre-line leading-relaxed', compact ? 'max-h-44 overflow-y-auto text-sm' : 'px-5 py-6 text-base')}>{plainLyrics}</p>
        : <p className={cn('text-[var(--ink-muted)]', compact ? 'text-sm' : 'px-5 py-6 text-sm')}>Lyrics coming soon.</p>;
}