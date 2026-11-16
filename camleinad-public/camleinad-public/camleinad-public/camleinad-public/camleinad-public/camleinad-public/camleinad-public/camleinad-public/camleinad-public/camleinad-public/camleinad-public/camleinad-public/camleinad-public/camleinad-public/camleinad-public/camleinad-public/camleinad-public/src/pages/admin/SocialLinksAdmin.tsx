import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { SocialLink } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';

export default function SocialLinksAdmin() {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ url: '', label: '', is_active: true });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('social_links').select('*').order('sort_order');
    if (error) setLoadError(true);
    else setLinks((data || []).filter(link => !['x', 'twitter'].includes(link.platform.toLowerCase())));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit(l: SocialLink) {
    setEditingId(l.id);
    setEditForm({ url: l.url, label: l.label || '', is_active: l.is_active });
  }

  async function save(id: string) {
    setSaving(true);
    const { error } = await supabase.from('social_links').update({ ...editForm }).eq('id', id);
    setSaving(false);
    if (error) { toast.error('Could not save this social link. Try again.'); return; }
    toast.success('Link updated');
    setEditingId(null);
    load();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Social Links</h1>
        <p className="text-[#72727E] text-sm mt-1">Manage artist social media links</p>
      </div>

      {loading ? <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}</div> : loadError ? (
        <FetchError message="Couldn’t load social links. Try again." onRetry={() => void load()} />
      ) : (
        <div className="glass rounded-2xl border border-white/8 overflow-hidden">
          {links.map((l, i) => (
            <div key={l.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
              {editingId === l.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-violet-400 w-24 capitalize">{l.platform}</span>
                    <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} placeholder="Display label"
                      className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                    <input value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} placeholder="URL"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-violet-500" />
                      <span className="text-xs text-[#A8A8B3]">Active</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => save(l.id)} disabled={saving} className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-1.5 rounded-lg glass text-[#72727E] text-xs transition-colors hover:text-white">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white capitalize">{l.label || l.platform}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${l.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {l.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    <p className="text-xs text-[#72727E] truncate mt-0.5">{l.url}</p>
                  </div>
                  <button onClick={() => startEdit(l)} className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded transition-colors">Edit</button>
                </div>
              )}
            </div>
          ))}
          {links.length === 0 && <div className="p-8 text-center text-[#72727E] text-sm">No social links configured.</div>}
        </div>
      )}
    </div>
  );
}
