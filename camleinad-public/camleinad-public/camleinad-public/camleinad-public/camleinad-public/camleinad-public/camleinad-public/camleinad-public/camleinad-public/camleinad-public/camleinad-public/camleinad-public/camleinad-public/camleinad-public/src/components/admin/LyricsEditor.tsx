import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, FileDown, Pause, Pencil, Play, RotateCcw, Save, WandSparkles, X } from 'lucide-react';
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
  if (!Number.isFinite(time) || time < 0) return '--:--.--';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const centiseconds = Math.floor((time % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function formatDockTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return '00:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return -1;
  const clockMatch = trimmed.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,2}))?$/);
  const time = clockMatch
    ? Number(clockMatch[1]) * 60 + Number(clockMatch[2]) + Number(`0.${clockMatch[3] || 0}`)
    : Number(trimmed);
  return Number.isFinite(time) && time >= 0 ? Math.round(time * 100) / 100 : null;
}

export default function LyricsEditor({ trackTitle, audioUrl, initialLyrics, initialSynced, onSave, onCancel }: LyricsEditorProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState('');
  const [showPlainLyrics, setShowPlainLyrics] = useState(false);
  const [lrcPasteOpen, setLrcPasteOpen] = useState(false);
  const [lrcPasteText, setLrcPasteText] = useState('');

  const activeLineIndex = syncedLines.findIndex(line => line.time < 0);

  useEffect(() => {
    if (activeLineIndex >= 0) {
      lineRefs.current[activeLineIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLineIndex]);

  useEffect(() => {
    function handleSpacebar(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat || !isPlaying || lrcPasteOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return;
      event.preventDefault();
      tapCurrentTime();
    }
    window.addEventListener('keydown', handleSpacebar);
    return () => window.removeEventListener('keydown', handleSpacebar);
  }, [isPlaying, lrcPasteOpen, syncedLines]);

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

  function saveEditedTime(index: number) {
    const time = parseTimeInput(editingTime);
    if (time === null) {
      toast.error('Enter a time in seconds or mm:ss.cc format.');
      return;
    }
    setSyncedLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, time } : line));
    setEditingIndex(null);
    setEditingTime('');
  }

  function beginEditTime(index: number) {
    setEditingIndex(index);
    setEditingTime(syncedLines[index].time >= 0 ? String(syncedLines[index].time) : '');
  }

  function nudgeTime(index: number, amount: number) {
    setSyncedLines(current => current.map((line, lineIndex) => {
      if (lineIndex !== index || line.time < 0) return line;
      return { ...line, time: Math.max(0, Math.round((line.time + amount) * 100) / 100) };
    }));
  }

  async function playFromTime(time: number) {
    const audio = audioRef.current;
    if (!audio || time < 0) return;
    audio.currentTime = time;
    try {
      await audio.play();
    } catch {
      toast.error('Could not play the audio preview.');
    }
  }

  function tapCurrentTime() {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    setSyncedLines(current => {
      const nextIndex = current.findIndex(line => line.time < 0);
      if (nextIndex < 0) return current;
      return current.map((line, index) => index === nextIndex
        ? { ...line, time: Math.round(audio.currentTime * 100) / 100 }
        : line);
    });
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
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        toast.error('Could not play the audio preview.');
      }
    } else {
      audio.pause();
    }
  }

  function seekAudio(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#121212] text-white" role="dialog" aria-modal="true" aria-labelledby="lyrics-editor-title">
      <header className="z-10 flex shrink-0 items-center gap-4 border-b border-white/10 bg-[#181818] px-4 py-3 sm:px-7">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-400">Lyrics Sync</p>
          <h2 id="lyrics-editor-title" className="truncate text-base font-semibold sm:text-lg">{trackTitle}</h2>
        </div>
        <button type="button" onClick={() => setShowPlainLyrics(value => !value)} className="hidden rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 transition-colors hover:border-white/25 hover:text-white sm:inline-flex">
          {showPlainLyrics ? 'Hide lyrics editor' : 'Edit plain lyrics'}
        </button>
        <button type="button" onClick={() => setLrcPasteOpen(true)} className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 transition-colors hover:border-white/25 hover:text-white sm:inline-flex">
          <ClipboardPaste size={14} aria-hidden="true" /> Paste LRC
        </button>
        <button type="button" onClick={exportLrc} disabled={!syncedLines.some(line => line.time >= 0)} aria-label="Export LRC" title="Export LRC" className="rounded-lg border border-white/10 p-2 text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40">
          <FileDown size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void saveLyrics()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
          <Save size={16} aria-hidden="true" />{saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} aria-label="Close lyrics editor" title="Close lyrics editor" className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white">
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-12 sm:px-8 sm:py-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Timed lyrics</p>
              <p className="mt-1 text-xs text-white/35">Select a timestamp to audition · Spacebar or TAP TO SYNC to mark the next line</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={autoDistribute} disabled={!audioDuration || !plainLyrics.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40">
                <WandSparkles size={14} aria-hidden="true" /> Auto-distribute
              </button>
              <button type="button" onClick={clearTimestamps} disabled={!syncedLines.some(line => line.time >= 0)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40">
                <RotateCcw size={14} aria-hidden="true" /> Clear times
              </button>
            </div>
          </div>

          {showPlainLyrics && (
            <section aria-label="Plain lyrics editor" className="mb-6 rounded-xl border border-white/10 bg-[#181818] p-4">
              <label htmlFor="plain-lyrics" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/45">Plain lyrics · one line per row</label>
              <textarea
                id="plain-lyrics"
                value={plainLyrics}
                onChange={event => updatePlainLyrics(event.target.value)}
                onBlur={handlePlainLyricsBlur}
                placeholder="Enter one lyric line per row"
                className="min-h-36 w-full resize-y rounded-lg border border-white/10 bg-[#101010] p-3 text-sm leading-7 text-white outline-none placeholder:text-white/25 focus:border-blue-500"
              />
            </section>
          )}

          <div className="space-y-2.5">
            {syncedLines.length ? syncedLines.map((line, index) => {
              const isActive = index === activeLineIndex;
              return (
                <div
                  key={`${index}-${line.line}`}
                  ref={element => { lineRefs.current[index] = element; }}
                  className={`flex min-h-[4.25rem] items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors sm:gap-3 sm:px-4 ${
                    isActive
                      ? 'border-blue-500/60 bg-[#14233b] shadow-[inset_3px_0_0_#3b82f6]'
                      : 'border-white/[0.07] bg-[#191919] hover:bg-[#202020]'
                  }`}
                >
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => nudgeTime(index, -0.1)}
                      disabled={line.time < 0}
                      aria-label={`Move timestamp for line ${index + 1} earlier by 0.1 seconds`}
                      className="rounded p-1 text-sm font-bold text-white/35 hover:bg-white/5 hover:text-white disabled:opacity-20"
                    >‹</button>
                    {editingIndex === index ? (
                      <input
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        value={editingTime}
                        onChange={event => setEditingTime(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveEditedTime(index);
                          } else if (event.key === 'Escape') {
                            setEditingIndex(null);
                            setEditingTime('');
                          }
                        }}
                        aria-label={`Edit timestamp for ${line.line}`}
                        className="w-24 rounded-md border border-blue-500 bg-[#101010] px-2 py-1.5 text-center font-mono text-xs tabular-nums text-blue-300 outline-none"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { if (line.time >= 0) void playFromTime(line.time); }}
                          disabled={line.time < 0}
                          aria-label={line.time >= 0 ? `Play from ${formatTime(line.time)}` : 'No timestamp set'}
                          className={`min-w-[5.75rem] rounded-md px-2 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                            line.time >= 0 ? 'text-blue-300 hover:bg-blue-500/10 hover:text-blue-200' : 'cursor-default text-white/30'
                          }`}
                        >
                          &lt;&lt; {formatTime(line.time)} &gt;&gt;
                        </button>
                        <button
                          type="button"
                          onClick={() => beginEditTime(index)}
                          aria-label={`Edit timestamp for line ${index + 1}`}
                          title="Edit timestamp"
                          className="rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => nudgeTime(index, 0.1)}
                      disabled={line.time < 0}
                      aria-label={`Move timestamp for line ${index + 1} later by 0.1 seconds`}
                      className="rounded p-1 text-sm font-bold text-white/35 hover:bg-white/5 hover:text-white disabled:opacity-20"
                    >›</button>
                  </div>
                  <p className={`min-w-0 flex-1 text-sm leading-6 sm:text-base ${isActive ? 'font-semibold text-white' : 'text-white/75'}`}>{line.line}</p>
                  {isActive && <span className="hidden shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-blue-300 sm:inline">Next line</span>}
                </div>
              );
            }) : (
              <div className="rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
                <p className="text-sm text-white/50">No lyrics yet.</p>
                <button type="button" onClick={() => setShowPlainLyrics(true)} className="mt-3 text-sm text-blue-400 hover:text-blue-300">Add plain lyrics</button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="z-10 shrink-0 border-t border-white/10 bg-[#181818] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pt-5">
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
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center gap-4">
            <button type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause track' : 'Play track'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#121212] transition-transform hover:scale-105">
              {isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
            </button>
            <span className="min-w-[6.75rem] font-mono text-xs tabular-nums text-white/65" aria-live="off">{formatDockTime(currentTime)} / {formatDockTime(audioDuration)}</span>
            <input
              type="range"
              min={0}
              max={audioDuration || 0}
              step={0.01}
              value={Math.min(currentTime, audioDuration || 0)}
              onChange={event => seekAudio(Number(event.target.value))}
              disabled={!audioDuration}
              aria-label="Seek audio"
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
            />
          </div>
          <button
            type="button"
            onClick={tapCurrentTime}
            disabled={!isPlaying || activeLineIndex < 0}
            className="flex min-h-[4.25rem] w-full items-center justify-center gap-3 rounded-xl bg-blue-600 text-lg font-black tracking-[0.16em] text-white shadow-[0_6px_24px_rgba(37,99,235,0.22)] transition-colors hover:bg-blue-500 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-[#252a33] disabled:text-white/30 disabled:shadow-none sm:min-h-[4.75rem] sm:text-xl"
          >
            <span className="rounded-md border border-white/35 px-2 py-1 font-mono text-[10px] tracking-normal text-white/80">SPACE</span>
            {activeLineIndex < 0 ? 'ALL LINES SYNCED' : 'TAP TO SYNC'}
          </button>
        </div>
      </footer>

      {lrcPasteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLrcPasteOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="paste-lrc-title" className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#181818] p-5 text-white shadow-2xl">
            <h3 id="paste-lrc-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/65">Paste LRC</h3>
            <textarea
              autoFocus
              value={lrcPasteText}
              onChange={event => setLrcPasteText(event.target.value)}
              placeholder="[00:12.40] Paste timestamped lyrics"
              className="min-h-48 w-full resize-y rounded-lg border border-white/10 bg-[#101010] p-3 font-mono text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-blue-500"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setLrcPasteOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:border-white/25 hover:text-white">Cancel</button>
              <button type="button" onClick={handleLrcImport} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500">Import LRC</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
