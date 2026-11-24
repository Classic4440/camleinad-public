import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { uploadToStorage } from '@/lib/useUpload';

export interface ProducerPack {
  id: string;
  title: string;
  description: string | null;
  bpm: number | null;
  musical_key: string | null;
  genre: string | null;
  cover_url: string | null;
  audio_preview_url: string | null;
  download_url: string | null;
  is_free: boolean;
  price: number | null;
  sort_order: number;
  payment_url: string | null;
  created_at?: string;
  updated_at?: string;
}

interface NotelabDraftBeat {
  id: string;
  title?: string;
  beat_name?: string;
  description?: string | null;
  bpm?: number | null;
  musical_key?: string | null;
  key?: string | null;
  genre?: string | null;
  cover_url?: string | null;
  audio_preview_url?: string | null;
  download_url?: string | null;
  is_free?: boolean | null;
  price?: number | string | null;
  payment_url?: string | null;
  source_origin: 'notelab_bridge' | 'tracks_notelab';
  raw_meta?: Record<string, unknown>;
}

interface PackFormState {
  title: string;
  description: string;
  bpm: string;
  musical_key: string;
  genre: string;
  price: string;
  is_free: boolean;
  sort_order: string;
  payment_url: string;
  cover_url: string;
  audio_preview_url: string;
  download_url: string;
}

const EMPTY_FORM: PackFormState = {
  title: '',
  description: '',
  bpm: '',
  musical_key: '',
  genre: '',
  price: '0',
  is_free: true,
  sort_order: '0',
  payment_url: '',
  cover_url: '',
  audio_preview_url: '',
  download_url: '',
};

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'producer-pack';
}

export default function ProducersCutAdmin() {
  const [packs, setPacks] = useState<ProducerPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);

  const [drafts, setDrafts] = useState<NotelabDraftBeat[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [hasFetchedDrafts, setHasFetchedDrafts] = useState(false);

  const [selectedDraft, setSelectedDraft] = useState<NotelabDraftBeat | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [form, setForm] = useState<PackFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [downloadFile, setDownloadFile] = useState<File | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState<'cover' | 'preview' | 'download' | null>(null);

  const loadProducerPacks = useCallback(async () => {
    setLoadingPacks(true);
    try {
      const { data, error } = await supabase
        .from('producer_packs')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        toast.error(`Failed to load producer packs: ${error.message}`);
        return;
      }
      setPacks((data || []) as ProducerPack[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load producer packs');
    } finally {
      setLoadingPacks(false);
    }
  }, []);

  const fetchNotelabDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    const collected: NotelabDraftBeat[] = [];
    const errors: string[] = [];

    // 1. Fetch NoteLab beats from bridge endpoint if available
    try {
      const response = await fetch('/api/bridge-notelab-to-cammusic', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const payload = await response.json();
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.beats)
            ? payload.beats
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          collected.push({
            id: String(rec.id ?? rec.source_beat_id ?? crypto.randomUUID()),
            title: typeof rec.title === 'string' ? rec.title : undefined,
            beat_name: typeof rec.beat_name === 'string' ? rec.beat_name : undefined,
            description: typeof rec.description === 'string' ? rec.description : null,
            bpm: typeof rec.bpm === 'number' ? rec.bpm : Number(rec.bpm) || null,
            musical_key:
              typeof rec.musical_key === 'string'
                ? rec.musical_key
                : typeof rec.key === 'string'
                  ? rec.key
                  : null,
            genre: typeof rec.genre === 'string' ? rec.genre : null,
            cover_url: typeof rec.cover_url === 'string' ? rec.cover_url : null,
            audio_preview_url: typeof rec.audio_preview_url === 'string' ? rec.audio_preview_url : null,
            download_url: typeof rec.download_url === 'string' ? rec.download_url : null,
            is_free: typeof rec.is_free === 'boolean' ? rec.is_free : null,
            price:
              typeof rec.price === 'number' || typeof rec.price === 'string' ? rec.price : null,
            payment_url: typeof rec.payment_url === 'string' ? rec.payment_url : null,
            source_origin: 'notelab_bridge',
            raw_meta: rec,
          });
        }
      } else if (response.status !== 404 && response.status !== 501) {
        errors.push(`Bridge GET (${response.status})`);
      }
    } catch {
      // Bridge route may not be configured in every environment; still check tracks below
    }

    // 2. Also query any existing `tracks` rows tagged with NoteLab source in credits/metadata
    try {
      const { data: trackRows, error: tracksError } = await supabase
        .from('tracks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (tracksError) {
        errors.push(`Tracks lookup: ${tracksError.message}`);
      } else if (Array.isArray(trackRows)) {
        const matchingTracks = trackRows.filter((row) => {
          const r = row as Record<string, unknown>;
          const sourceField = typeof r.source === 'string' ? r.source.toLowerCase() : '';
          const sourcePlatform =
            typeof r.source_platform === 'string' ? r.source_platform.toLowerCase() : '';
          const creditsStr = JSON.stringify(r.credits ?? '').toLowerCase();
          const lyricsStr = JSON.stringify(r.lyrics ?? '').toLowerCase();
          return (
            sourceField.includes('notelab') ||
            sourcePlatform.includes('notelab') ||
            creditsStr.includes('notelab') ||
            lyricsStr.includes('source: notelab')
          );
        });

        for (const row of matchingTracks) {
          const r = row as Record<string, unknown>;
          collected.push({
            id: String(r.id),
            title: typeof r.title === 'string' ? r.title : 'NoteLab Track',
            description:
              typeof r.lyrics === 'string' && r.lyrics.trim()
                ? r.lyrics.trim()
                : `Imported from tracks table (${String(r.id)})`,
            bpm: typeof r.bpm === 'number' ? r.bpm : Number(r.bpm) || null,
            musical_key: typeof r.musical_key === 'string' ? r.musical_key : null,
            genre: typeof r.genre === 'string' ? r.genre : null,
            audio_preview_url:
              typeof r.teaser_audio_url === 'string' && r.teaser_audio_url
                ? r.teaser_audio_url
                : typeof r.audio_url === 'string'
                  ? r.audio_url
                  : null,
            source_origin: 'tracks_notelab',
            raw_meta: r,
          });
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Failed reading tracks');
    }

    setDrafts(collected);
    setHasFetchedDrafts(true);
    setLoadingDrafts(false);

    if (errors.length > 0 && collected.length === 0) {
      toast.error(`Draft fetch notice: ${errors.join(' · ')}`);
    } else {
      toast.success(
        `Loaded ${collected.length} NoteLab draft${collected.length === 1 ? '' : 's'}`
      );
    }
  }, []);

  useEffect(() => {
    void loadProducerPacks();
    void fetchNotelabDrafts();
  }, [loadProducerPacks, fetchNotelabDrafts]);

  function openEditAndPublish(draft: NotelabDraftBeat) {
    setSelectedDraft(draft);
    setEditingPackId(null);
    setCoverFile(null);
    setPreviewFile(null);
    setDownloadFile(null);

    const numericPrice =
      draft.price !== null && draft.price !== undefined && draft.price !== ''
        ? Number(draft.price)
        : 0;
    const isFree =
      typeof draft.is_free === 'boolean' ? draft.is_free : !(numericPrice > 0);

    setForm({
      title: draft.title || draft.beat_name || 'Untitled NoteLab Beat',
      description: draft.description || '',
      bpm: draft.bpm ? String(draft.bpm) : '',
      musical_key: draft.musical_key || '',
      genre: draft.genre || '',
      price: Number.isFinite(numericPrice) ? String(numericPrice) : '0',
      is_free: isFree,
      sort_order: '0',
      payment_url: draft.payment_url || '',
      cover_url: draft.cover_url || '',
      audio_preview_url: draft.audio_preview_url || '',
      download_url: draft.download_url || '',
    });
  }

  function openEditExistingPack(pack: ProducerPack) {
    setSelectedDraft(null);
    setEditingPackId(pack.id);
    setCoverFile(null);
    setPreviewFile(null);
    setDownloadFile(null);

    const numericPrice = pack.price != null ? Number(pack.price) : 0;
    setForm({
      title: pack.title || '',
      description: pack.description || '',
      bpm: pack.bpm != null ? String(pack.bpm) : '',
      musical_key: pack.musical_key || '',
      genre: pack.genre || '',
      price: String(numericPrice),
      is_free: Boolean(pack.is_free) && numericPrice === 0,
      sort_order: String(pack.sort_order ?? 0),
      payment_url: pack.payment_url || '',
      cover_url: pack.cover_url || '',
      audio_preview_url: pack.audio_preview_url || '',
      download_url: pack.download_url || '',
    });
  }

  function resetForm() {
    setSelectedDraft(null);
    setEditingPackId(null);
    setForm(EMPTY_FORM);
    setCoverFile(null);
    setPreviewFile(null);
    setDownloadFile(null);
  }

  async function handleImmediateUpload(
    kind: 'cover' | 'preview' | 'download',
    file: File | null
  ) {
    if (!file) return;
    setUploadingAsset(kind);
    try {
      const slug = sanitizeSlug(form.title || selectedDraft?.id || 'pack');
      const folder =
        kind === 'cover'
          ? `producer-packs/${slug}`
          : kind === 'preview'
            ? `previews/${slug}`
            : `downloads/${slug}`;
      const bucket = kind === 'cover' ? 'album-art' : 'producer-files';

      const result = await uploadToStorage(file, {
        bucket,
        folder,
        maxSizeMB: kind === 'cover' ? 10 : 100,
      });

      if (kind === 'cover') {
        setForm((prev) => ({ ...prev, cover_url: result.publicUrl }));
      } else if (kind === 'preview') {
        setForm((prev) => ({ ...prev, audio_preview_url: result.publicUrl }));
      } else {
        setForm((prev) => ({ ...prev, download_url: result.publicUrl }));
      }

      toast.success(`Uploaded ${kind} file to ${bucket}/${folder}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to upload ${kind} file`);
    } finally {
      setUploadingAsset(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Please enter a title before publishing to Producer Packs.');
      return;
    }

    setSaving(true);
    try {
      const slug = sanitizeSlug(form.title || selectedDraft?.id || 'pack');
      let finalCoverUrl = form.cover_url.trim() || null;
      let finalPreviewUrl = form.audio_preview_url.trim() || null;
      let finalDownloadUrl = form.download_url.trim() || null;

      if (coverFile) {
        const up = await uploadToStorage(coverFile, {
          bucket: 'album-art',
          folder: `producer-packs/${slug}`,
          maxSizeMB: 10,
        });
        finalCoverUrl = up.publicUrl;
      }

      if (previewFile) {
        const up = await uploadToStorage(previewFile, {
          bucket: 'producer-files',
          folder: `previews/${slug}`,
          maxSizeMB: 100,
        });
        finalPreviewUrl = up.publicUrl;
      }

      if (downloadFile) {
        const up = await uploadToStorage(downloadFile, {
          bucket: 'producer-files',
          folder: `downloads/${slug}`,
          maxSizeMB: 100,
        });
        finalDownloadUrl = up.publicUrl;
      }

      const parsedPrice = form.price.trim() !== '' ? Number(form.price) : 0;
      const safePrice = Number.isFinite(parsedPrice) ? parsedPrice : 0;
      const parsedBpm = form.bpm.trim() !== '' ? parseInt(form.bpm, 10) : null;
      const parsedSortOrder =
        form.sort_order.trim() !== '' ? parseInt(form.sort_order, 10) : 0;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        bpm: parsedBpm && Number.isFinite(parsedBpm) ? parsedBpm : null,
        musical_key: form.musical_key.trim() || null,
        genre: form.genre.trim() || null,
        price: safePrice,
        is_free: form.is_free && safePrice === 0,
        sort_order: Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0,
        payment_url: form.payment_url.trim() || null,
        cover_url: finalCoverUrl,
        audio_preview_url: finalPreviewUrl,
        download_url: finalDownloadUrl,
      };

      if (editingPackId) {
        const { error } = await supabase
          .from('producer_packs')
          .update(payload)
          .eq('id', editingPackId);

        if (error) {
          throw new Error(`Failed to update producer pack: ${error.message}`);
        }
        toast.success(`Updated "${payload.title}" in public.producer_packs`);
      } else {
        const { error } = await supabase
          .from('producer_packs')
          .insert(payload)
          .select('*')
          .single();

        if (error) {
          throw new Error(`Failed to publish to public.producer_packs: ${error.message}`);
        }
        toast.success(`Published "${payload.title}" to public.producer_packs`);
      }

      resetForm();
      await loadProducerPacks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save producer pack');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePack(pack: ProducerPack) {
    try {
      const { error } = await supabase.from('producer_packs').delete().eq('id', pack.id);
      if (error) {
        toast.error(`Failed to delete pack: ${error.message}`);
        return;
      }
      toast.success(`Removed "${pack.title}" from public.producer_packs`);
      setPacks((prev) => prev.filter((item) => item.id !== pack.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete pack');
    }
  }

  return (
    <div className="space-y-8 p-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Producer&apos;s Cut Admin · Storefront Publisher
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Import NoteLab drafts, upload cover/preview/pack files, and publish directly to{' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-sky-300">
              public.producer_packs
            </code>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchNotelabDrafts()}
            disabled={loadingDrafts}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {loadingDrafts ? 'Syncing NoteLab…' : 'Refresh NoteLab Drafts'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            New Pack Entry
          </button>
        </div>
      </div>

      {/* SECTION 1: IMPORT DRAFTS */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">1. Import Drafts</h2>
            <p className="text-xs text-slate-400">
              Beats from NoteLab bridge and existing <code className="text-slate-300">tracks</code>{' '}
              records tagged with NoteLab source.
            </p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
            {drafts.length} Draft{drafts.length === 1 ? '' : 's'}
          </span>
        </div>

        {loadingDrafts && !hasFetchedDrafts ? (
          <p className="py-6 text-sm text-slate-400">Loading NoteLab drafts…</p>
        ) : drafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
            No NoteLab drafts found yet. Click <strong>Refresh NoteLab Drafts</strong> or use{' '}
            <strong>New Pack Entry</strong> below to create a storefront pack directly.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {drafts.map((draft) => {
              const displayTitle = draft.title || draft.beat_name || 'Untitled Beat';
              const isSelected = selectedDraft?.id === draft.id;
              return (
                <div
                  key={`${draft.source_origin}-${draft.id}`}
                  className={`flex flex-col justify-between rounded-lg border p-4 transition ${
                    isSelected
                      ? 'border-blue-500 bg-blue-950/25'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-white">{displayTitle}</h3>
                      <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                        {draft.source_origin === 'notelab_bridge' ? 'NoteLab' : 'Tracks · NoteLab'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                      {draft.bpm ? <span>{draft.bpm} BPM</span> : null}
                      {draft.musical_key ? <span>· {draft.musical_key}</span> : null}
                      {draft.genre ? <span>· {draft.genre}</span> : null}
                    </div>

                    {draft.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                        {draft.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-2">
                    <span className="text-[11px] text-slate-500">ID: {draft.id.slice(0, 8)}…</span>
                    <button
                      type="button"
                      onClick={() => openEditAndPublish(draft)}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                    >
                      Edit &amp; Publish
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: EDIT & PUBLISH FORM + FILE UPLOADS */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">
              2. {editingPackId ? 'Edit Storefront Pack' : 'Publish to Producer Packs & File Uploads'}
            </h2>
            <p className="text-xs text-slate-400">
              {selectedDraft
                ? `Pre-filled from draft "${selectedDraft.title || selectedDraft.beat_name || selectedDraft.id}".`
                : 'Configure pack metadata and upload assets to Supabase Storage.'}
            </p>
          </div>
          {(selectedDraft || editingPackId) && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Clear Selection
            </button>
          )}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. CAM Rain - A minor Slow BGM"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Genre</label>
              <input
                type="text"
                value={form.genre}
                onChange={(e) => setForm((prev) => ({ ...prev, genre: e.target.value }))}
                placeholder="e.g. Afrobeats, Lo-fi, Afro-Trap"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">BPM</label>
              <input
                type="number"
                min={1}
                max={300}
                value={form.bpm}
                onChange={(e) => setForm((prev) => ({ ...prev, bpm: e.target.value }))}
                placeholder="e.g. 98"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Musical Key</label>
              <input
                type="text"
                value={form.musical_key}
                onChange={(e) => setForm((prev) => ({ ...prev, musical_key: e.target.value }))}
                placeholder="e.g. A minor, F# minor"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => {
                  const val = e.target.value;
                  const num = Number(val);
                  setForm((prev) => ({
                    ...prev,
                    price: val,
                    is_free: Number.isFinite(num) ? num === 0 : prev.is_free,
                  }));
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Sort Order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Checkout / Payment URL (optional)
              </label>
              <input
                type="url"
                value={form.payment_url}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_url: e.target.value }))}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_free}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_free: e.target.checked,
                      price: e.target.checked ? '0' : prev.price,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600"
                />
                Free Pack (`is_free`)
              </label>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-300">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Arrangement notes, stems/MIDI details, license info..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* FILE UPLOAD BLOCK */}
          <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 md:grid-cols-3">
            {/* cover_url -> album-art bucket */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-sky-300">
                Cover Art (`cover_url`) → `album-art`
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCoverFile(file);
                  void handleImmediateUpload('cover', file);
                }}
                className="block w-full text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <input
                type="url"
                value={form.cover_url}
                onChange={(e) => setForm((prev) => ({ ...prev, cover_url: e.target.value }))}
                placeholder="https://.../album-art/..."
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
              />
              {uploadingAsset === 'cover' && (
                <p className="text-[11px] text-amber-300">Uploading cover art…</p>
              )}
            </div>

            {/* audio_preview_url -> producer-files/previews */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-sky-300">
                Audio Preview (`audio_preview_url`) → `producer-files/previews`
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPreviewFile(file);
                  void handleImmediateUpload('preview', file);
                }}
                className="block w-full text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <input
                type="url"
                value={form.audio_preview_url}
                onChange={(e) => setForm((prev) => ({ ...prev, audio_preview_url: e.target.value }))}
                placeholder="https://.../producer-files/previews/..."
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
              />
              {uploadingAsset === 'preview' && (
                <p className="text-[11px] text-amber-300">Uploading audio preview…</p>
              )}
            </div>

            {/* download_url -> producer-files/downloads */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-sky-300">
                Pack Download (`download_url`) → `producer-files/downloads`
              </label>
              <input
                type="file"
                accept=".zip,.rar,.7z,.mid,.midi,.wav,.mp3,.flac,.flp,application/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setDownloadFile(file);
                  void handleImmediateUpload('download', file);
                }}
                className="block w-full text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
              />
              <input
                type="url"
                value={form.download_url}
                onChange={(e) => setForm((prev) => ({ ...prev, download_url: e.target.value }))}
                placeholder="https://.../producer-files/downloads/..."
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
              />
              {uploadingAsset === 'download' && (
                <p className="text-[11px] text-amber-300">Uploading pack download…</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={saving || uploadingAsset !== null}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {saving
                ? 'Saving to producer_packs…'
                : editingPackId
                  ? 'Save Pack Changes'
                  : 'Publish to Producer Packs'}
            </button>
          </div>
        </form>
      </section>

      {/* EXISTING STOREFRONT PACKS */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Published Storefront Packs (`public.producer_packs`)
          </h2>
          <span className="text-xs text-slate-400">{packs.length} total</span>
        </div>

        {loadingPacks ? (
          <p className="text-sm text-slate-400">Loading storefront packs…</p>
        ) : packs.length === 0 ? (
          <p className="text-sm text-slate-400">No packs in `public.producer_packs` yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {pack.cover_url ? (
                    <img
                      src={pack.cover_url}
                      alt={pack.title}
                      className="h-12 w-12 rounded-md border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-xs text-slate-500">
                      Pack
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white">{pack.title}</p>
                    <p className="text-xs text-slate-400">
                      {pack.genre || 'Uncategorized'}
                      {pack.bpm ? ` · ${pack.bpm} BPM` : ''}
                      {pack.musical_key ? ` · ${pack.musical_key}` : ''} ·{' '}
                      {pack.is_free || !pack.price ? 'Free' : `$${Number(pack.price).toFixed(2)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditExistingPack(pack)}
                    className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeletePack(pack)}
                    className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
