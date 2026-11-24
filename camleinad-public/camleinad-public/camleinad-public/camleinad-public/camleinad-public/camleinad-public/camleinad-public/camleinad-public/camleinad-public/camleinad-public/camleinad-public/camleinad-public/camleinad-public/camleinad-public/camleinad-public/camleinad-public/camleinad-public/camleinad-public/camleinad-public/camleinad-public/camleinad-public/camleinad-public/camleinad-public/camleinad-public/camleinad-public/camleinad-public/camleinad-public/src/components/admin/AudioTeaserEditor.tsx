import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import * as lamejs from '@breezystack/lamejs';
import { toast } from 'sonner';
import { getAudioUrl } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProgressIndicator from '@/components/ui/ProgressIndicator';

const MAX_TEASER_DURATION = 60;
const LOAD_TIMEOUT_MS = 45000;

interface AudioTeaserEditorProps {
  audioUrl: string;
  trackTitle: string;
  onSave: (blob: Blob, meta: { start: number; end: number; label?: string }) => Promise<void>;
  onCancel: () => void;
}

async function unlockAudioContext(ctx: AudioContext | null | undefined): Promise<void> {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (_) {
    // ignore
  }
}

export default function AudioTeaserEditor({ audioUrl, trackTitle, onSave, onCancel }: AudioTeaserEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<ReturnType<typeof WaveSurfer.create> | null>(null);
  const regionsPluginRef = useRef<InstanceType<typeof RegionsPlugin> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<number>(0);
  const readyRef = useRef<boolean>(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(30);
  const [label, setLabel] = useState('');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState<'encoding' | 'uploading'>('encoding');

  useEffect(() => {
    try {
      const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const warm = new Ctor();
      if (warm.state === 'suspended') warm.resume().catch(() => {});
    } catch (_) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      console.error('[AudioTeaserEditor] containerRef.current is null');
      return;
    }

    progressRef.current = 0;
    readyRef.current = false;

    const resolvedUrl = getAudioUrl(audioUrl);
    if (!resolvedUrl) {
      setError('No audio URL provided');
      setIsLoading(false);
      return;
    }

    console.log('[AudioTeaserEditor] Loading audio from:', resolvedUrl);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#6B5F55',
      progressColor: '#C97B4A',
      cursorColor: '#C97B4A',
      cursorWidth: 2,
      barWidth: 2,
      barRadius: 2,
      height: 120,
      normalize: true,
      preload: 'auto',
      // @ts-ignore
      crossOrigin: 'anonymous',
    });

    const regionsPlugin = ws.registerPlugin(RegionsPlugin.create());
    wavesurferRef.current = ws;
    regionsPluginRef.current = regionsPlugin;

    ws.on('error', (err: any) => {
      const errorMessage = err?.message || String(err) || 'Audio failed to load';
      console.error('[AudioTeaserEditor] Wavesurfer error:', errorMessage);
      if (progressRef.current === 0) {
        setError(errorMessage);
        setIsLoading(false);
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    });

    ws.on('loading', (percent: number) => {
      progressRef.current = percent;
      console.log('[AudioTeaserEditor] Loading:', percent + '%');
    });

    ws.on('ready', () => {
      console.log('[AudioTeaserEditor] Audio ready');
      readyRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      try {
        const backend: any = (ws as any).backend;
        if (backend?.ac) void unlockAudioContext(backend.ac);
      } catch (_) {
        // ignore
      }

      setDuration(ws.getDuration());
      setError(null);
      setIsLoading(false);

      const initialEnd = Math.min(30, ws.getDuration());
      regionsPlugin.addRegion({
        start: 0,
        end: initialEnd,
        color: 'rgba(201, 123, 74, 0.3)',
        drag: true,
        resize: true,
      });

      setStartSeconds(0);
      setEndSeconds(initialEnd);
    });

    ws.on('timeupdate', (time) => setCurrentTime(time));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    regionsPlugin.on('region-updated', (updatedRegion: any) => {
      const start = Math.round(updatedRegion.start * 100) / 100;
      let end = Math.round(updatedRegion.end * 100) / 100;

      if (end - start > MAX_TEASER_DURATION) {
        end = start + MAX_TEASER_DURATION;
        updatedRegion.setOptions({ end });
      }

      setStartSeconds(start);
      setEndSeconds(end);
    });

    function scheduleLoadTimeout(url: string) {
      timeoutRef.current = setTimeout(() => {
        if (readyRef.current) return;

        const dur = wavesurferRef.current?.getDuration?.() || 0;
        if (dur > 0) return;

        if (progressRef.current > 0) {
          console.warn(
            `[AudioTeaserEditor] Still loading (${progressRef.current}%), rescheduling timeout`
          );
          scheduleLoadTimeout(url);
          return;
        }

        const timeoutErr = `Audio load timed out. URL: ${url}`;
        console.error('[AudioTeaserEditor]', timeoutErr);
        setError(timeoutErr);
        setIsLoading(false);
      }, LOAD_TIMEOUT_MS);
    }

    scheduleLoadTimeout(resolvedUrl);

    ws.load(resolvedUrl);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      try {
        ws.destroy();
      } catch (_) {
        // no-op
      }
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
    };
  }, [audioUrl]);

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const start = Math.max(0, Math.min(parseFloat(e.target.value) || 0, duration));
    setStartSeconds(start);

    if (wavesurferRef.current && regionsPluginRef.current) {
      const regions = regionsPluginRef.current.getRegions();
      if (regions.length > 0) {
        const r = regions[0];
        if (start < r.end) r.setOptions({ start });
      }
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let end = Math.max(0, Math.min(parseFloat(e.target.value) || 0, duration));
    if (end - startSeconds > MAX_TEASER_DURATION) {
      end = startSeconds + MAX_TEASER_DURATION;
    }
    setEndSeconds(end);

    if (wavesurferRef.current && regionsPluginRef.current) {
      const regions = regionsPluginRef.current.getRegions();
      if (regions.length > 0) {
        const r = regions[0];
        if (end > r.start) r.setOptions({ end });
      }
    }
  };

  const handlePreviewSelection = async () => {
    if (!wavesurferRef.current || duration <= 0) return;
    try {
      const backend: any = (wavesurferRef.current as any).backend;
      if (backend?.ac) await unlockAudioContext(backend.ac);
    } catch (_) {
      // ignore
    }
    wavesurferRef.current.seekTo(startSeconds / duration);
    wavesurferRef.current.play();
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5));

  const handleExportTeaser = async () => {
    if (endSeconds - startSeconds > MAX_TEASER_DURATION) {
      toast.error(`Teaser must be ${MAX_TEASER_DURATION} seconds or less`);
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportPhase('encoding');

    let blob: Blob;
    try {
      const resolvedUrl = getAudioUrl(audioUrl);
      if (!resolvedUrl) throw new Error('No audio URL available');

      const audioResponse = await fetch(resolvedUrl, { mode: 'cors' });
      if (!audioResponse.ok) throw new Error(`Fetch failed: ${audioResponse.status}`);
      const arrayBuffer = await audioResponse.arrayBuffer();

      const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext: AudioContext = new Ctor();
      await unlockAudioContext(audioContext);

      const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);

      const offlineContext = new OfflineAudioContext(
        decodedAudio.numberOfChannels,
        Math.max(1, Math.round(decodedAudio.sampleRate * (endSeconds - startSeconds))),
        decodedAudio.sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(offlineContext.destination);
      source.start(0, startSeconds, endSeconds - startSeconds);

      const renderedAudio = await offlineContext.startRendering();
      setExportProgress(25);

      const EncoderCtor: any = (lamejs as any).Mp3Encoder;
      if (typeof EncoderCtor !== 'function') {
        console.error('[AudioTeaserEditor] lamejs exports:', lamejs);
        throw new Error('Mp3Encoder not found on lamejs module');
      }

      const numChannels = renderedAudio.numberOfChannels;
      const encoder = new EncoderCtor(numChannels, renderedAudio.sampleRate, 128);

      const left = renderedAudio.getChannelData(0);
      const right = numChannels > 1 ? renderedAudio.getChannelData(1) : left;

      const leftSamples = new Int16Array(left.length);
      const rightSamples = new Int16Array(right.length);
      for (let i = 0; i < left.length; i++) {
        const l = Math.max(-1, Math.min(1, left[i]));
        leftSamples[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
      }
      for (let i = 0; i < right.length; i++) {
        const r = Math.max(-1, Math.min(1, right[i]));
        rightSamples[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
      }

      const mp3Data: Uint8Array[] = [];
      const chunkSize = 1152;

      for (let i = 0; i < leftSamples.length; i += chunkSize) {
        const lChunk = leftSamples.subarray(i, Math.min(i + chunkSize, leftSamples.length));
        const rChunk = rightSamples.subarray(i, Math.min(i + chunkSize, rightSamples.length));
        const encoded =
          numChannels > 1
            ? encoder.encodeBuffer(lChunk, rChunk)
            : encoder.encodeBuffer(lChunk);
        if (encoded.length > 0) mp3Data.push(new Uint8Array(encoded));
      }

      const finalData = encoder.flush();
      if (finalData.length > 0) mp3Data.push(new Uint8Array(finalData));

      blob = new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
      setExportProgress(55);
    } catch (err) {
      console.error('[AudioTeaserEditor] Export/encode failed:', err);
      toast.error('Could not process the audio slice. Try again.');
      setIsExporting(false);
      return;
    }

    try {
      setExportPhase('uploading');
      setExportProgress(70);
      await onSave(blob, {
        start: startSeconds,
        end: endSeconds,
        label: label || undefined,
      });
      setExportProgress(100);
      toast.success('Teaser saved');
    } catch (err) {
      console.error('[AudioTeaserEditor] Parent onSave threw:', err);
      toast.error('Could not upload teaser. Try again.');
    } finally {
      setIsExporting(false);
      setExportProgress(100);
    }
  };

  const durationDisplay = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);
    return `${mins}:${String(seconds).padStart(2, '0')}`;
  };

  const selectionDuration = endSeconds - startSeconds;
  const controlsReady = !isLoading && !error;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--base)' }}
      >
        <div className="p-6 border-b border-[var(--rule)]">
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-xl font-semibold text-[var(--ink)]"
                style={{ fontFamily: 'Fraunces, Georgia, serif' }}
              >
                Edit Teaser
              </h2>
              <p className="text-sm text-[var(--ink-muted)] mt-1">{trackTitle}</p>
            </div>
            <button
              onClick={onCancel}
              className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-2xl transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label
              className="block text-xs text-[var(--ink-muted)] uppercase tracking-wider font-medium"
              style={{ display: controlsReady ? 'block' : 'none' }}
            >
              Waveform
            </label>
            <div
              ref={containerRef}
              className="rounded border border-[var(--rule)]"
              style={{
                minHeight: 120,
                display: controlsReady ? 'block' : 'none',
                filter: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            />
          </div>

          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <LoadingSpinner />
              <p className="text-sm text-[var(--ink-muted)]">Loading audio...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-red-600 dark:text-red-400">Error loading audio</p>
              <p className="text-xs text-[var(--ink-muted)] text-center max-w-md break-words">
                {error}
              </p>
              <button
                onClick={onCancel}
                className="mt-4 px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{ backgroundColor: 'var(--accent)', color: '#1A1714' }}
              >
                Close
              </button>
            </div>
          )}

          {controlsReady && (
            <>
              <div ref={timelineRef} className="text-xs text-[var(--ink-muted)] text-center">
                {durationDisplay(currentTime)} / {durationDisplay(duration)}
              </div>

              <div className="flex items-center gap-3 justify-center">
                <button
                  onClick={() => wavesurferRef.current?.playPause()}
                  className="w-10 h-10 rounded flex items-center justify-center transition-colors"
                  style={{ backgroundColor: 'var(--accent)', color: '#1A1714' }}
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={handleZoomOut}
                  className="px-3 py-1 rounded text-xs border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                >
                  − Zoom
                </button>

                <span className="text-sm text-[var(--ink-muted)]">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  onClick={handleZoomIn}
                  className="px-3 py-1 rounded text-xs border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                >
                  + Zoom
                </button>
              </div>

              <div
                className="p-4 rounded border border-[var(--rule)]"
                style={{ backgroundColor: 'rgba(26, 23, 20, 0.02)' }}
              >
                <p className="text-xs text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                  Selection
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[var(--ink-muted)] text-xs mb-1">Start</p>
                    <p className="text-lg font-semibold text-[var(--ink)]">
                      {durationDisplay(startSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--ink-muted)] text-xs mb-1">Duration</p>
                    <p
                      className="text-lg font-semibold"
                      style={{
                        color:
                          selectionDuration > MAX_TEASER_DURATION ? '#d32f2f' : 'var(--ink)',
                      }}
                    >
                      {durationDisplay(selectionDuration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--ink-muted)] text-xs mb-1">End</p>
                    <p className="text-lg font-semibold text-[var(--ink)]">
                      {durationDisplay(endSeconds)}
                    </p>
                  </div>
                </div>
              </div>

              {selectionDuration > MAX_TEASER_DURATION && (
                <div
                  className="p-3 rounded border border-red-300/50"
                  style={{ backgroundColor: 'rgba(211, 47, 47, 0.08)' }}
                >
                  <p className="text-xs text-red-700">
                    Teaser must be {MAX_TEASER_DURATION} seconds or less. Current duration:{' '}
                    {Math.round(selectionDuration)}s
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                    Start (seconds)
                  </label>
                  <input
                    type="number"
                    id="teaser-start"
                    name="teaser-start"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={Math.round(startSeconds * 10) / 10}
                    onChange={handleStartChange}
                    className="w-full border border-[var(--rule)] rounded px-3 py-2 text-sm text-[var(--ink)] focus:outline-none transition-colors"
                    style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--base)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                    End (seconds)
                  </label>
                  <input
                    type="number"
                    id="teaser-end"
                    name="teaser-end"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={Math.round(endSeconds * 10) / 10}
                    onChange={handleEndChange}
                    className="w-full border border-[var(--rule)] rounded px-3 py-2 text-sm text-[var(--ink)] focus:outline-none transition-colors"
                    style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--base)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[var(--ink-muted)] uppercase tracking-wider mb-2">
                    Label (optional)
                  </label>
                  <input
                    type="text"
                    id="teaser-label"
                    name="teaser-label"
                    placeholder="e.g., First 30 seconds"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full border border-[var(--rule)] rounded px-3 py-2 text-sm text-[var(--ink)] focus:outline-none transition-colors"
                    style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--base)' }}
                  />
                </div>
              </div>

              <button
                onClick={handlePreviewSelection}
                disabled={isExporting}
                className="w-full py-2 rounded text-sm font-medium transition-colors border border-[var(--rule)]"
                style={{ color: 'var(--ink)', backgroundColor: 'rgba(26, 23, 20, 0.05)' }}
              >
                Preview Selection
              </button>

              {isExporting && (
                <div className="pt-2">
                  <ProgressIndicator
                    progress={exportProgress}
                    size="md"
                    showPercent
                    label={exportPhase === 'encoding' ? 'Encoding audio slice' : 'Uploading teaser'}
                    sublabel={exportPhase === 'encoding' ? 'Processing on your device' : 'Sending to cloud storage'}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-[var(--rule)]">
                <button
                  onClick={onCancel}
                  disabled={isExporting}
                  className="flex-1 py-2 rounded text-sm font-medium transition-colors border border-[var(--rule)]"
                  style={{ color: 'var(--ink)' }}
                >
                  Cancel
                </button>

                <button
                  onClick={handleExportTeaser}
                  disabled={isExporting || selectionDuration > MAX_TEASER_DURATION}
                  className="flex-1 py-2 rounded text-sm font-medium transition-colors text-white"
                  style={{
                    backgroundColor:
                      selectionDuration > MAX_TEASER_DURATION ? '#ccc' : 'var(--accent)',
                  }}
                >
                  {isExporting ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingSpinner />
                      Exporting...
                    </span>
                  ) : (
                    'Export & Save Teaser'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
