import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useUpload } from '@/lib/useUpload';
import type { ProducerPack } from '@/types';
import FetchError from '@/components/ui/FetchError';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProgressIndicator from '@/components/ui/ProgressIndicator';

type PackForm = {
  title: string;
  description: string;
  bpm: string;
  musical_key: string;
  genre: string;
  is_free: boolean;
  price: string;
  payment_url: string;
  cover_url: string;
  audio_preview_url: string;
  download_url: string;
};

type UploadField = 'cover_url' | 'audio_preview_url' | 'download_url';

const EMPTY_FORM: PackForm = {
  title: '',
  description: '',
  bpm: '',
  musical_key: '',
  genre: '',
  is_free: true,
  price: '',
  payment_url: '',
  cover_url: '',
  audio_preview_url: '',
  download_url: '',
};

const FORM_INPUT = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-violet-500/50 focus:outline-none';
const DUPLICATE_TITLE_MESSAGE = 'A pack with this title already exists. Please add a version number (e.g., Vol. 2) or change the title.';

function sanitizeFileName(str: string) {
  return str.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').toLowerCase();
}

export default function ProducersCutAdmin() {
  const [packs, setPacks] = useState<ProducerPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<ProducerPack | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<PackForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<UploadField | null>(null);
  const fileInputs = useRef<Record<UploadField, HTMLInputElement | null>>({
    cover_url: null,
    audio_preview_url: null,
    download_url: null,
  });
  const { upload, progress: uploadProgress } = useUpload();

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('producer_packs').select('*').order('sort_order').order('created_at', { ascending: false });
    if (error) setLoadError(true);
    else setPacks((data || []) as ProducerPack[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function hasDuplicateTitle(title: string) {
    if (editing || !title) return false;
    const { data: existing, error } = await supabase
      .from('producer_packs')
      .select('id')
      .eq('title', title)
      .maybeSingle();
    if (error) {
      toast.error(`Could not check for duplicate pack titles: ${error.message}`);
      return true;
    }
    if (existing) toast.error(DUPLICATE_TITLE_MESSAGE);
    return existing !== null;
  }

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(pack: ProducerPack) {
    setCreating(false);
    setEditing(pack);
    setForm({
      title: pack.title,
      description: pack.description || '',
      bpm: pack.bpm === null ? '' : String(pack.bpm),
      musical_key: pack.musical_key || '',
      genre: pack.genre || '',
      is_free: pack.is_free,
      price: String(pack.price),
      payment_url: pack.payment_url || '',
      cover_url: pack.cover_url || '',
      audio_preview_url: pack.audio_preview_url || '',
      download_url: pack.download_url || '',
    });
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  }

  async function handleUpload(field: UploadField, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const title = form.title.trim();
    if (!editing && title && await hasDuplicateTitle(title)) return;
    if (field !== 'cover_url' && !title) {
      toast.error('Enter a pack title before uploading audio or download files.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File too large. Max 25 MB.');
      return;
    }
    if (field === 'cover_url' && !file.type.startsWith('image/')) {
      toast.error('Choose an image file for the cover.');
      return;
    }
    if (field === 'audio_preview_url' && !file.type.startsWith('audio/')) {
      toast.error('Choose an audio file for the preview.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const bucket = field === 'cover_url' ? 'album-art' : 'producer-files';
    const cleanTitle = sanitizeFileName(title);
    const cleanKey = sanitizeFileName(form.musical_key || '');
    const bpm = sanitizeFileName(form.bpm || '');
    const path = field === 'download_url'
      ? `downloads/${cleanTitle}_${bpm}BPM_${cleanKey}.${extension}`
      : field === 'audio_preview_url'
        ? `previews/${cleanTitle}_${bpm}BPM_preview.${extension}`
        : `producer-packs/${Date.now()}-${field}.${extension}`;
    setUploadingField(field);
    try {
      const { publicUrl } = await upload({
        bucket,
        path,
        file,
        contentType: file.type || 'application/octet-stream',
      });
      setForm(current => ({ ...current, [field]: publicUrl }));
      toast.success(`${field === 'cover_url' ? 'Cover' : field === 'audio_preview_url' ? 'Audio preview' : 'Download file'} uploaded`);
    } catch (error) {
      console.error('[ProducerPackUpload] Failed:', error);
      toast.error('Could not upload this file. Try again.');
    } finally {
      setUploadingField(null);
    }
  }

  async function save() {
    const title = form.title.trim();
    const bpm = form.bpm.trim() ? Number(form.bpm) : null;
    const price = form.is_free ? 0 : Number(form.price);
    if (!title) {
      toast.error('Title is required.');
      return;
    }
    if (await hasDuplicateTitle(title)) return;
    if (bpm !== null && (!Number.isInteger(bpm) || bpm < 1 || bpm > 999)) {
      toast.error('BPM must be a whole number between 1 and 999.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Enter a valid non-negative price.');
      return;
    }

    const payload = {
      title,
      description: form.description.trim() || null,
      bpm,
      musical_key: form.musical_key.trim() || null,
      genre: form.genre.trim() || null,
      cover_url: form.cover_url || null,
      audio_preview_url: form.audio_preview_url || null,
      download_url: form.download_url || null,
      payment_url: form.payment_url.trim() || null,
      is_free: form.is_free,
      price,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    const result = editing
      ? await supabase.from('producer_packs').update(payload).eq('id', editing.id)
      : await supabase.from('producer_packs').insert({ ...payload, sort_order: packs.length });
    setSaving(false);
    if (result.error) {
      toast.error(`Could not save this pack: ${result.error.message}`);
      return;
    }
    toast.success(editing ? 'Pack updated' : 'Pack added');
    closeForm();
    await load();
  }

  async function deletePack(pack: ProducerPack) {
    if (!confirm(`Delete "${pack.title}"?`)) return;
    const { error } = await supabase.from('producer_packs').delete().eq('id', pack.id);
    if (error) {
      toast.error(`Could not delete this pack: ${error.message}`);
      return;
    }
    toast.success('Pack deleted');
    await load();
  }

  const isFormOpen = creating || editing !== null;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Producer Packs</h1>
          <p className="mt-1 text-sm text-[#72727E]">Manage beats, MIDI, and sound kits</p>
        </div>
        <button type="button" onClick={startCreate} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500">+ Add Pack</button>
      </div>

      {isFormOpen && (
        <section className="mb-8 rounded-2xl border border-white/10 p-6 glass" aria-label={editing ? 'Edit producer pack' : 'Add producer pack'}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">{editing ? 'Edit Pack' : 'Add Pack'}</h2>
            <button type="button" onClick={closeForm} className="text-sm text-[#72727E] hover:text-white">Cancel</button>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-wider text-[#72727E]">Title *
                <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`} />
              </label>
              <label className="text-xs uppercase tracking-wider text-[#72727E]">Genre
                <input value={form.genre} onChange={event => setForm(current => ({ ...current, genre: event.target.value }))} placeholder="e.g. Afro-pop, Lo-fi" className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`} />
              </label>
              <label className="text-xs uppercase tracking-wider text-[#72727E]">BPM
                <input type="number" min="1" max="999" step="1" value={form.bpm} onChange={event => setForm(current => ({ ...current, bpm: event.target.value }))} className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`} />
              </label>
              <label className="text-xs uppercase tracking-wider text-[#72727E]">Key
                <input value={form.musical_key} onChange={event => setForm(current => ({ ...current, musical_key: event.target.value }))} placeholder="e.g. A minor" className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`} />
              </label>
            </div>
            <label className="block text-xs uppercase tracking-wider text-[#72727E]">Description
              <textarea rows={3} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className={`${FORM_INPUT} mt-1.5 resize-y normal-case tracking-normal`} />
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm text-[#A8A8B3]">
                <input type="checkbox" checked={form.is_free} onChange={event => setForm(current => ({ ...current, is_free: event.target.checked }))} className="h-4 w-4 accent-violet-500" />
                Free download
              </label>
              {!form.is_free && (
                <label className="max-w-48 flex-1 text-xs uppercase tracking-wider text-[#72727E]">Price (USD)
                  <input type="number" min="0" step="0.01" value={form.price} onChange={event => setForm(current => ({ ...current, price: event.target.value }))} placeholder="0.00" className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`} />
                </label>
              )}
            </div>
            <label className="block text-xs uppercase tracking-wider text-[#72727E]">Payment Link (Stripe/Gumroad)
              <input
                type="url"
                value={form.payment_url}
                onChange={event => setForm(current => ({ ...current, payment_url: event.target.value }))}
                placeholder="https://buy.stripe.com/…"
                className={`${FORM_INPUT} mt-1.5 normal-case tracking-normal`}
              />
              <span className="mt-1 block normal-case tracking-normal text-[#72727E]">Only required if the pack is NOT free.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                { field: 'cover_url', label: 'Cover Image', accept: 'image/*' },
                { field: 'audio_preview_url', label: 'Audio Preview', accept: 'audio/*' },
                { field: 'download_url', label: 'Download File (ZIP/MIDI)', accept: '.zip,.mid,.midi,.7z,.rar,application/zip,audio/midi,audio/x-midi' },
              ] as const).map(({ field, label, accept }) => (
                <div key={field}>
                  <span className="block text-xs uppercase tracking-wider text-[#72727E]">{label}</span>
                  <input
                    ref={element => { fileInputs.current[field] = element; }}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={event => void handleUpload(field, event)}
                    disabled={uploadingField !== null}
                  />
                  <button type="button" onClick={() => fileInputs.current[field]?.click()} disabled={uploadingField !== null} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs text-[#A8A8B3] hover:border-violet-500/40 disabled:opacity-50">
                    {uploadingField === field ? 'Uploading…' : form[field] ? 'Replace uploaded file' : 'Choose file'}
                  </button>
                  {form[field] && <p className="mt-1 truncate text-[10px] text-green-400">File uploaded</p>}
                  {uploadingField === field && <ProgressIndicator progress={uploadProgress} label={`Uploading ${label.toLowerCase()}`} showPercent />}
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => void save()} disabled={saving || uploadingField !== null} className="mt-6 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50">
            <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : 'Save Pack'}</span>
          </button>
        </section>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, index) => <div key={index} className="skeleton h-16 rounded-xl" />)}</div>
      ) : loadError ? (
        <FetchError message="Couldn’t load producer packs. Try again." onRetry={() => void load()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/8 glass">
          {packs.map((pack, index) => (
            <div key={pack.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${index > 0 ? 'border-t border-white/5' : ''}`}>
              {pack.cover_url ? <img src={pack.cover_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="h-12 w-12 rounded-lg bg-violet-500/20" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{pack.title}</p>
                <p className="truncate text-xs text-[#72727E]">{pack.genre || 'No genre'} · {pack.bpm ? `${pack.bpm} BPM` : 'BPM —'} · {pack.musical_key || 'Key —'}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${pack.is_free ? 'bg-green-500/20 text-green-400' : 'bg-violet-500/20 text-violet-300'}`}>
                {pack.is_free ? 'Free' : `$${Number(pack.price).toFixed(2)}`}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => startEdit(pack)} className="rounded px-2 py-1 text-xs text-violet-400 transition-colors hover:text-violet-300">Edit</button>
                <button type="button" onClick={() => void deletePack(pack)} className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
          {packs.length === 0 && <div className="p-8 text-center text-sm text-[#72727E]">No producer packs yet. Add your first pack above.</div>}
        </div>
      )}
    </div>
  );
}
