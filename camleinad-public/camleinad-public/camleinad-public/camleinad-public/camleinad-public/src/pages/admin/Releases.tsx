import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatDate, getStatusLabel, getStatusClass, getTypeLabel, cn } from '@/lib/utils';
import { thumbUrl } from '@/lib/imageUrl';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';
import AudioTeaserEditor from '@/components/admin/AudioTeaserEditor';
import LyricsEditor from '@/components/admin/LyricsEditor';
import type { Release, Track, StreamingLink } from '@/types';
import { Copy, Disc3, Download, Guitar, Mic, Music } from 'lucide-react';
import ProgressIndicator from '@/components/ui/ProgressIndicator';
import { useUpload } from '@/lib/useUpload';

const STATUSES = ['DRAFT', 'IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED', 'RELEASED', 'ARCHIVED'];
const TYPES = ['SINGLE', 'EP', 'ALBUM', 'COMPILATION'];
const STREAMING_PLATFORMS = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple_music', label: 'Apple Music' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'youtube_music', label: 'YouTube Music' },
  { value: 'audiomack', label: 'Audiomack' },
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'tidal', label: 'Tidal' },
  { value: 'deezer', label: 'Deezer' },
  { value: 'other', label: 'Other' },
];
const STEM_OPTIONS = [
  { key: 'vocals', label: 'Vocals', Icon: Mic },
  { key: 'drums', label: 'Drums', Icon: Disc3 },
  { key: 'bass', label: 'Bass', Icon: Guitar },
  { key: 'other', label: 'Other', Icon: Music },
] as const;

interface EditForm {
  title: string;
  slug: string;
  type: string;
  status: string;
  release_date: string;
  description: string;
  featured: boolean;
  featured_track_id: string;
  show_upcoming_publicly: boolean;
}

interface TrackWithUpload extends Track {
  _uploading?: boolean;
  _uploadProgress?: number;
  _uploadPhase?: 'preparing' | 'uploading' | 'finalizing';
  _editingTeaser?: boolean;
  _editingLyrics?: boolean;
  _editingStems?: boolean;
  _downloadingStem?: string | null;
  _stemDownloadProgress?: Record<string, number>;
  _teaserSaving?: boolean;
}

interface StreamingForm {
  platform: string;
  url: string;
  label: string;
}

export default function ReleasesAdmin() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Release | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EditForm>({
    title: '', slug: '', type: 'SINGLE', status: 'DRAFT',
    release_date: '', description: '', featured: false, featured_track_id: '', show_upcoming_publicly: false,
  });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Record<string, TrackWithUpload[]>>({});
  const [streamingLinks, setStreamingLinks] = useState<Record<string, StreamingLink[]>>({});

  const [artworkUploading, setArtworkUploading] = useState(false);
  const [artworkProgress, setArtworkProgress] = useState(0);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const { upload: uploadFile } = useUpload();

  const [addingLink, setAddingLink] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<StreamingForm>({ platform: 'spotify', url: '', label: '' });
  const [linkSuggestions, setLinkSuggestions] = useState<Array<{ url: string; label: string | null }>>([]);
  const [savingLink, setSavingLink] = useState(false);

  const audioInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from('releases').select('*').order('sort_order');
    if (error) setLoadError(true);
    else setReleases(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startEdit(r: Release) {
    setEditing(r);
    setCreating(false);
    setArtworkPreview(r.artwork_url);
    setForm({
      title: r.title, slug: r.slug, type: r.type, status: r.status,
      release_date: r.release_date || '', description: r.description || '',
      featured: r.featured, featured_track_id: r.featured_track_id || '', show_upcoming_publicly: r.show_upcoming_publicly,
    });
    void loadTracks(r.id);
    loadStreamingLinks(r.id);
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setArtworkPreview(null);
    setForm({
      title: '', slug: '', type: 'SINGLE', status: 'DRAFT',
      release_date: '', description: '', featured: false, featured_track_id: '', show_upcoming_publicly: false,
    });
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function handleArtworkSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }

    setArtworkUploading(true);
    setArtworkProgress(0);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const slug = form.slug || `release-${Date.now()}`;
    const path = `${slug}/cover.${ext}`;

    try {
      const { publicUrl } = await uploadFile({
        bucket: 'album-art',
        path,
        file,
        contentType: file.type || 'image/jpeg',
        onProgress: (pct) => setArtworkProgress(pct),
      });

      setArtworkPreview(publicUrl);

      if (editing) {
        const { error } = await supabase.from('releases').update({ artwork_url: publicUrl }).eq('id', editing.id);
        if (error) { toast.error('Could not save the artwork. Try again.'); } else { toast.success('Artwork updated'); load(); }
      }
    } catch {
      toast.error('Could not upload the artwork. Try again.');
    } finally {
      setArtworkUploading(false);
      setArtworkProgress(0);
    }
  }

  async function save() {
    if (!form.title || !form.slug) { toast.error('Title and slug are required'); return; }
    setSaving(true);

    const payload = {
      ...form,
      featured_track_id: form.featured ? (form.featured_track_id || null) : null,
      release_date: form.release_date || null,
      artwork_url: artworkPreview || (editing?.artwork_url ?? null),
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase.from('releases').update(payload).eq('id', editing.id);
      if (error) { toast.error('Could not save this release. Try again.'); setSaving(false); return; }
      toast.success('Release updated');
    } else {
      const { error } = await supabase.from('releases').insert(payload);
      if (error) { toast.error('Could not save this release. Try again.'); setSaving(false); return; }
      toast.success('Release created');
    }

    setSaving(false);
    setEditing(null);
    setCreating(false);
    setArtworkPreview(null);
    load();
  }

  async function deleteRelease(r: Release) {
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('releases').delete().eq('id', r.id);
    if (error) { toast.error('Could not delete this release. Try again.'); return; }
    toast.success('Release deleted');
    load();
  }

  async function loadTracks(releaseId: string) {
    const { data, error } = await supabase.from('tracks').select('*').eq('release_id', releaseId).order('track_number');
    if (error) { toast.error('Could not load tracks. Try again.'); return; }
    setTracks(t => ({ ...t, [releaseId]: data || [] }));
    setExpandedId(prev => prev === releaseId ? null : releaseId);
  }

  async function addTrack(releaseId: string) {
    const title = prompt('Track title:');
    if (!title?.trim()) return;
    const num = (tracks[releaseId]?.length || 0) + 1;
    const { error } = await supabase.from('tracks').insert({
      release_id: releaseId,
      title: title.trim(),
      track_number: num,
      status: 'DRAFT',
    });
    if (error) { toast.error('Could not add this track. Try again.'); return; }
    const { data, error: loadError } = await supabase.from('tracks').select('*').eq('release_id', releaseId).order('track_number');
    if (loadError) { toast.error('Track added, but the list could not refresh. Retry by opening tracks again.'); return; }
    setTracks(t => ({ ...t, [releaseId]: data || [] }));
    toast.success('Track added');
  }

  async function updateTrackStatus(trackId: string, releaseId: string, status: string) {
    const { error } = await supabase.from('tracks').update({ status }).eq('id', trackId);
    if (error) { toast.error('Could not update the track. Try again.'); return; }
    setTracks(t => ({
      ...t,
      [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, status } : tr) || [],
    }));
  }

  async function updateTrackTitle(trackId: string, releaseId: string, title: string) {
    if (!title.trim()) return;
    const { error } = await supabase.from('tracks').update({ title: title.trim() }).eq('id', trackId);
    if (error) { toast.error('Could not update the track. Try again.'); return; }
    setTracks(t => ({
      ...t,
      [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, title: title.trim() } : tr) || [],
    }));
  }

  async function deleteTrack(trackId: string, releaseId: string) {
    if (!confirm('Delete this track?')) return;
    const { error } = await supabase.from('tracks').delete().eq('id', trackId);
    if (error) { toast.error('Could not delete this track. Try again.'); return; }
    const { data, error: loadError } = await supabase.from('tracks').select('*').eq('release_id', releaseId).order('track_number');
    if (loadError) { toast.error('Track deleted, but the list could not refresh. Retry by opening tracks again.'); return; }
    setTracks(t => ({ ...t, [releaseId]: data || [] }));
    toast.success('Track deleted');
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>, track: TrackWithUpload, releaseId: string) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg'];
    if (!allowed.includes(file.type)) { toast.error('Please upload an MP3, WAV, FLAC, or AAC file'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('Audio file must be under 100MB'); return; }

    setTracks(t => ({
      ...t,
      [releaseId]: t[releaseId]?.map(tr => tr.id === track.id ? { ...tr, _uploading: true, _uploadProgress: 0, _uploadPhase: 'preparing' } : tr) || [],
    }));

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const path = `tracks/${track.id}.${ext}`;

    try {
      const { publicUrl } = await uploadFile({
        bucket: 'audio-files',
        path,
        file,
        contentType: file.type || 'audio/mpeg',
        onProgress: (pct) => {
          setTracks(t => ({
            ...t,
            [releaseId]: t[releaseId]?.map(tr => tr.id === track.id
              ? {
                  ...tr,
                  _uploadProgress: pct,
                  _uploadPhase: pct < 15 ? 'preparing' : pct < 90 ? 'uploading' : 'finalizing',
                }
              : tr) || [],
          }));
        },
      });

      const { error: dbError } = await supabase.from('tracks').update({ audio_url: publicUrl }).eq('id', track.id);
      if (dbError) {
        toast.error('Audio uploaded, but the track could not be updated. Try again.');
        return;
      }

      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === track.id
          ? { ...tr, audio_url: publicUrl, _uploading: false, _uploadProgress: 0, _uploadPhase: undefined }
          : tr) || [],
      }));
      toast.success(`Audio uploaded for "${track.title}"`);

      if (audioInputRefs.current[track.id]) {
        audioInputRefs.current[track.id]!.value = '';
      }
    } catch {
      toast.error('Could not upload the audio. Try again.');
    } finally {
      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === track.id ? { ...tr, _uploading: false, _uploadProgress: 0, _uploadPhase: undefined } : tr) || [],
      }));
    }
  }

  // ─── Teaser Editor ──────────────────────────────────────────────────────
  // Uploads via the server-side Cloudflare Pages Function at /api/upload-teaser
  // because Supabase Storage RLS misidentifies authenticated requests as anon
  // when the project uses JWT Signing Keys. The service-role key on the server
  // bypasses RLS entirely.
  async function handleTeaserSave(
    trackId: string,
    releaseId: string,
    blob: Blob,
    meta: { start: number; end: number; label?: string }
  ): Promise<void> {
    const track = tracks[releaseId]?.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found in state');

    setTracks(t => ({
      ...t,
      [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: true } : tr) || [],
    }));

    const path = `${trackId}/teaser-${Date.now()}.mp3`;

    console.log('[TeaserSave] Starting server upload:', {
      path,
      size: blob.size,
      type: blob.type,
    });

    // ── Convert blob to base64 ──
    let fileBase64: string;
    try {
      fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('[TeaserSave] Base64 encode failed:', err);
      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
      }));
      throw err;
    }

    // ── Get current session JWT ──
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('[TeaserSave] No active session');
      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
      }));
      throw new Error('Not authenticated');
    }

    // ── POST to the server function ──
    let publicUrl: string;
    try {
      const res = await fetch('/api/upload-teaser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          path,
          fileBase64,
          contentType: 'audio/mpeg',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[TeaserSave] Server upload failed:', {
          status: res.status,
          body: errText,
        });
        setTracks(t => ({
          ...t,
          [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
        }));
        throw new Error(`Server upload failed: ${res.status}`);
      }

      const json = await res.json();
      if (!json?.publicUrl) {
        console.error('[TeaserSave] Server response missing publicUrl:', json);
        setTracks(t => ({
          ...t,
          [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
        }));
        throw new Error('Server response missing publicUrl');
      }

      publicUrl = json.publicUrl;
      console.log('[TeaserSave] Server upload OK:', publicUrl);
    } catch (err) {
      console.error('[TeaserSave] Upload request threw:', err);
      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
      }));
      throw err;
    }

    // ── Save teaser metadata to the track row ──
    const { error: dbError } = await supabase
      .from('tracks')
      .update({
        teaser_enabled: true,
        teaser_start_seconds: Math.floor(meta.start),
        teaser_end_seconds: Math.ceil(meta.end),
        teaser_label: meta.label || null,
        teaser_audio_url: publicUrl,
      })
      .eq('id', trackId);

    if (dbError) {
      console.error('[TeaserSave] DB update failed:', dbError);
      setTracks(t => ({
        ...t,
        [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? { ...tr, _teaserSaving: false } : tr) || [],
      }));
      throw dbError;
    }

    // ── Success: update local state ──
    setTracks(t => ({
      ...t,
      [releaseId]: t[releaseId]?.map(tr => tr.id === trackId ? {
        ...tr,
        teaser_enabled: true,
        teaser_start_seconds: Math.floor(meta.start),
        teaser_end_seconds: Math.ceil(meta.end),
        teaser_label: meta.label || null,
        teaser_audio_url: publicUrl,
        _editingTeaser: false,
        _teaserSaving: false,
      } : tr) || [],
    }));

    console.log('[TeaserSave] Complete. Teaser URL:', publicUrl);
  }

  async function handleLyricsSave(trackId: string, releaseId: string, lyrics: string, lyricsSynced: Array<{ time: number; line: string }> | null): Promise<void> {
    const { data, error } = await supabase
      .from('tracks')
      .update({ lyrics, lyrics_synced: lyricsSynced })
      .eq('id', trackId)
      .select('*')
      .single();
    if (error) throw error;
    setTracks(current => ({
      ...current,
      [releaseId]: current[releaseId]?.map(track => track.id === trackId
        ? { ...track, ...data, _editingLyrics: false }
        : track) || [],
    }));
    toast.success('Lyrics saved.');
  }

  async function downloadStem(trackId: string, releaseId: string, stem: string, path: string) {
    setTracks(current => ({
      ...current,
      [releaseId]: current[releaseId]?.map(track => track.id === trackId ? { ...track, _downloadingStem: stem } : track) || [],
    }));
    try {
      const { data, error } = await supabase.storage.from('stems').createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        toast.error('Could not generate download link');
        return;
      }
      window.open(data.signedUrl, '_blank');
    } catch {
      toast.error('Could not generate download link');
    } finally {
      setTracks(current => ({
        ...current,
        [releaseId]: current[releaseId]?.map(track => track.id === trackId ? { ...track, _downloadingStem: null } : track) || [],
      }));
    }
  }

  async function copyStemPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Path copied');
    } catch {
      toast.error('Could not copy path');
    }
  }

  async function loadStreamingLinks(releaseId: string) {
    const { data, error } = await supabase.from('streaming_links').select('*').eq('release_id', releaseId);
    if (error) { toast.error('Could not load streaming links. Try again.'); return; }
    setStreamingLinks(s => ({ ...s, [releaseId]: data || [] }));
  }

  async function loadLinkSuggestions(platform: string) {
    const { data, error } = await supabase
      .from('streaming_links')
      .select('url,label')
      .eq('platform', platform)
      .order('url');
    if (error) return;
    const uniqueSuggestions = Array.from(new Map((data || [])
      .filter((item): item is { url: string; label: string | null } => Boolean(item?.url))
      .map(item => [item.url, { url: item.url, label: item.label || null }]))
      .values());
    setLinkSuggestions(uniqueSuggestions);
  }

  async function saveStreamingLink(releaseId: string) {
    if (!linkForm.url.trim()) { toast.error('URL is required'); return; }
    setSavingLink(true);

    const platformLabel = STREAMING_PLATFORMS.find(p => p.value === linkForm.platform)?.label || linkForm.platform;
    const { error } = await supabase.from('streaming_links').insert({
      release_id: releaseId,
      platform: linkForm.platform,
      url: linkForm.url.trim(),
      label: linkForm.label.trim() || platformLabel,
    });

    setSavingLink(false);
    if (error) { toast.error('Could not add this streaming link. Try again.'); return; }
    toast.success('Streaming link added');
    setAddingLink(null);
    setLinkForm({ platform: 'spotify', url: '', label: '' });
    loadStreamingLinks(releaseId);
  }

  async function deleteStreamingLink(linkId: string, releaseId: string) {
    const { error } = await supabase.from('streaming_links').delete().eq('id', linkId);
    if (error) { toast.error('Could not delete this streaming link. Try again.'); return; }
    setStreamingLinks(s => ({
      ...s,
      [releaseId]: s[releaseId]?.filter(l => l.id !== linkId) || [],
    }));
    toast.success('Link removed');
  }

  async function toggleExpandedRelease(releaseId: string) {
    if (expandedId === releaseId) {
      setExpandedId(null);
    } else {
      await loadTracks(releaseId);
      await loadStreamingLinks(releaseId);
    }
  }

  const isFormOpen = editing !== null || creating;
  const currentArtwork = artworkPreview || editing?.artwork_url || null;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Releases</h1>
          <p className="text-[#72727E] text-sm mt-1">Manage music catalog, tracks, artwork, audio & streaming links</p>
        </div>
        <button onClick={startCreate} className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
          + New Release
        </button>
      </div>

      {isFormOpen && (
        <div className="glass rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">{editing ? `Edit: ${editing.title}` : 'New Release'}</h2>
            <button onClick={() => { setEditing(null); setCreating(false); setArtworkPreview(null); }}
              className="text-[#72727E] hover:text-white text-sm transition-colors">
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr] gap-6">
            <div>
              <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Cover Art</label>
              <div
                onClick={() => artworkInputRef.current?.click()}
                className={cn(
                  'relative aspect-square rounded-xl overflow-hidden cursor-pointer group border-2 border-dashed transition-colors',
                  artworkUploading ? 'border-violet-500/50' : 'border-white/10 hover:border-violet-500/40'
                )}
              >
                {currentArtwork ? (
                  <>
                    <img src={thumbUrl(currentArtwork)} alt="Release artwork" width={200} height={200} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white text-xs font-medium text-center px-2">
                        {artworkUploading ? 'Uploading…' : 'Click to replace'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-white/3">
                    {artworkUploading ? (
                      <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg className="w-8 h-8 text-[#72727E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-[#72727E] text-center">Upload artwork<br /><span className="text-[#52525E]">JPG, PNG, WebP</span></p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={artworkInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleArtworkSelect}
              />
              <p className="text-[11px] text-[#52525E] mt-1.5 text-center">Max 10MB · 1:1 ratio recommended</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: creating ? autoSlug(e.target.value) : f.slug }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Slug *</label>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50">
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50">
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Release Date</label>
                <input type="date" value={form.release_date} onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50" />
              </div>
              <div className="flex items-center gap-6 pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked, featured_track_id: e.target.checked ? f.featured_track_id : '' }))} className="accent-violet-500" />
                  <span className="text-sm text-[#A8A8B3]">Featured</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.show_upcoming_publicly} onChange={e => setForm(f => ({ ...f, show_upcoming_publicly: e.target.checked }))} className="accent-violet-500" />
                  <span className="text-sm text-[#A8A8B3]">Show upcoming publicly</span>
                </label>
              </div>
              {form.featured && (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Featured track</label>
                  <select
                    value={form.featured_track_id}
                    onChange={e => setForm(f => ({ ...f, featured_track_id: e.target.value }))}
                    className="w-full bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="">None</option>
                    {(tracks[editing?.id || ''] || []).filter(track => track.status === 'RELEASED' || track.status === 'UPCOMING' || track.status === 'SCHEDULED' || track.status === 'IN_DEVELOPMENT').sort((a, b) => a.track_number - b.track_number).map(track => (
                      <option key={track.id} value={track.id}>{String(track.track_number).padStart(2, '0')} — {track.title}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
          </div>

          {editing && (
            <div className="mt-6 border-t border-white/5 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-[#72727E]">Streaming Links</p>
                <button onClick={async () => {
                  setAddingLink(editing.id);
                  setLinkForm({ platform: 'spotify', url: '', label: '' });
                  await loadLinkSuggestions('spotify');
                }}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  + Add Link
                </button>
              </div>

              {addingLink === editing.id && (
                <div className="glass rounded-xl p-4 mb-3 border border-white/8">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[#72727E] mb-1">Platform</label>
                      <select value={linkForm.platform} onChange={async e => {
                        const nextPlatform = e.target.value;
                        setLinkForm(f => ({ ...f, platform: nextPlatform }));
                        await loadLinkSuggestions(nextPlatform);
                      }}
                        className="w-full bg-[#14141D] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/50">
                        {STREAMING_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#72727E] mb-1">URL *</label>
                      <input
                        list={`streaming-suggestions-${editing.id}`}
                        value={linkForm.url}
                        onChange={e => {
                          const nextUrl = e.target.value;
                          const matchingSuggestion = linkSuggestions.find(link => link.url === nextUrl);
                          setLinkForm(f => ({
                            ...f,
                            url: nextUrl,
                            label: matchingSuggestion && !f.label.trim() ? matchingSuggestion.label || f.label : f.label,
                          }));
                        }}
                        placeholder="https://..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/50" 
                      />
                      <datalist id={`streaming-suggestions-${editing.id}`}>
                        {linkSuggestions.map(link => (
                          <option key={`${link.url}-${link.label ?? 'custom'}`} value={link.url} label={link.label || ''} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs text-[#72727E] mb-1">Custom Label (optional)</label>
                      <input value={linkForm.label} onChange={e => setLinkForm(f => ({ ...f, label: e.target.value }))}
                        placeholder="Listen on Spotify"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-[#72727E]">Type a new link, or pick from links you've used before.</p>
                  <div className="flex gap-2">
                    <button onClick={() => saveStreamingLink(editing.id)} disabled={savingLink || !linkForm.url}
                      className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                      <span className="flex items-center gap-2">{savingLink && <LoadingSpinner />}{savingLink ? 'Adding…' : 'Add Link'}</span>
                    </button>
                    <button onClick={() => setAddingLink(null)}
                      className="px-4 py-1.5 rounded-lg glass text-[#72727E] hover:text-white text-xs transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {streamingLinks[editing.id]?.length > 0 ? (
                <div className="space-y-2">
                  {streamingLinks[editing.id].map(link => (
                    <div key={link.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                      <span className="w-24 text-xs font-medium text-violet-400 capitalize">{link.platform.replace('_', ' ')}</span>
                      <span className="text-xs text-[#A8A8B3] flex-1 truncate">{link.label || link.url}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer"
                        className="text-[#72727E] hover:text-white transition-colors text-xs">↗</a>
                      <button onClick={() => deleteStreamingLink(link.id, editing.id)}
                        className="text-red-400/70 hover:text-red-400 transition-colors text-xs ml-1">✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#52525E] py-2">No streaming links yet. Add links above.</p>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={saving || artworkUploading}
              className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              <span className="flex items-center gap-2">{(saving || artworkUploading) && <LoadingSpinner />}{saving ? 'Saving…' : artworkUploading ? 'Uploading artwork…' : 'Save Release'}</span>
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
      ) : loadError ? (
        <FetchError message="Couldn't load releases. Try again." onRetry={() => void load()} />
      ) : (
        <div className="glass rounded-2xl border border-white/8 overflow-hidden">
          {releases.map((r, i) => (
            <div key={r.id} className={i > 0 ? 'border-t border-white/5' : ''}>
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                  {r.artwork_url ? (
                    <img src={thumbUrl(r.artwork_url)} alt={`${r.title} artwork`} width={200} height={200} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-violet-500/20 flex items-center justify-center">
                      <span className="text-xs text-violet-400">♪</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{r.title}</p>
                  <p className="text-xs text-[#72727E]">
                    {getTypeLabel(r.type)}{r.release_date ? ` · ${formatDate(r.release_date)}` : ''}
                  </p>
                </div>
                <span className={getStatusClass(r.status)}>{getStatusLabel(r.status)}</span>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleExpandedRelease(r.id)}
                    className="text-xs text-[#72727E] hover:text-white px-2 py-1 rounded transition-colors"
                  >
                    Tracks {expandedId === r.id ? '▲' : '▼'}
                  </button>
                  <button onClick={() => startEdit(r)} className="text-xs text-violet-400 hover:text-violet-300 px-2 py-1 rounded transition-colors">Edit</button>
                  <button onClick={() => deleteRelease(r)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors">Delete</button>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="bg-white/2 border-t border-white/5">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs uppercase tracking-wider text-[#72727E]">
                        Tracks ({tracks[r.id]?.length || 0})
                      </p>
                      <button onClick={() => addTrack(r.id)} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                        + Add Track
                      </button>
                    </div>

                    {(!tracks[r.id] || tracks[r.id].length === 0) ? (
                      <p className="text-xs text-[#52525E] py-2">No tracks yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {tracks[r.id].map((track) => {
                          const isTeaserEligible = ['IN_DEVELOPMENT', 'UPCOMING', 'SCHEDULED'].includes(r.status);

                          return (
                            <div key={track.id}>
                              <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/3 border border-white/5 group">
                                <span className="text-xs text-[#72727E] w-5 flex-shrink-0 text-center">{track.track_number}</span>

                                <input
                                  defaultValue={track.title}
                                  onBlur={e => updateTrackTitle(track.id, r.id, e.target.value)}
                                  className="flex-1 bg-transparent text-sm text-white focus:outline-none focus:border-b focus:border-violet-500/50 min-w-0"
                                />

                                <select
                                  value={track.status}
                                  onChange={e => updateTrackStatus(track.id, r.id, e.target.value)}
                                  className="text-xs bg-[#0D0D14] border border-white/10 rounded-lg px-2 py-1 text-[#A8A8B3] flex-shrink-0 focus:outline-none"
                                >
                                  {['DRAFT', 'RELEASED', 'UPCOMING'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {track._uploading ? (
                                    <div className="flex min-w-[180px] items-center gap-2">
                                      <ProgressIndicator
                                        progress={track._uploadPhase === 'preparing' ? undefined : track._uploadProgress}
                                        size="sm"
                                        variant="bar"
                                        showPercent={track._uploadPhase === 'uploading'}
                                        label={track._uploadPhase === 'preparing' ? 'Preparing' : track._uploadPhase === 'uploading' ? 'Uploading' : 'Finalizing'}
                                      />
                                    </div>
                                  ) : track.audio_url ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-green-400 flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v2m-6 4v6m3-3h-6" /></svg>
                                        Audio
                                      </span>
                                      <button
                                        onClick={() => audioInputRefs.current[track.id]?.click()}
                                        className="text-[10px] text-[#72727E] hover:text-white transition-colors"
                                      >Replace</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => audioInputRefs.current[track.id]?.click()}
                                      className="flex items-center gap-1.5 text-xs text-[#72727E] hover:text-violet-400 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                      </svg>
                                      Upload Audio
                                    </button>
                                  )}
                                  <input
                                    ref={el => { audioInputRefs.current[track.id] = el; }}
                                    type="file"
                                    accept="audio/*,.mp3,.wav,.flac,.aac,.ogg"
                                    className="hidden"
                                    onChange={e => handleAudioUpload(e, track, r.id)}
                                  />
                                </div>

                                <button
                                  onClick={() => deleteTrack(track.id, r.id)}
                                  className="text-red-400/0 group-hover:text-red-400/70 hover:!text-red-400 text-xs transition-colors flex-shrink-0"
                                >
                                  ✕
                                </button>

                                {isTeaserEligible && (
                                  <button
                                    onClick={() => setTracks(t => ({
                                      ...t,
                                      [r.id]: t[r.id]?.map(tr => tr.id === track.id ? { ...tr, _editingTeaser: !tr._editingTeaser } : tr) || [],
                                    }))}
                                    className="text-xs text-[#72727E] hover:text-[#C97B4A] px-2 py-1 rounded transition-colors flex-shrink-0"
                                  >
                                    {track._editingTeaser ? '▲ Teaser' : '▼ Teaser'}
                                  </button>
                                )}
                                {track.audio_url && (
                                  <button
                                    onClick={() => setTracks(current => ({
                                      ...current,
                                      [r.id]: current[r.id]?.map(item => item.id === track.id ? { ...item, _editingLyrics: !item._editingLyrics, _editingTeaser: false } : item) || [],
                                    }))}
                                    className="text-xs text-[#72727E] hover:text-[#C97B4A] px-2 py-1 rounded transition-colors flex-shrink-0"
                                  >
                                    {track._editingLyrics ? '▲ Lyrics' : '▼ Lyrics'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setTracks(current => ({
                                    ...current,
                                    [r.id]: current[r.id]?.map(item => item.id === track.id ? { ...item, _editingStems: !item._editingStems } : item) || [],
                                  }))}
                                  className="text-[10px] uppercase tracking-wider text-[#72727E] hover:text-[#C97B4A] px-2 py-1 rounded transition-colors flex-shrink-0"
                                >
                                  {track._editingStems ? '▲ Stems' : '▼ Stems'}
                                </button>
                              </div>

                              {track._editingStems && (
                                <div className="ml-4 mt-2 rounded-lg border border-[#C97B4A]/20 bg-[#C97B4A]/5 p-3">
                                  {(() => {
                                    const stemEntries = STEM_OPTIONS.flatMap(({ key, label, Icon }) => {
                                      const path = track.stems?.[key];
                                      return path ? [{ key, label, Icon, path }] : [];
                                    });
                                    if (!stemEntries.length) {
                                      return <p className="text-xs text-[#72727E]">No stems extracted yet. Run the CAM Stem Extractor in Colab.</p>;
                                    }
                                    return (
                                      <div className="space-y-2">
                                        {stemEntries.map(({ key, label, Icon, path }) => (
                                          <div key={key} className="flex flex-wrap items-center gap-3 border-b border-[#C97B4A]/10 pb-2 last:border-b-0 last:pb-0">
                                            <Icon size={16} className="shrink-0 text-[#C97B4A]" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A8A8B3]">{label}</p>
                                              <code className="block break-all font-mono text-xs text-[#72727E]">{path}</code>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                              <button type="button" onClick={() => void copyStemPath(path)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-[#A8A8B3] hover:border-[#C97B4A]/50 hover:text-[#C97B4A]">
                                                <Copy size={13} aria-hidden="true" />Copy path
                                              </button>
                                              <button type="button" onClick={() => void downloadStem(track.id, r.id, key, path)} disabled={Boolean(track._downloadingStem)} className="inline-flex items-center gap-1 rounded border border-[#C97B4A]/30 px-2 py-1 text-xs text-[#C97B4A] hover:bg-[#C97B4A]/10 disabled:cursor-wait disabled:opacity-50">
                                                <Download size={13} aria-hidden="true" />{track._downloadingStem === key ? 'Generating...' : 'Download'}
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}

                              {track._editingTeaser && isTeaserEligible && track.audio_url && (
                                <AudioTeaserEditor
                                  audioUrl={track.audio_url}
                                  trackTitle={track.title}
                                  onSave={(blob, meta) => handleTeaserSave(track.id, r.id, blob, meta)}
                                  onCancel={() => setTracks(t => ({
                                    ...t,
                                    [r.id]: t[r.id]?.map(tr => tr.id === track.id ? { ...tr, _editingTeaser: false } : tr) || [],
                                  }))}
                                />
                              )}

                              {track._editingLyrics && track.audio_url && (
                                <LyricsEditor
                                  audioUrl={track.audio_url}
                                  trackTitle={track.title}
                                  initialLyrics={track.lyrics}
                                  initialSynced={track.lyrics_synced || null}
                                  onSave={(lyrics, synced) => handleLyricsSave(track.id, r.id, lyrics, synced)}
                                  onCancel={() => setTracks(current => ({
                                    ...current,
                                    [r.id]: current[r.id]?.map(item => item.id === track.id ? { ...item, _editingLyrics: false } : item) || [],
                                  }))}
                                />
                              )}

                              {track.teaser_enabled && track.teaser_audio_url && (
                                <div className="ml-4 mt-2 p-3 rounded-lg bg-[#C97B4A]/10 border border-[#C97B4A]/30">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-medium text-[#C97B4A] uppercase">Teaser Active</span>
                                    {track.teaser_label && <span className="text-xs text-[#72727E]">· {track.teaser_label}</span>}
                                  </div>
                                  <p className="text-xs text-[#72727E]">
                                    Range: {Math.round(track.teaser_start_seconds ?? 0)}s – {track.teaser_end_seconds}s
                                  </p>
                                  <button
                                    onClick={() => setTracks(t => ({
                                      ...t,
                                      [r.id]: t[r.id]?.map(tr => tr.id === track.id ? { ...tr, _editingTeaser: true } : tr) || [],
                                    }))}
                                    disabled={track._teaserSaving}
                                    className="text-xs text-[#C97B4A] hover:text-[#D88A5A] transition-colors mt-2 disabled:opacity-50"
                                  >
                                    {track._teaserSaving ? 'Saving...' : 'Re-edit teaser'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="px-5 pb-4 border-t border-white/5 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-wider text-[#72727E]">
                        Streaming Links ({streamingLinks[r.id]?.length || 0})
                      </p>
                      <button
                        onClick={() => startEdit(r)}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        Edit in release settings →
                      </button>
                    </div>
                    {streamingLinks[r.id]?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {streamingLinks[r.id].map(link => (
                          <span key={link.id} className="text-xs glass px-2.5 py-1 rounded-lg text-[#A8A8B3] capitalize">
                            {link.platform.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#52525E]">No links. Click "Edit" above to add streaming links.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {releases.length === 0 && (
            <div className="p-8 text-center text-[#72727E] text-sm">
              No releases yet. Click "+ New Release" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
