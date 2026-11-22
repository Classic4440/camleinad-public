import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Avatar from '@/components/ui/Avatar';

interface FanWallPost {
    id: string;
    user_id: string;
    track_id: string | null;
    body: string;
    is_hidden: boolean;
    created_at: string;
    profile?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
    track?: { id: string; title: string; release?: { title: string; slug: string } | Array<{ title: string; slug: string }> | null } | null;
}

interface WallTrack {
    id: string;
    title: string;
    release?: { title: string; slug: string } | Array<{ title: string; slug: string }> | null;
}

export default function FanWallPage() {
    const { user, isAdmin } = useAuth();
    const [posts, setPosts] = useState<FanWallPost[]>([]);
    const [tracks, setTracks] = useState<WallTrack[]>([]);
    const [body, setBody] = useState('');
    const [trackId, setTrackId] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let active = true;
        async function load() {
            setLoading(true);
            setLoadError(false);
            const [postsResult, tracksResult] = await Promise.all([
                supabase.from('fan_wall_posts').select('*, profile:profiles!fan_wall_posts_user_id_fkey(username, display_name, avatar_url), track:tracks!fan_wall_posts_track_id_fkey(id,title,release:releases(title,slug))').order('created_at', { ascending: false }).limit(100),
                supabase.from('tracks_public').select('id,title,release:releases(title,slug)').eq('status', 'RELEASED').order('track_number'),
            ]);
            if (!active) return;
            if (postsResult.error) setLoadError(true);
            else setPosts((postsResult.data || []) as FanWallPost[]);
            setTracks((tracksResult.data || []) as WallTrack[]);
            setLoading(false);
        }
        void load();
        return () => { active = false; };
    }, [retryCount]);

    async function submitPost(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!user || !body.trim() || submitting) return;
        setSubmitting(true);
        const { error } = await supabase.from('fan_wall_posts').insert({ user_id: user.id, track_id: trackId || null, body: body.trim() });
        setSubmitting(false);
        if (error) {
            toast.error(error.message.includes('one post per user per hour') ? 'You can post once per hour. Try again later.' : 'Could not publish your post. Try again.');
            return;
        }
        setBody('');
        setTrackId('');
        toast.success('Your post is up.');
        setRetryCount(count => count + 1);
    }

    async function toggleHidden(post: FanWallPost) {
        if (!isAdmin) return;
        const { error } = await supabase.from('fan_wall_posts').update({ is_hidden: !post.is_hidden }).eq('id', post.id);
        if (error) { toast.error('Could not update this post.'); return; }
        setPosts(current => current.map(item => item.id === post.id ? { ...item, is_hidden: !item.is_hidden } : item));
    }

    async function deletePost(postId: string) {
        if (!isAdmin) return;
        const { error } = await supabase.from('fan_wall_posts').delete().eq('id', postId);
        if (error) { toast.error('Could not delete this post.'); return; }
        setPosts(current => current.filter(post => post.id !== postId));
    }

    return (
        <PageTransition>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
                <div className="mb-10"><p className="text-xs uppercase tracking-[0.3em] text-violet-400 mb-3">Community</p><h1 className="text-4xl sm:text-5xl font-bold text-white">Fan Wall</h1><p className="text-[#A8A8B3] mt-4 max-w-2xl">A place for listeners to share what they’re hearing, what they love, and what they’re waiting for next.</p></div>

                {user ? <form onSubmit={submitPost} className="glass rounded-2xl border border-white/10 p-5 sm:p-6 mb-10 space-y-4">
                    <div><label htmlFor="fan-wall-message" className="block text-xs uppercase tracking-wider text-[#72727E] mb-2">Your message</label><textarea id="fan-wall-message" value={body} onChange={event => setBody(event.target.value)} rows={4} maxLength={500} placeholder="Say something about the music..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm resize-none focus:outline-none focus:border-violet-500/50" /></div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><label htmlFor="fan-wall-track" className="sr-only">Optional track</label><select id="fan-wall-track" value={trackId} onChange={event => setTrackId(event.target.value)} className="w-full sm:max-w-xs bg-[#14141D] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50"><option value="">Optional: link a track</option>{tracks.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</select><button type="submit" disabled={!body.trim() || submitting} className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40">{submitting ? <><LoadingSpinner /> Posting...</> : 'Post'}</button></div>
                </form> : <div className="glass rounded-2xl border border-white/10 p-6 mb-10"><p className="text-sm text-[#A8A8B3]">Sign in to post on the Fan Wall.</p><Link to="/auth" className="inline-flex mt-3 text-sm text-violet-300 hover:text-white">Go to sign in</Link></div>}

                {loading ? <div className="space-y-4">{[...Array(4)].map((_, index) => <div key={index} className="h-28 rounded-xl skeleton" />)}</div> : loadError ? <FetchError message="Couldn’t load the Fan Wall. Try again." onRetry={() => setRetryCount(count => count + 1)} /> : posts.length > 0 ? <div className="space-y-4">{posts.map(post => {
                    const displayName = post.profile?.display_name || post.profile?.username || 'CAM fan';
                    const linkedRelease = Array.isArray(post.track?.release) ? post.track.release[0] : post.track?.release;
                    return <article key={post.id} className={`glass rounded-xl border p-5 ${post.is_hidden ? 'border-amber-400/30 opacity-70' : 'border-white/10'}`}>
                        <div className="flex items-start gap-3">
                            <Avatar src={post.profile?.avatar_url} name={displayName} size={40} />
                            <div className="flex-1 min-w-0"><div className="flex flex-wrap items-baseline gap-x-2"><span className="text-sm font-semibold text-white">{displayName}</span><time className="text-xs text-[#72727E]">{new Date(post.created_at).toLocaleString()}</time></div>{post.track && <Link to={linkedRelease?.slug ? `/music/${linkedRelease.slug}` : '/music'} className="mt-2 inline-block text-xs text-violet-300 hover:text-white">{post.track.title}{linkedRelease?.title ? ` · ${linkedRelease.title}` : ''}</Link>}<p className="text-sm text-[#A8A8B3] mt-2 whitespace-pre-wrap">{post.body}</p></div>
                            {isAdmin && <div className="flex gap-2 shrink-0"><button type="button" onClick={() => void toggleHidden(post)} className="text-xs text-amber-200 hover:text-white">{post.is_hidden ? 'Show' : 'Hide'}</button><button type="button" onClick={() => void deletePost(post.id)} className="text-xs text-red-300 hover:text-white">Delete</button></div>}
                        </div>
                    </article>;
                })}</div> : <div className="glass rounded-2xl border border-white/10 p-10 text-center"><MessageCircle aria-hidden="true" className="w-8 h-8 mx-auto mb-3 text-[#72727E]" /><p className="text-sm text-[#A8A8B3]">No posts yet. Be the first to share a thought.</p></div>}
            </div>
        </PageTransition>
    );
}
