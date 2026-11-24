import { useState } from 'react';
import { Disc3, RefreshCw, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface NoteLabBeatItem {
  id: string;
  beat_name: string | null;
  bpm: number | null;
  created_at: string | null;
  notes_data?: unknown;
}

export default function ProducersCutAdmin() {
  const [beats, setBeats] = useState<NoteLabBeatItem[]>([]);
  const [loadingBeats, setLoadingBeats] = useState(false);
  const [pushingBeatId, setPushingBeatId] = useState<string | null>(null);
  const [pushedBeatIds, setPushedBeatIds] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const handleFetchFromNoteLab = async () => {
    setLoadingBeats(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/bridge-notelab-to-cammusic', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }
      const list = Array.isArray(payload?.beats) ? payload.beats : [];
      setBeats(list);
      setHasFetched(true);
      toast.success(`Loaded ${list.length} beat${list.length === 1 ? '' : 's'} from NoteLab`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch beats from NoteLab';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoadingBeats(false);
    }
  };

  const handlePushBeatToCamMusic = async (beat: NoteLabBeatItem) => {
    if (pushingBeatId) return;
    setPushingBeatId(beat.id);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/bridge-notelab-to-cammusic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId: beat.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to push beat (${response.status})`);
      }
      setPushedBeatIds((prev) => ({ ...prev, [beat.id]: true }));
      toast.success(`Pushed "${beat.beat_name || beat.id}" to Cam Music tracks`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to push beat to Cam Music';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setPushingBeatId(null);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#121318] p-6 text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
            <Disc3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Producer&apos;s Cut — NoteLab Bridge</h1>
            <p className="text-xs text-zinc-400">
              Fetch saved beats from NoteLab (cam-audio-anylyzer) and publish them to Cam Music tracks.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFetchFromNoteLab}
          disabled={loadingBeats}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingBeats ? 'animate-spin' : ''}`} />
          <span>{loadingBeats ? 'Fetching…' : 'Fetch from NoteLab'}</span>
        </button>
      </header>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!hasFetched && beats.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">
          Click &ldquo;Fetch from NoteLab&rdquo; to load available beats from NoteLab.
        </p>
      ) : beats.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">
          No NoteLab beats found in <code>notelab_user_beats</code>.
        </p>
      ) : (
        <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/30">
          {beats.map((beat) => {
            const isPushing = pushingBeatId === beat.id;
            const isPushed = Boolean(pushedBeatIds[beat.id]);
            const displayName = beat.beat_name?.trim() || `Untitled Beat (${beat.id.slice(0, 8)})`;

            return (
              <div
                key={beat.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{displayName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span>ID: {beat.id}</span>
                    {typeof beat.bpm === 'number' && <span>{beat.bpm} BPM</span>}
                    {beat.created_at && (
                      <span>{new Date(beat.created_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handlePushBeatToCamMusic(beat)}
                  disabled={Boolean(pushingBeatId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  {isPushed ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Pushed to Cam Music</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5 text-blue-400" />
                      <span>{isPushing ? 'Pushing…' : 'Push to Cam Music'}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
