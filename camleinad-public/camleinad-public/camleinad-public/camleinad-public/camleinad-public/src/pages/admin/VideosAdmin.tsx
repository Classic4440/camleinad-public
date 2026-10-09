import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Video } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';

export default function VideosAdmin() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', youtube_id: '', url: '', thumbnail_url: '', description: '', category: 'official', is_published: false, published_at: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('videos').select('*').order('sort_order');
    if (error) setLoadError(true);
    else setVideos(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit(v: Video) {
    setEditing(v); setCreating(false);
    setForm({ title: v.title, youtube_id: v.youtube_id || '', url: v.url || '', thumbnail_url: v.thumbnail_url || '', description: v.description || '', category: v.category, is_published: v.is_published, published_at: v.published_at || '' });
  }

  function startCreate() {
    setCreating(true); setEditing(null);
    setForm({ title: '', youtube_id: '', url: '', thumbnail_url: '', description: '', category: 'official', is_published: false, published_at: '' });
  }

  async function save() {
    if (!form.title) { toast.error('Title is required'); return; }
    setSaving(true);
    const payload = { ...form, published_at: form.published_at || null };
    if (editing) {
      const { error } = await supabase.from('videos').update(payload).eq('id', editing.id);
      if (error) { toast.error('Could not save this video. Try again.'); setSaving(false); return; }
      toast.success('Video updated');
    } else {
      const { error } = await supabase.from('videos').insert(payload);
      if (error) { toast.error('Could not save this video. Try again.'); setSaving(false); return; }
      toast.success('Video added');
    }
    setSaving(false); setEditing(null); setCreating(false); load();
  }

  async function deleteVideo(v: Video) {
    if (!confirm(`Delete "${v.title}"?`)) return;
    const { error } = await supabase.from('videos').delete().eq('id', v.id);
    if (error) { toast.error('Could not delete this video. Try again.'); return; }
    toast.success('Video deleted'); load();
  }

  async function togglePublish(v: Video) {
    const { error } = await supabase.from('videos').update({ is_published: !v.is_published }).eq('id', v.id);
    if (error) { toast.error('Could not update this video. Try again.'); return; }
    toast.success(!v.is_published ? 'Published' : 'Unpublished'); load();
  }

  const isFormOpen = editing !== null || creating;
  const CATEGORIES = ['official', 'visualizer', 'lyric', 'behind-the-scenes', 'shorts'];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Videos</h1>
          <p className="text-[#72727E] text-sm mt-1">Manage video content</p>
        </div>
        <button onClick={startCreate} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">+ Add Video</button>
      </div>

      {isFormOpen && (
        <div className="glass rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">{editing ? 'Edit Video' : 'New Video'}</h2>
            <button onClick={() => { setEditing(null); setCreating(false); }} className="text-[#72727E] hover:text-white text-sm">Cancel</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
            <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">YouTube ID</label>
              <input value={form.youtube_id} onChange={e => setForm(f => ({ ...f, youtube_id: e.target.value }))} placeholder="e.g. dQw4w9WgXcQ"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
            <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Thumbnail URL</label>
              <input value={form.thumbnail_url} onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
            <div className="sm:col-span-2"><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Description</label>
              <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-violet-500/50" /></div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} className="accent-violet-500" />
              <span className="text-sm text-[#A8A8B3]">Published</span>
            </label>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : 'Save Video'}</span>
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}</div> : loadError ? (
        <FetchError message="Couldn’t load videos. Try again." onRetry={() => void load()} />
      ) : (
        <div className="glass rounded-2xl border border-white/8 overflow-hidden">
          {videos.map((v, i) => (
            <div key={v.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
              {v.youtube_id && <img src={`https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" loading="lazy" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{v.title}</p>
                <p className="text-xs text-[#72727E] capitalize">{v.category}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${v.is_published ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>{v.is_published ? 'Published' : 'Draft'}</span>
              <div className="flex gap-2">
                <button onClick={() => togglePublish(v)} className="text-xs text-[#72727E] hover:text-white px-2 py-1 rounded transition-colors">{v.is_published ? 'Unpublish' : 'Publish'}</button>
                <button onClick={() => startEdit(v)} className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded transition-colors">Edit</button>
                <button onClick={() => deleteVideo(v)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors">Delete</button>
              </div>
            </div>
          ))}
          {videos.length === 0 && <div className="p-8 text-center text-[#72727E] text-sm">No videos yet.</div>}
        </div>
      )}
    </div>
  );
}
