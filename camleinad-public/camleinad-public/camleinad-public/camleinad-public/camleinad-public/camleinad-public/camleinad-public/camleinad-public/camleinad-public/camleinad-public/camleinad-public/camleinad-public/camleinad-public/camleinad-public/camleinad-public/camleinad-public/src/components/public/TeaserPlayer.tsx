import { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { toast } from 'sonner';

interface TeaserPlayerProps {
  teaserUrl: string;
  trackTitle: string;
  durationSeconds?: number;
}

export default function TeaserPlayer({ teaserUrl, trackTitle, durationSeconds }: TeaserPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => toast.error('Could not play teaser'));
  }

  function handleEnded() {
    setIsPlaying(false);
    toast('Teaser ended — full track coming soon');
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        aria-label={isPlaying ? `Pause teaser for ${trackTitle}` : `Play teaser for ${trackTitle}`}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{ backgroundColor: 'var(--accent)', color: '#1A1714' }}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <audio
        ref={audioRef}
        src={teaserUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
      />
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">Preview only</span>
        {durationSeconds ? (
          <span className="text-xs text-[var(--ink-muted)]">0:{String(durationSeconds).padStart(2, '0')}</span>
        ) : null}
      </div>
    </div>
  );
}
