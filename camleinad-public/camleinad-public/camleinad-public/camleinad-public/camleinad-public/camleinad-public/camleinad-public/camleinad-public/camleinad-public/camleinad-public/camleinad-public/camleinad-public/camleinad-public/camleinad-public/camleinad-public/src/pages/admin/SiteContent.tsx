import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';
import { DEFAULT_LABEL_SHORT_FORM, DEFAULT_RECORD_LABEL_NAME } from '@/lib/utils';

const EDITABLE_KEYS = [
  { key: 'record_label_name', label: 'Record Label Name', group: 'Identity' },
  { key: 'label_short_form', label: 'Label Short Form', group: 'Identity' },
  { key: 'artist_name', label: 'Artist Name', group: 'Identity' },
  { key: 'artist_genre', label: 'Primary Genre', group: 'Identity' },
  { key: 'artist_genre_secondary', label: 'Secondary Genre', group: 'Identity' },
  { key: 'contact_email', label: 'Contact Email', group: 'Identity' },
  { key: 'hero_eyebrow', label: 'Hero Eyebrow Text', group: 'Homepage' },
  { key: 'hero_subtitle', label: 'Hero Subtitle', group: 'Homepage' },
  { key: 'hero_description', label: 'Hero Description', group: 'Homepage' },
  { key: 'artist_bio_short', label: 'Short Bio', group: 'About' },
  { key: 'artist_bio_full', label: 'Full Bio', group: 'About' },
  { key: 'artist_story', label: 'Story Behind the Name', group: 'About' },
  { key: 'artist_timeline', label: 'Timeline Events (year | title | description, one per line)', group: 'About' },
  { key: 'ai_human_text', label: 'AI + Human Section Text', group: 'About' },
  { key: 'seo_title', label: 'SEO Title', group: 'SEO' },
  { key: 'seo_description', label: 'SEO Description', group: 'SEO' },
  { key: 'announcement_enabled', label: 'Enable Site-wide Announcement', group: 'Announcement' },
  { key: 'announcement_text', label: 'Announcement Text', group: 'Announcement' },
  { key: 'announcement_link_target', label: 'Announcement Link Target (optional URL or site path)', group: 'Announcement' },
  { key: 'announcement_start_at', label: 'Announcement Starts', group: 'Announcement' },
  { key: 'announcement_end_at', label: 'Announcement Ends', group: 'Announcement' },
];

const LONG_TEXT_KEYS = ['artist_bio_full', 'artist_story', 'artist_timeline', 'ai_human_text', 'seo_description'];
const ANNOUNCEMENT_TIME_KEYS = ['announcement_start_at', 'announcement_end_at'];

const GROUPS = ['Identity', 'Homepage', 'About', 'SEO', 'Announcement'];

function toDatetimeLocal(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function SiteContent() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase.from('site_settings').select('key,value');
      if (!active) return;
      if (error) { setLoadError(true); setLoading(false); return; }
      const map: Record<string, string> = {};
      data?.forEach(r => {
        map[r.key] = r.value || '';
        if (ANNOUNCEMENT_TIME_KEYS.includes(r.key)) map[r.key] = toDatetimeLocal(r.value || '');
      });
      setSettings({
        ...map,
        record_label_name: map.record_label_name || DEFAULT_RECORD_LABEL_NAME,
        label_short_form: map.label_short_form || DEFAULT_LABEL_SHORT_FORM,
      });
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  function change(key: string, value: string) {
    setSettings(s => ({ ...s, [key]: value }));
    setDirty(d => new Set(d).add(key));
  }

  async function save() {
    if (dirty.size === 0) return;
    if (settings.announcement_enabled === 'true') {
      const start = Date.parse(settings.announcement_start_at || '');
      const end = Date.parse(settings.announcement_end_at || '');
      if (!settings.announcement_text?.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        toast.error('Add announcement text and a valid start/end time before activating it.');
        return;
      }
    }
    setSaving(true);
    const updates = Array.from(dirty).map(key => ({
      key,
      value: ANNOUNCEMENT_TIME_KEYS.includes(key) && settings[key]
        ? new Date(settings[key]).toISOString()
        : settings[key],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('site_settings').upsert(updates, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error('Could not save site content. Try again.'); return; }
    setDirty(new Set());
    toast.success(`${updates.length} setting${updates.length > 1 ? 's' : ''} saved`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Site Content</h1>
          <p className="text-[#72727E] text-sm mt-1">Edit public website content and metadata</p>
        </div>
        <button onClick={save} disabled={saving || dirty.size === 0}
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-40">
          <span className="flex items-center gap-2">{saving && <LoadingSpinner />}{saving ? 'Saving…' : `Save Changes${dirty.size > 0 ? ` (${dirty.size})` : ''}`}</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>
      ) : loadError ? (
        <FetchError message="Couldn’t load site content. Try again." onRetry={() => setRetryCount(count => count + 1)} />
      ) : (
        <div className="space-y-10">
          {GROUPS.map(group => {
            const keys = EDITABLE_KEYS.filter(k => k.group === group);
            return (
              <div key={group}>
                <h2 className="text-xs uppercase tracking-[0.3em] text-violet-400 font-semibold mb-4">{group}</h2>
                <div className="glass rounded-2xl border border-white/8 overflow-hidden">
                  {keys.map((item, i) => (
                    <div key={item.key} className={`p-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                      <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">
                        {item.label}
                        {dirty.has(item.key) && <span className="ml-2 text-amber-400">●</span>}
                      </label>
                      {LONG_TEXT_KEYS.includes(item.key) ? (
                        <textarea
                          rows={4}
                          value={settings[item.key] || ''}
                          onChange={e => change(item.key, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-y focus:outline-none focus:border-violet-500/50 min-h-[80px]"
                        />
                      ) : ANNOUNCEMENT_TIME_KEYS.includes(item.key) ? (
                        <input
                          type="datetime-local"
                          value={settings[item.key] || ''}
                          onChange={e => change(item.key, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                        />
                      ) : item.key === 'announcement_enabled' ? (
                        <label className="flex items-center gap-3 text-sm text-[#A8A8B3]">
                          <input
                            type="checkbox"
                            checked={settings.announcement_enabled === 'true'}
                            onChange={e => change('announcement_enabled', String(e.target.checked))}
                            className="h-4 w-4 accent-violet-500"
                          />
                          Show the announcement during its scheduled window
                        </label>
                      ) : (
                        <input
                          type="text"
                          value={settings[item.key] || ''}
                          onChange={e => change(item.key, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
