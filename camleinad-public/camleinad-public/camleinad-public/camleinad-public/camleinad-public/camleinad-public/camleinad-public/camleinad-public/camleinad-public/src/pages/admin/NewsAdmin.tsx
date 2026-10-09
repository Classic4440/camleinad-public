import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';
import ProgressIndicator from '@/components/ui/ProgressIndicator';
import { useUpload } from '@/lib/useUpload';
import { ImagePlus } from 'lucide-react';
import type { NewsArticle } from '@/types';

type NewsArticleWithCover = NewsArticle & { cover_url?: string | null };

export default function NewsAdmin() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<NewsArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', body: '', category: '', author: 'Cam Leinad', is_published: false, published_at: '', cover_url: '' });
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { upload, progress: coverUploadProgress } = useUpload();

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (error) setLoadError(true);
    else setArticles(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit(a: NewsArticle) {
    setEditing(a);
    setCreating(false);
    const article = a as NewsArticleWithCover;
    setForm({ title: a.title, slug: a.slug, excerpt: a.excerpt || '', body: a.body || '', category: a.category || '', author: a.author, is_published: a.is_published, published_at: a.published_at || '', cover_url: article.cover_url || a.cover_image_url || '' });
  }

  function startCreate() {
    setCreating(true); setEditing(null);
    setForm({ title: '', slug: '', excerpt: '', body: '', category: '', author: 'Cam Leinad', is_published: false, published_at: '', cover_url: '' });
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function handleCoverSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      console.error('[CoverUpload] Invalid image type:', file.type);
      toast.error('Please select an image file');
      return;
    }
    if (file.size >= 5 * 1024 * 1024) {
      console.error('[CoverUpload] Image exceeds 5 MB:', file.size);
      toast.error('Cover image must be under 5 MB');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const slug = (form.slug || autoSlug(form.title) || 'article').trim() || 'article';
    setCoverUploading(true);
    try {
      const { publicUrl } = await upload({
        bucket: 'gallery',
        path: `news/${slug}-${Date.now()}.${extension}`,
        file,
        contentType: file.type,
      });
      setForm(current => ({ ...current, cover_url: publicUrl }));
      toast.success('Cover image uploaded');
    } catch (error) {
      console.error('[CoverUpload] Failed:', error);
      toast.error('Could not upload the cover image. Try again.');
    } finally {
      setCoverUploading(false);
    }
  }

  async function save() {
    if (!form.title || !form.slug) { toast.error('Title and slug are required'); return; }
    setSaving(true);
    const payload = { ...form, cover_url: form.cover_url || null, published_at: form.is_published && !form.published_at ? new Date().toISOString() : form.published_at || null };
    if (editing) {
      const { error } = await supabase.from('news').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) { toast.error('Could not save this article. Try again.'); setSaving(false); return; }
      toast.success('Article updated');
    } else {
      const { error } = await supabase.from('news').insert({ ...payload });
      if (error) { toast.error('Could not save this article. Try again.'); setSaving(false); return; }
      toast.success('Article created');
    }
    setSaving(false); setEditing(null); setCreating(false); load();
  }

  async function deleteArticle(a: NewsArticle) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    const { error } = await supabase.from('news').delete().eq('id', a.id);
    if (error) { toast.error('Could not delete this article. Try again.'); return; }
    toast.success('Article deleted');
    load();
  }

  async function togglePublish(a: NewsArticle) {
    const is_published = !a.is_published;
    const { error } = await supabase.from('news').update({ is_published, published_at: is_published ? new Date().toISOString() : null }).eq('id', a.id);
    if (error) { toast.error('Could not update this article. Try again.'); return; }
    toast.success(is_published ? 'Published' : 'Unpublished');
    load();
  }

  const isFormOpen = editing !== null || creating;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>News</h1>
          <p className="text-[#72727E] text-sm mt-1">Publish articles and updates</p>
        </div>
        <button onClick={startCreate} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
          + New Article
        </button>
      </div>

      {isFormOpen && (
        <div className="glass rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">{editing ? 'Edit Article' : 'New Article'}</h2>
            <button onClick={() => { setEditing(null); setCreating(false); }} className="text-[#72727E] hover:text-white text-sm">Cancel</button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: f.slug || autoSlug(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Slug *</label>
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Category</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Release Announcement"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Author</label>
                <input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Excerpt</label>
              <textarea rows={2} value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-violet-500/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase text-[var(--ink-muted)]">Cover image</label>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverSelect} />
              {form.cover_url ? (
                <div className="max-w-xl">
                  <img src={form.cover_url} alt="News cover preview" className="aspect-[16/9] w-full object-cover" />
                  <button type="button" onClick={() => coverInputRef.current?.click()} className="mt-2 text-sm text-[var(--accent)] underline underline-offset-4">Replace</button>
                </div>
              ) : (
                <button type="button" onClick={() => coverInputRef.current?.click()} className="flex aspect-[16/9] w-full max-w-xl flex-col items-center justify-center gap-2 border border-dashed border-[var(--rule)] bg-[var(--surface)] text-sm text-[var(--ink-muted)]">
                  <ImagePlus aria-hidden="true" className="h-5 w-5" />
                  Choose a 16:9 cover image
                </button>
              )}
              {coverUploading && <div className="mt-2 max-w-xl"><ProgressIndicator progress={coverUploadProgress} label="Uploading cover" showPercent /></div>}
            </div>
            <div>
              <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Body</label>
              <textarea rows={8} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm resize-none font-mono focus:outline-none focus:border-violet-500/50" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="accent-violet-500" />
              <span className="text-sm text-[#A8A8B3]">Published (visible to public)</span>
            </label>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : 'Save Article'}</span>
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}</div> : loadError ? (
        <FetchError message="Couldn’t load articles. Try again." onRetry={() => void load()} />
      ) : (
        <div className="glass rounded-2xl border border-white/8 overflow-hidden">
          {articles.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.title}</p>
                <p className="text-xs text-[#72727E]">{a.category} · {a.author} · {formatDate(a.published_at || a.created_at)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_published ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                {a.is_published ? 'Published' : 'Draft'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => togglePublish(a)} className="text-xs text-[#72727E] hover:text-white px-2 py-1 rounded transition-colors">
                  {a.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => startEdit(a)} className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded transition-colors">Edit</button>
                <button onClick={() => deleteArticle(a)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors">Delete</button>
              </div>
            </div>
          ))}
          {articles.length === 0 && <div className="p-8 text-center text-[#72727E] text-sm">No articles yet.</div>}
        </div>
      )}
    </div>
  );
}
