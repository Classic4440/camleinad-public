import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpRight, AudioLines, Pause, Play, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProducerPack } from '@/types';

function AudioPreview({ src, title }: { src: string | null; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
      />
      <button
        type="button"
        onClick={togglePlayback}
        disabled={!src}
        aria-label={`${playing ? 'Pause' : 'Play'} ${title} preview`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B6FF00] text-[#121212] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? <Pause aria-hidden="true" className="h-4 w-4 fill-current" /> : <Play aria-hidden="true" className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-white/45">
          <span>{src ? formatTime(currentTime) : 'NO PREVIEW'}</span>
          <span>{src ? formatTime(duration) : '—'}</span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          disabled={!src || !duration}
          aria-label={`Seek ${title} preview`}
          onChange={event => {
            const audio = audioRef.current;
            if (audio) audio.currentTime = Number(event.target.value);
          }}
          className="h-1 w-full cursor-pointer accent-[#B6FF00] disabled:cursor-default"
        />
      </div>
      <AudioLines aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B6FF00]/60" />
    </div>
  );
}

function PackCard({ pack, index }: { pack: ProducerPack; index: number }) {
  const gradients = [
    'from-[#243b55] via-[#141e30] to-[#0f0c29]',
    'from-[#42275a] via-[#2a1a3e] to-[#121212]',
    'from-[#134e5e] via-[#17363a] to-[#121212]',
    'from-[#5a3e1b] via-[#39280e] to-[#121212]',
  ];

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-[#191919] transition-all duration-300 hover:-translate-y-1 hover:border-[#B6FF00]/50 hover:shadow-[0_0_32px_rgba(182,255,0,0.09)]">
      <div className="relative aspect-[1.55] overflow-hidden">
        {pack.cover_url ? (
          <img src={pack.cover_url} alt={`${pack.title} cover`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradients[index % gradients.length]}`}>
            <AudioLines aria-hidden="true" className="h-14 w-14 text-white/30" strokeWidth={1} />
          </div>
        )}
        <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
          {pack.genre || 'CAM ORIGINAL'}
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="truncate text-lg font-bold text-white">{pack.title}</h3>
          <p className="mt-1 line-clamp-2 min-h-5 text-sm leading-5 text-white/50">{pack.description || 'Made in the studio. Ready for your next idea.'}</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide text-[#B6FF00]">
          <span>{pack.bpm ? `${pack.bpm} BPM` : 'BPM —'}</span>
          <span className="text-white/20">/</span>
          <span>{pack.musical_key || 'KEY —'}</span>
        </div>
        <AudioPreview src={pack.audio_preview_url} title={pack.title} />
        {pack.is_free ? (
          pack.download_url ? (
            <a
              href={pack.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#B6FF00] px-4 text-sm font-bold text-[#121212] transition-colors hover:bg-[#caff42]"
            >
              <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
              Free Download
              <ArrowUpRight aria-hidden="true" className="ml-auto h-4 w-4 opacity-60" />
            </a>
          ) : (
            <button type="button" disabled className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/10 text-sm text-white/40 disabled:cursor-not-allowed">
              Download coming soon
            </button>
          )
        ) : pack.payment_url?.trim() ? (
          <a
            href={pack.payment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#121212] transition-colors hover:bg-[#f1d58a]"
          >
            Buy for ${Number(pack.price).toFixed(2)}
            <ArrowUpRight aria-hidden="true" className="ml-auto h-4 w-4 opacity-60" />
          </a>
        ) : (
          <button type="button" disabled className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/10 text-sm text-white/40 disabled:cursor-not-allowed">
            Coming Soon
          </button>
        )}
      </div>
    </article>
  );
}

export default function ProducersCut() {
  const [packs, setPacks] = useState<ProducerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPacks() {
      const { data, error } = await supabase.from('producer_packs').select('*').order('sort_order').order('created_at', { ascending: false });
      if (!active) return;
      if (error) setLoadError(true);
      else setPacks((data || []) as ProducerPack[]);
      setLoading(false);
    }
    void loadPacks();
    return () => { active = false; };
  }, []);

  const freePacks = packs.filter(pack => pack.is_free);
  const premiumPacks = packs.filter(pack => !pack.is_free);

  function renderPackSection(title: string, eyebrow: string, items: ProducerPack[]) {
    return (
      <section className="mt-20" aria-label={title}>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#B6FF00]">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
          </div>
          <span className="font-mono text-xs text-white/35">{String(items.length).padStart(2, '0')} PACKS</span>
        </div>
        {items.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((pack, index) => <PackCard key={pack.id} pack={pack} index={index} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-white/40">
            {loading ? 'Loading packs…' : 'New sounds are in the works. Check back soon.'}
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[#121212] text-white" style={{ fontFamily: '"Inter Tight", sans-serif' }}>
      <header className="border-b border-white/[0.07]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="text-sm font-black tracking-[0.2em] text-white">CAM<span className="text-[#B6FF00]">.</span></Link>
          <nav aria-label="Producer's Cut navigation" className="flex items-center gap-5 text-xs font-medium text-white/55 sm:gap-8">
            <a href="#free-downloads" className="transition-colors hover:text-[#B6FF00]">Free Downloads</a>
            <a href="#premium-packs" className="transition-colors hover:text-[#B6FF00]">Premium Packs</a>
            <Link to="/" className="hidden transition-colors hover:text-white sm:inline">Main site <ArrowUpRight aria-hidden="true" className="ml-1 inline h-3 w-3" /></Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#181818] px-6 py-12 sm:px-12 sm:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-[#B6FF00]/[0.07] blur-[100px]" />
          <div className="relative max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#B6FF00]/25 bg-[#B6FF00]/[0.07] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#B6FF00]">
              <Sparkles aria-hidden="true" className="h-3 w-3" /> Independent sounds · made by CAM
            </div>
            <h1 className="text-4xl font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
              THE PRODUCER&apos;S <span className="text-[#B6FF00]">CUT</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/55 sm:text-lg">Beats, MIDI, and Sound Kits by CAM. Original sounds from the studio, ready for whatever you&apos;re making next.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#free-downloads" className="rounded-xl bg-[#B6FF00] px-5 py-3 text-sm font-bold text-[#121212] transition-colors hover:bg-[#caff42]">Explore the sounds</a>
              <span className="rounded-xl border border-white/10 px-5 py-3 font-mono text-xs text-white/50">FL STUDIO · CAM ORIGINALS</span>
            </div>
          </div>
        </section>

        {loadError && <p role="alert" className="mt-8 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">Couldn&apos;t load the packs. Please refresh to try again.</p>}

        <div id="free-downloads">{renderPackSection('Free Downloads', 'Take it and make something', freePacks)}</div>
        <div id="premium-packs">{renderPackSection('Premium Packs', 'For the ones who want more', premiumPacks)}</div>

        <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-6 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
          <span>THE PRODUCER&apos;S CUT · CAM</span>
          <Link to="/" className="transition-colors hover:text-[#B6FF00]">Back to camleinad.com</Link>
        </footer>
      </div>
    </main>
  );
}
