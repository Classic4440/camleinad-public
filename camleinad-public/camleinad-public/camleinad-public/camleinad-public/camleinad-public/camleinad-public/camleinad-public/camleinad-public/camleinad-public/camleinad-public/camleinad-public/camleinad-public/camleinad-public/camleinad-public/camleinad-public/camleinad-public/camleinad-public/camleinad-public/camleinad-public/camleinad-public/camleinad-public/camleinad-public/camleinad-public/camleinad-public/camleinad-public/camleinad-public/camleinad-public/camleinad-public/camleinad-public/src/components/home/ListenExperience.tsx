import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import SyncedLyrics from '@/components/public/SyncedLyrics';
import { usePlayer } from '@/contexts/PlayerContext';
import type { PlayerTrack } from '@/types';

interface ListenExperienceProps {
  track: PlayerTrack;
  onClose: () => void;
}

export default function ListenExperience({ track, onClose }: ListenExperienceProps) {
  const reduceMotion = useReducedMotion();
  const { state } = usePlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const closeRef = useRef(onClose);
  const isCurrentTrack = state.currentTrack?.id === track.id;

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    const canvasContext = canvas?.getContext('2d');
    if (!audio || !canvas || !canvasContext || !track.audioUrl) return;

    let context: AudioContext | null = null;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    try {
      audio.crossOrigin = 'anonymous';
      audio.src = track.audioUrl;
      context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();
      analyser.fftSize = 1024;
      silentGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(context.destination);
      analyserRef.current = analyser;
      contextRef.current = context;

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const bounds = canvas.getBoundingClientRect();
        const pixelRatio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(bounds.width * pixelRatio) || canvas.height !== Math.round(bounds.height * pixelRatio)) {
          canvas.width = Math.round(bounds.width * pixelRatio);
          canvas.height = Math.round(bounds.height * pixelRatio);
        }
        canvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        canvasContext.clearRect(0, 0, bounds.width, bounds.height);
        analyser.getByteFrequencyData(frequencyData);
        const barCount = reduceMotion ? 36 : 72;
        const gap = reduceMotion ? 4 : 3;
        const barWidth = Math.max(1, (bounds.width - gap * (barCount - 1)) / barCount);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        let bassTotal = 0;

        for (let index = 0; index < barCount; index += 1) {
          let magnitude: number;
          if (reduceMotion) {
            const start = Math.floor(index * frequencyData.length / barCount);
            const end = Math.max(start + 1, Math.floor((index + 1) * frequencyData.length / barCount));
            let total = 0;
            for (let band = start; band < end; band += 1) total += frequencyData[band];
            magnitude = total / (end - start) / 255;
          } else {
            const band = Math.floor((index / barCount) * frequencyData.length * 0.82);
            magnitude = frequencyData[band] / 255;
          }
          if (index < 8) bassTotal += magnitude;
          const barHeight = Math.max(2, magnitude * bounds.height * 0.9);
          canvasContext.globalAlpha = 0.2 + magnitude * 0.8;
          canvasContext.fillStyle = accent;
          canvasContext.fillRect(index * (barWidth + gap), (bounds.height - barHeight) / 2, barWidth, barHeight);
        }
        canvasContext.globalAlpha = 1;

        if (!reduceMotion && glowRef.current) {
          const bassEnergy = bassTotal / 8;
          glowRef.current.style.opacity = `${0.08 + bassEnergy * 0.35}`;
          glowRef.current.style.transform = `translate(-50%, -50%) scale(${0.85 + bassEnergy * 0.3})`;
        }
      };
      drawRef.current = draw;
      resizeObserver = new ResizeObserver(draw);
      resizeObserver.observe(canvas);

      if (!reduceMotion) {
        const animate = () => {
          draw();
          animationFrame = window.requestAnimationFrame(animate);
        };
        animationFrame = window.requestAnimationFrame(animate);
      }

      const closeOnEnd = () => closeRef.current();
      audio.addEventListener('ended', closeOnEnd);
      audio.addEventListener('loadedmetadata', draw);
      audio.load();

      return () => {
        audio.removeEventListener('ended', closeOnEnd);
        audio.removeEventListener('loadedmetadata', draw);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        resizeObserver?.disconnect();
        window.cancelAnimationFrame(animationFrame);
        analyserRef.current = null;
        contextRef.current = null;
        drawRef.current = null;
        void context?.close();
      };
    } catch {
      return () => {
        audio.pause();
        resizeObserver?.disconnect();
        window.cancelAnimationFrame(animationFrame);
        analyserRef.current = null;
        contextRef.current = null;
        drawRef.current = null;
        void context?.close();
      };
    }
  }, [reduceMotion, track.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isCurrentTrack) return;
    if (audio.readyState > 0 && Math.abs(audio.currentTime - state.currentTime) > 0.75) {
      audio.currentTime = state.currentTime;
    }
  }, [isCurrentTrack, state.currentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isCurrentTrack) return;
    if (state.isPlaying) {
      void contextRef.current?.resume();
      void audio.play().then(() => {
        if (reduceMotion) drawRef.current?.();
      }).catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [isCurrentTrack, reduceMotion, state.isPlaying]);

  useEffect(() => {
    if (state.currentTrack && !isCurrentTrack) closeRef.current();
  }, [isCurrentTrack, state.currentTrack]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-label={`Listening to ${track.title}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-[100] flex h-[100svh] flex-col overflow-y-auto bg-[var(--base)] px-5 pb-8 pt-16 text-[var(--ink)] sm:px-8"
    >
      <button type="button" onClick={() => closeRef.current()} aria-label="Close listening experience" className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)] sm:right-8 sm:top-8">
        <X aria-hidden="true" className="h-6 w-6" />
      </button>
      <audio ref={audioRef} aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" />
      <div ref={glowRef} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[38%] h-64 w-64 rounded-full bg-[var(--accent)] opacity-[0.08] blur-[90px]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[1100px] flex-col items-center justify-center text-left">
        <div className="relative flex min-h-60 w-full max-w-4xl items-center justify-center">
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Live audio waveform" />
          {track.artwork && <img src={track.artwork} alt={`${track.title} cover art`} width={480} height={480} className="relative z-10 h-48 w-48 object-cover sm:h-60 sm:w-60" />}
        </div>
        <p className="mb-2 mt-6 w-full max-w-2xl text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Cam Leinad</p>
        <h2 className="w-full max-w-2xl font-display text-3xl text-[var(--ink)] sm:text-4xl">{track.title}</h2>
        <div className="mt-5 w-full max-w-2xl text-left">
          <SyncedLyrics synced={track.syncedLyrics || null} plainLyrics={track.lyrics || null} trackId={track.id} compact />
        </div>
      </div>
    </motion.section>
  );
}
