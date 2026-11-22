import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { normalizeGalleryCategory } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';
import ProgressIndicator from '@/components/ui/ProgressIndicator';
import { useUpload } from '@/lib/useUpload';
import type { GalleryItem } from '@/types';

const CATS = [
  { value: 'artist', label: 'Artist' },
  { value: 'studio', label: 'Studio' },
  { value: 'process', label: 'Process' },
  { value: 'artwork', label: 'Artwork' },
  { value: 'behind_the_scenes', label: 'Behind the Scenes' },
  { value: 'press', label: 'Press' },
  { value: 'music', label: 'Music' },
];

export default function GalleryAdmin() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ image_url: '', title: '', alt_text: '', category: 'artist', is_published: false });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { upload } = useUpload();

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('gallery_items').select('*').order('sort_order');
    if (error) setLoadError(true);
    else setItems(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) { toast.error('Only JPEG, PNG, WebP, or GIF files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('File too large. Max 5MB.'); return; }
    setUploading(true);
    setUploadProgress(0);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `gallery/${Date.now()}.${ext}`;
    try {
      const { publicUrl } = await upload({
        bucket: 'gallery',
        path,
        file,
        contentType: file.type || 'image/jpeg',
        onProgress: (pct) => setUploadProgress(pct),
      });
      setForm(f => ({ ...f, image_url: publicUrl }));
      toast.success('Image uploaded');
    } catch {
      toast.error('Could not upload this image. Try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function save() {
    if (!form.image_url) { toast.error('Image URL is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('gallery_items').insert({
      ...form,
      category: normalizeGalleryCategory(form.category),
    });
    setSaving(false);
    if (error) { toast.error('Could not add this gallery image. Try again.'); return; }
    toast.success('Gallery item added');
    setCreating(false);
    setForm({ image_url: '', title: '', alt_text: '', category: 'artist', is_published: false });
    load();
  }

  async function togglePublish(item: GalleryItem) {
    const { error } = await supabase.from('gallery_items').update({ is_published: !item.is_published }).eq('id', item.id);
    if (error) { toast.error('Could not update this gallery item. Try again.'); return; }
    toast.success(!item.is_published ? 'Published' : 'Unpublished');
    load();
  }

  async function deleteItem(item: GalleryItem) {
    if (!confirm('Delete this gallery image?')) return;
    const { error } = await supabase.from('gallery_items').delete().eq('id', item.id);
    if (error) { toast.error('Could not delete this gallery item. Try again.'); return; }
    toast.success('Deleted');
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Gallery</h1>
          <p className="text-[#72727E] text-sm mt-1">Manage gallery images</p>
        </div>
        <button onClick={() => setCreating(!creating)} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
          + Add Image
        </button>
      </div>

      {creating && (
        <div className="glass rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">Add Gallery Image</h2>
            <button onClick={() => setCreating(false)} className="text-[#72727E] hover:text-white text-sm">Cancel</button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Upload Image</label>
              <div className="flex items-center gap-3">
                <label className="px-4 py-2.5 rounded-xl glass border border-white/10 text-sm text-[#A8A8B3] cursor-pointer hover:border-violet-500/30 transition-colors">
                  <span className="flex items-center gap-2">{uploading && <LoadingSpinner />}{uploading ? 'Uploading…' : 'Choose File'}</span>
                  <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
                <span className="text-xs text-[#72727E]">or</span>
                <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="Paste image URL"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
              {uploading && (
                <div className="mt-3 max-w-xs">
                  <ProgressIndicator progress={uploadProgress} size="sm" variant="bar" showPercent label="Uploading image" />
                </div>
              )}
              {form.image_url && <img src={form.image_url} alt="Selected gallery upload preview" loading="lazy" className="mt-3 w-24 h-24 object-cover rounded-lg" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
              <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Alt Text</label>
                <input value={form.alt_text} onChange={e => setForm(f => ({ ...f, alt_text: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
              <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50">
                  {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="accent-violet-500" />
              <span className="text-sm text-[#A8A8B3]">Published (visible to public)</span>
            </label>
          </div>
          <button onClick={save} disabled={saving || uploading} className="mt-5 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : 'Add to Gallery'}</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="aspect-square rounded-xl skeleton" />)}
        </div>
      ) : loadError ? (
        <FetchError message="Couldn’t load gallery items. Try again." onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-[#72727E] text-sm">No gallery items yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {items.map(item => (
            <div key={item.id} className="relative group">
              <img src={item.image_url} alt={item.alt_text || ''} loading="lazy" className="w-full aspect-square object-cover rounded-xl" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex flex-col items-center justify-center gap-2 p-2">
                <p className="text-white text-xs text-center truncate w-full">{item.title || item.category}</p>
                <button onClick={() => togglePublish(item)} className={`text-xs px-2 py-1 rounded ${item.is_published ? 'bg-gray-500/50 text-gray-300' : 'bg-green-500/50 text-green-300'}`}>
                  {item.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => deleteItem(item)} className="text-xs px-2 py-1 rounded bg-red-500/50 text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
