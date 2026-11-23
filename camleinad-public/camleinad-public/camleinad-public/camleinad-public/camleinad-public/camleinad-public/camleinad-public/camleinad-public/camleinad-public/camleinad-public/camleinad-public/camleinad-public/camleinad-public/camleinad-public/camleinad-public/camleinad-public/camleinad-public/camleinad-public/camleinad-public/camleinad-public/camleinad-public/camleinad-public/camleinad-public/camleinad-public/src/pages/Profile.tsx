import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, ImagePlus, Play, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Avatar from '@/components/ui/Avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpload } from '@/lib/useUpload';
import { getAudioUrl } from '@/lib/utils';
import { thumbUrl } from '@/lib/imageUrl';
import type { Comment, Profile, Release, Track } from '@/types';

interface FavoriteRow {
    track_id: string | null;
}

interface ProfileComment extends Comment {
    targetTitle: string;
    targetUrl: string;
}

const STEMS = [
    { key: 'vocals', label: 'Vocals' },
    { key: 'drums', label: 'Drums' },
    { key: 'bass', label: 'Bass' },
    { key: 'other', label: 'Other' },
] as const;

export default function ProfilePage() {
    const { user, loading: authLoading, isAdmin, refreshProfile } = useAuth();
    const { playTrack } = usePlayer();
    const { upload, progress: uploadProgress, status: uploadStatus } = useUpload();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
    const [favoriteReleases, setFavoriteReleases] = useState<Record<string, Release>>({});
    const [comments, setComments] = useState<ProfileComment[]>([]);
    const [stemTracks, setStemTracks] = useState<Track[]>([]);
    const [activeTab, setActiveTab] = useState<'favorites' | 'comments' | 'stems'>('favorites');
    const [editOpen, setEditOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloadingStem, setDownloadingStem] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '' });

    useEffect(() => {
        if (!user) return;
        let active = true;
        async function load() {
            setLoading(true);
            setLoadError(false);
            const [profileResult, favoritesResult, commentsResult, adminTracksResult] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', user!.id).maybeSingle(),
                supabase.from('favorites').select('track_id').eq('user_id', user!.id).not('track_id', 'is', null).order('created_at', { ascending: false }),
                supabase.from('comments').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
                isAdmin ? supabase.from('tracks').select('*') : Promise.resolve({ data: [], error: null }),
            ]);
            if (!active) return;
            if (profileResult.error || favoritesResult.error || commentsResult.error || adminTracksResult.error) {
                setLoadError(true);
                setLoading(false);
                return;
            }

            const userProfile = profileResult.data as Profile | null;
            const userComments = (commentsResult.data || []) as Comment[];
            const favorites = (favoritesResult.data || []) as FavoriteRow[];
            const stems = ((adminTracksResult.data || []) as Track[]).filter(track =>
                STEMS.some(({ key }) => Boolean(track.stems?.[key]))
            );
            setProfile(userProfile);
            setForm({
                displayName: userProfile?.display_name || userProfile?.username || user.username,
                bio: userProfile?.bio || '',
                avatarUrl: userProfile?.avatar_url || user.avatar || '',
            });
            setStemTracks(stems);

            const trackIds = [...new Set([
                ...favorites.map(favorite => favorite.track_id).filter((id): id is string => !!id),
                ...userComments.map(comment => comment.track_id).filter((id): id is string => !!id),
                ...stems.map(track => track.id),
            ])];
            const newsIds = [...new Set(userComments.map(comment => comment.news_id).filter((id): id is string => !!id))];
            const releaseIdsFromComments = userComments.map(comment => comment.release_id).filter((id): id is string => !!id);
            const [tracksResult, newsResult] = await Promise.all([
                trackIds.length ? supabase.from(isAdmin ? 'tracks' : 'tracks_public').select('*').in('id', trackIds) : Promise.resolve({ data: [], error: null }),
                newsIds.length ? supabase.from('news').select('id,title,slug').in('id', newsIds) : Promise.resolve({ data: [], error: null }),
            ]);
            if (!active) return;
            if (tracksResult.error || newsResult.error) {
                setLoadError(true);
                setLoading(false);
                return;
            }
            const resolvedTracks = (tracksResult.data || []) as Track[];
            const releaseIds = [...new Set([
                ...releaseIdsFromComments,
                ...resolvedTracks.map(track => track.release_id),
            ])];
            const releasesResult = releaseIds.length
                ? await supabase.from('releases').select('id,title,slug,artwork_url').in('id', releaseIds)
                : { data: [], error: null };
            if (!active) return;
            if (releasesResult.error) { setLoadError(true); setLoading(false); return; }

            const releaseMap = Object.fromEntries((releasesResult.data || []).map(release => [release.id, release as Release]));
            const trackMap = Object.fromEntries(resolvedTracks.map(track => [track.id, track]));
            const newsMap = Object.fromEntries((newsResult.data || []).map(article => [article.id, article]));
            const favoriteIds = new Set(favorites.map(favorite => favorite.track_id).filter((id): id is string => !!id));
            setFavoriteTracks(resolvedTracks.filter(track => favoriteIds.has(track.id)));
            setFavoriteReleases(releaseMap);
            setComments(userComments.map(comment => {
                const track = comment.track_id ? trackMap[comment.track_id] : undefined;
                const release = track?.release_id ? releaseMap[track.release_id] : comment.release_id ? releaseMap[comment.release_id] : undefined;
                const article = comment.news_id ? newsMap[comment.news_id] : undefined;
                return {
                    ...comment,
                    targetTitle: track?.title || release?.title || article?.title || 'Comment',
                    targetUrl: release?.slug ? `/music/${release.slug}` : article?.slug ? `/news/${article.slug}` : '/music',
                };
            }));
            setLoading(false);
        }
        void load();
        return () => { active = false; };
    }, [isAdmin, retryCount, user]);

    useEffect(() => {
        if (!isAdmin && activeTab === 'stems') setActiveTab('favorites');
    }, [activeTab, isAdmin]);

    async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        const { data, error } = await supabase.from('profiles').upsert({
            id: user.id,
            username: profile?.username || user.username,
            display_name: form.displayName.trim(),
            avatar_url: form.avatarUrl.trim() || null,
            bio: form.bio.trim() || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' }).select('*').single();
        setSaving(false);
        if (error) { toast.error('Could not save your profile. Try again.'); return; }
        setProfile(data as Profile);
        setEditOpen(false);
        toast.success('Profile updated.');
    }

    async function uploadAvatar(file?: File) {
        if (!file || !user) return;
        const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
        let publicUrl: string;
        try {
            const result = await upload({
                bucket: 'avatars',
                path: `${user.id}/${Date.now()}.${extension}`,
                file,
                contentType: file.type || 'image/jpeg',
            });
            publicUrl = result.publicUrl;
        } catch (error) {
            console.error('[AvatarUpload] Failed:', error);
            toast.error('Could not upload your avatar. Try again.');
            return;
        }

        const { data, error: updateError } = await supabase.from('profiles').upsert({
            id: user.id,
            username: profile?.username || user.username,
            display_name: profile?.display_name || form.displayName.trim() || user.username,
            avatar_url: publicUrl,
            bio: profile?.bio || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' }).select('*').single();
        if (updateError) {
            console.error('[AvatarUpload] DB update failed:', updateError);
            toast.error('Upload succeeded but profile save failed');
            return;
        }
        setForm(current => ({ ...current, avatarUrl: publicUrl }));
        setProfile(data as Profile);
        await refreshProfile();
        toast.success('Avatar updated.');
    }

    function playFavorite(track: Track) {
        if (!track.audio_url) { toast.error('Audio is not available for this track yet.'); return; }
        const queue = favoriteTracks.filter(item => !!item.audio_url).map(item => {
            const release = favoriteReleases[item.release_id];
            return {
                id: item.id,
                title: item.title,
                artist: 'Cam Leinad',
                artwork: release?.artwork_url || null,
                audioUrl: getAudioUrl(item.audio_url),
                releaseSlug: release?.slug || '',
                releaseTitle: release?.title || '',
                duration: item.duration || undefined,
                lyrics: item.lyrics,
                syncedLyrics: item.lyrics_synced,
            };
        });
        const selected = queue.find(item => item.id === track.id);
        if (selected) playTrack(selected, queue);
    }

    async function downloadStem(path: string) {
        setDownloadingStem(path);
        try {
            const { data, error } = await supabase.storage.from('stems').createSignedUrl(path, 3600);
            if (error || !data?.signedUrl) throw error || new Error('Missing download URL');
            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        } catch {
            toast.error('Could not generate download link.');
        } finally {
            setDownloadingStem(null);
        }
    }

    if (authLoading) return <div className="min-h-screen pt-28 flex justify-center"><div className="w-8 h-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" /></div>;
    if (!user) return <Navigate to="/auth" replace />;

    const displayName = profile?.display_name || profile?.username || user.username;
    const memberSince = profile?.created_at
        ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
        : 'Recently';
    const isUploading = ['preparing', 'uploading', 'finalizing'].includes(uploadStatus);
    const tabs: Array<'favorites' | 'comments' | 'stems'> = isAdmin
        ? ['favorites', 'comments', 'stems']
        : ['favorites', 'comments'];

    return (
        <PageTransition>
            <main className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
                {loading ? <div className="space-y-4"><div className="h-40 skeleton" /><div className="h-48 skeleton" /></div> : loadError ? (
                    <FetchError message="Couldn’t load your profile. Try again." onRetry={() => setRetryCount(count => count + 1)} />
                ) : <>
                    <header className="flex flex-col gap-6 border-b border-[var(--rule)] pb-8 sm:flex-row sm:items-center">
                        <Avatar src={form.avatarUrl} name={displayName} size={96} />
                        <div className="min-w-0 flex-1">
                            <h1 className="font-display text-2xl text-[var(--ink)]">{displayName}</h1>
                            <p className="mt-1 text-xs uppercase tracking-wider text-[var(--ink-muted)]">@{profile?.username || user.username}</p>
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">Member since {memberSince}</p>
                            {profile?.bio && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-[var(--ink)]">{profile.bio}</p>}
                        </div>
                        <button type="button" onClick={() => setEditOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--rule)] px-4 text-sm text-[var(--ink)] transition-colors hover:border-[var(--accent)]">Edit profile</button>
                    </header>

                    <Dialog open={editOpen} onOpenChange={setEditOpen}>
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                            <DialogHeader><DialogTitle className="font-display text-2xl">Edit profile</DialogTitle></DialogHeader>
                            <form onSubmit={saveProfile} className="space-y-5">
                                <div>
                                    <label htmlFor="profile-display-name" className="mb-2 block text-xs uppercase text-[var(--ink-muted)]">Display name</label>
                                    <input id="profile-display-name" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} maxLength={80} className="w-full border border-[var(--rule)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]" />
                                </div>
                                <div>
                                    <label htmlFor="profile-bio" className="mb-2 block text-xs uppercase text-[var(--ink-muted)]">Bio</label>
                                    <textarea id="profile-bio" value={form.bio} onChange={event => setForm(current => ({ ...current, bio: event.target.value.slice(0, 200) }))} rows={4} maxLength={200} className="w-full resize-y border border-[var(--rule)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]" />
                                    <p className="mt-1 text-right text-xs text-[var(--ink-muted)]">{form.bio.length}/200</p>
                                </div>
                                <div>
                                    <label htmlFor="profile-avatar-upload" className="mb-2 block text-xs uppercase text-[var(--ink-muted)]">Avatar</label>
                                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-[var(--rule)] px-3 text-sm text-[var(--ink)] hover:border-[var(--accent)]">
                                        <ImagePlus aria-hidden="true" className="h-4 w-4" /> Upload image
                                        <input id="profile-avatar-upload" type="file" accept="image/*" className="sr-only" disabled={isUploading} onChange={event => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                                    </label>
                                    {isUploading && <div className="mt-3" role="status" aria-live="polite"><div className="mb-1 flex justify-between text-xs text-[var(--ink-muted)]"><span>Uploading avatar</span><span>{Math.round(uploadProgress)}%</span></div><progress className="h-1 w-full accent-[var(--accent)]" max={100} value={uploadProgress} /></div>}
                                </div>
                                <div className="flex justify-end gap-3 border-t border-[var(--rule)] pt-4">
                                    <button type="button" onClick={() => setEditOpen(false)} className="inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[var(--ink-muted)]"><X aria-hidden="true" className="h-4 w-4" /> Cancel</button>
                                    <button type="submit" disabled={saving || isUploading} className="inline-flex min-h-11 items-center gap-2 bg-[var(--accent)] px-4 text-sm font-medium text-[var(--base)] disabled:opacity-50">{saving && <LoadingSpinner />}{saving ? 'Saving...' : 'Save profile'}</button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <div className="mt-8 border-b border-[var(--rule)]" role="tablist" aria-label="Profile sections">
                        {tabs.map(tab => (
                            <button key={tab} type="button" role="tab" id={`profile-tab-${tab}`} aria-selected={activeTab === tab} aria-controls={`profile-panel-${tab}`} onClick={() => setActiveTab(tab)} className={`mr-6 min-h-12 border-b-2 px-1 text-sm capitalize transition-colors ${activeTab === tab ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                                {tab}
                            </button>
                        ))}
                    </div>

                    <section role="tabpanel" id={`profile-panel-${activeTab}`} aria-labelledby={`profile-tab-${activeTab}`} className="pt-7">
                        {activeTab === 'favorites' && (favoriteTracks.length ? (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {favoriteTracks.map(track => {
                                    const artwork = favoriteReleases[track.release_id]?.artwork_url;
                                    return <article key={track.id} className="min-w-0">
                                        {artwork ? <img src={thumbUrl(artwork)} alt={`${track.title} cover`} width={320} height={320} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-[var(--surface)] text-3xl text-[var(--accent)]">♪</div>}
                                        <div className="flex items-center gap-2 pt-3">
                                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[var(--ink)]">{track.title}</p><p className="truncate text-xs text-[var(--ink-muted)]">{favoriteReleases[track.release_id]?.title || 'Unknown release'}</p></div>
                                            <button type="button" onClick={() => playFavorite(track)} disabled={!track.audio_url} aria-label={`Play ${track.title}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--rule)] text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-40"><Play aria-hidden="true" className="h-4 w-4 fill-current" /></button>
                                        </div>
                                    </article>;
                                })}
                            </div>
                        ) : <p className="py-10 text-center text-sm text-[var(--ink-muted)]">Tap the heart on any track to save it here.</p>)}

                        {activeTab === 'comments' && (comments.length ? (
                            <div className="divide-y divide-[var(--rule)]">
                                {comments.map(comment => <article key={comment.id} className="py-5 first:pt-0">
                                    <p className="text-xs text-[var(--ink-muted)]"><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleDateString()}</time> · <Link to={comment.targetUrl} className="text-[var(--accent)] hover:underline">{comment.targetTitle}</Link></p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{comment.body}</p>
                                </article>)}
                            </div>
                        ) : <p className="py-10 text-center text-sm text-[var(--ink-muted)]">Join the conversation. Comment on a track or a news post.</p>)}

                        {activeTab === 'stems' && isAdmin && <div className="divide-y divide-[var(--rule)]">
                            {stemTracks.length ? stemTracks.map(track => {
                                const release = favoriteReleases[track.release_id];
                                const availableStems = STEMS.filter(({ key }) => Boolean(track.stems?.[key]));
                                return <article key={track.id} className="py-5 first:pt-0">
                                    <div className="mb-3"><h2 className="font-display text-xl text-[var(--ink)]">{track.title}</h2><p className="text-xs text-[var(--ink-muted)]">{release?.title || 'Release'}</p></div>
                                    <div className="flex flex-wrap gap-2">{availableStems.map(({ key, label }) => {
                                        const path = track.stems?.[key];
                                        if (!path) return null;
                                        return <button key={key} type="button" onClick={() => void downloadStem(path)} disabled={downloadingStem === path} className="inline-flex min-h-10 items-center gap-2 border border-[var(--rule)] px-3 text-sm text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50">
                                            {downloadingStem === path ? <LoadingSpinner /> : <Download aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />}{label}
                                        </button>;
                                    })}</div>
                                </article>;
                            }) : <p className="py-10 text-center text-sm text-[var(--ink-muted)]">No tracks have stems yet.</p>}
                        </div>}
                    </section>
                </>}
            </main>
        </PageTransition>
    );
}