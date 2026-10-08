import { useRef, useState } from 'react';
import { ClipboardPaste, FileDown, Pause, Play, RotateCcw, Save, WandSparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SyncedLine } from '@/lib/lyrics';
import { distributeLyrics, normalizePlainLyrics, parseTimedLyrics, syncedToPlain } from '@/lib/lyrics';

interface LyricsEditorProps {
  trackTitle: string;
  audioUrl: string;
  initialLyrics: string | null;
  initialSynced: SyncedLine[] | null;
  onSave: (lyrics: string, synced: SyncedLine[] | null) => Promise<void>;
  onCancel: () => void;
}

function linesWithTimes(plain: string, previous: SyncedLine[] = []): SyncedLine[] {
  return plain.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => ({
    time: previous[index]?.time ?? -1,
    line,
  }));
}

function formatTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const centiseconds = Math.floor((time % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export default function LyricsEditor({ trackTitle, audioUrl, initialLyrics, initialSynced, onSave, onCancel }: LyricsEditorProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [plainLyrics, setPlainLyrics] = useState(() => {
    const input = initialLyrics || '';
    const parsed = parseTimedLyrics(input);
    return parsed ? syncedToPlain(parsed) : input;
  });
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>(() => {
    const parsed = parseTimedLyrics(initialLyrics || '');
    const initial = initialSynced?.length ? initialSynced : parsed;
    return initial || linesWithTimes(initialLyrics || '');
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lrcPasteOpen, setLrcPasteOpen] = useState(false);
  const [lrcPasteText, setLrcPasteText] = useState('');

  function updatePlainLyrics(value: string) {
    setPlainLyrics(value);
    setSyncedLines(current => linesWithTimes(value, current));
  }

  function applyLrc(input: string): boolean {
    const parsed = parseTimedLyrics(input);
    if (!parsed?.some(line => line.time >= 0)) return false;
    const lines = [...parsed].sort((left, right) => left.time - right.time);
    setSyncedLines(lines);
    setPlainLyrics(syncedToPlain(lines));
    return true;
  }

  function handleLrcImport() {
    if (!applyLrc(lrcPasteText)) {
      toast.error('No timestamps found in pasted text.');
      return;
    }
    setLrcPasteOpen(false);
    setLrcPasteText('');
  }

  function handlePlainLyricsBlur() {
    if (!/^\s*\[\d+:\d{2}(?:\.\d+)?\]/.test(plainLyrics)) return;
    applyLrc(plainLyrics);
  }

  function exportLrc() {
    const timedLines = syncedLines
      .filter(line => Number.isFinite(line.time) && line.time >= 0)
      .sort((left, right) => left.time - right.time);
    if (!timedLines.length) {
      toast.error('No timestamps to export.');
      return;
    }
    const content = timedLines.map(({ time, line }) => {
      const totalCentiseconds = Math.round(time * 100);
      const minutes = Math.floor(totalCentiseconds / 6000);
      const seconds = Math.floor((totalCentiseconds % 6000) / 100);
      const centiseconds = totalCentiseconds % 100;
      return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}] ${line}`;
    }).join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${trackTitle.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'lyrics'}.lrc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateLineTime(index: number, value: string) {
    const time = value === '' ? -1 : Number(value);
    if (time !== -1 && !Number.isFinite(time)) return;
    setSyncedLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, time } : line));
  }

  function tapCurrentTime() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const nextIndex = syncedLines.findIndex(line => line.time < 0);
    if (nextIndex < 0) return;
    setSyncedLines(current => current.map((line, index) => index === nextIndex ? { ...line, time: Math.round(audio.currentTime * 100) / 100 } : line));
  }

  function autoDistribute() {
    const duration = audioRef.current?.duration ?? 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      setAudioDuration(0);
      return;
    }
    setAudioDuration(duration);
    const lines = distributeLyrics(plainLyrics, duration);
    setSyncedLines(lines);
    setPlainLyrics(syncedToPlain(lines));
  }

  function clearTimestamps() {
    setSyncedLines(current => current.map(line => ({ ...line, time: -1 })));
  }

  async function saveLyrics() {
    const lyrics = normalizePlainLyrics(plainLyrics);
    const lines = linesWithTimes(lyrics, syncedLines);
    setSaving(true);
    try {
      await onSave(lyrics, lines.some(line => line.time >= 0) ? lines : null);
    } catch {
      toast.error('Could not save lyrics. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => undefined);
    else audio.pause();
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--base)] text-[var(--ink)]" role="dialog" aria-modal="true" aria-labelledby="lyrics-editor-title">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--rule)] px-4 py-3 sm:px-8">
        <h2 id="lyrics-editor-title" className="min-w-0 truncate text-xl sm:text-2xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>Edit Lyrics — {trackTitle}</h2>
        <button type="button" onClick={onCancel} aria-label="Close lyrics editor" title="Close lyrics editor" className="rounded p-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"><X aria-hidden="true" size={20} /></button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 md:grid-cols-2 md:gap-8 md:px-8 md:py-6">
        <section className="flex min-h-[16rem] flex-col gap-3" aria-label="Plain lyrics">
          <label htmlFor="plain-lyrics" className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Plain lyrics</label>
          <textarea
            id="plain-lyrics"
            value={plainLyrics}
            onChange={event => updatePlainLyrics(event.target.value)}
            onBlur={handlePlainLyricsBlur}
            placeholder="Enter one lyric line per row"
            className="min-h-[16rem] flex-1 resize-y rounded border border-[var(--rule)] bg-white/40 p-4 text-sm leading-7 text-[var(--ink)] outline-none focus:border-[var(--accent)] md:resize-none"
          />
        </section>

        <section className="flex min-h-[16rem] flex-col" aria-label="Synced lyric lines">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Line timings</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setLrcPasteOpen(true)} className="inline-flex items-center gap-1.5 rounded border border-[var(--rule)] px-2.5 py-1.5 text-xs hover:border-[var(--accent)]"><ClipboardPaste size={14} aria-hidden="true" />Paste LRC</button>
              <button type="button" onClick={exportLrc} disabled={!syncedLines.some(line => Number.isFinite(line.time) && line.time >= 0)} className="inline-flex items-center gap-1.5 rounded border border-[var(--rule)] px-2.5 py-1.5 text-xs hover:border-[var(--accent)] disabled:opacity-40"><FileDown size={14} aria-hidden="true" />Export LRC</button>
              <button type="button" onClick={autoDistribute} disabled={!Number.isFinite(audioDuration) || audioDuration <= 0 || !plainLyrics.trim()} className="inline-flex items-center gap-1.5 rounded border border-[var(--rule)] px-2.5 py-1.5 text-xs hover:border-[var(--accent)] disabled:opacity-40"><WandSparkles size={14} aria-hidden="true" />Auto-distribute</button>
              {(!Number.isFinite(audioDuration) || audioDuration <= 0) && <span className="self-center text-xs text-[var(--ink-muted)]">Wait for audio to load</span>}
              <button type="button" onClick={clearTimestamps} className="inline-flex items-center gap-1.5 rounded border border-[var(--rule)] px-2.5 py-1.5 text-xs hover:border-[var(--accent)]"><RotateCcw size={14} aria-hidden="true" />Clear timestamps</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {syncedLines.length ? syncedLines.map((line, index) => (
              <div key={`${index}-${line.line}`} className="flex items-center gap-3 rounded border border-[var(--rule)] bg-white/30 px-3 py-2">
                <label className="sr-only" htmlFor={`lyric-time-${index}`}>Timestamp for {line.line}</label>
                <input
                  id={`lyric-time-${index}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.time < 0 ? '' : line.time}
                  onChange={event => updateLineTime(index, event.target.value)}
                  placeholder="--:--"
                  className="w-24 shrink-0 rounded border border-[var(--rule)] bg-[var(--base)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--accent)]"
                />
                <p className="min-w-0 flex-1 text-sm">{line.line}</p>
              </div>
            )) : <p className="text-sm text-[var(--ink-muted)]">Add lyrics to create timed lines.</p>}
          </div>
        </section>
      </main>

      <footer className="flex shrink-0 flex-col gap-3 border-t border-[var(--rule)] px-4 py-3 sm:flex-row sm:items-center sm:px-8">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={event => {
            const duration = event.currentTarget.duration;
            setAudioDuration(Number.isFinite(duration) && duration > 0 ? duration : 0);
          }}
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause track' : 'Play track'} className="rounded-full bg-[var(--accent)] p-2 text-white"><span>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</span></button>
          <span className="font-mono text-sm tabular-nums" aria-live="off">{formatTime(currentTime)}</span>
          <button type="button" onClick={tapCurrentTime} disabled={!isPlaying || syncedLines.every(line => line.time >= 0)} className="rounded bg-[var(--accent)] px-6 py-2 font-semibold tracking-wider text-white disabled:opacity-40">TAP</button>
        </div>
        <div className="flex justify-end gap-2 sm:ml-auto">
          <button type="button" onClick={onCancel} className="rounded border border-[var(--rule)] px-4 py-2 text-sm hover:border-[var(--accent)]">Cancel</button>
          <button type="button" onClick={() => void saveLyrics()} disabled={saving} className="inline-flex items-center gap-2 rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} aria-hidden="true" />{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </footer>

      {lrcPasteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLrcPasteOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="paste-lrc-title" className="w-full max-w-lg rounded border border-[var(--rule)] bg-[var(--base)] p-5 text-[var(--ink)] shadow-xl">
            <h3 id="paste-lrc-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Paste LRC</h3>
            <textarea
              autoFocus
              value={lrcPasteText}
              onChange={event => setLrcPasteText(event.target.value)}
              placeholder="[00:12.40] Paste timestamped lyrics"
              className="min-h-48 w-full resize-y rounded border border-[var(--rule)] bg-white/40 p-3 font-mono text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setLrcPasteOpen(false)} className="rounded border border-[var(--rule)] px-3 py-2 text-sm hover:border-[var(--accent)]">Cancel</button>
              <button type="button" onClick={handleLrcImport} className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white">Import LRC</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
