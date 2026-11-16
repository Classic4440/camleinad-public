import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import { useAuth } from '@/contexts/AuthContext';
import type { NewsArticle, Comment } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Avatar from '@/components/ui/Avatar';

export default function NewsDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!slug) return;
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase.from('news').select('*').eq('slug', slug).eq('is_published', true).single();
      if (!active) return;
      if (error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setArticle(data);
      if (data) {
        const { data: commentData, error: commentError } = await supabase.from('comments')
          .select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)')
          .eq('news_id', data.id).eq('is_hidden', false).order('created_at');
        if (!active) return;
        if (commentError) setLoadError(true);
        else setComments(commentData || []);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [slug, retryCount]);

  async function submitComment() {
    if (!user || !article || !commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    const { data, error } = await supabase.from('comments')
      .insert({ user_id: user.id, news_id: article.id, body: commentText.trim() })
      .select('*, profile:profiles!comments_user_id_profiles_fkey(username, display_name, avatar_url)').single();
    setCommentSubmitting(false);
    if (error) { toast.error('Could not post your comment. Try again.'); return; }
    if (data) { setComments(c => [...c, data]); setCommentText(''); }
  }

  if (loading) return <div className="pt-28 flex justify-center items-center min-h-screen"><div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /></div>;
  if (loadError) return <div className="pt-28 max-w-3xl mx-auto px-4"><FetchError message="Couldn’t load this article. Try again." onRetry={() => setRetryCount(count => count + 1)} /></div>;
  if (!article) return (
    <div className="pt-28 text-center py-20">
      <p className="text-[#72727E] mb-4">This post doesn&apos;t exist.</p>
      <Link to="/news" className="text-[var(--accent)] hover:underline">← Back to News</Link>
    </div>
  );

  const cover = article.cover_url || article.cover_image_url;

  return (
    <PageTransition>
      <div className="editorial-page editorial-page--reading">
        <Link to="/news" className="inline-flex items-center gap-2 text-sm text-[#72727E] hover:text-[var(--accent)] transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to News
        </Link>

        {article.category && <p className="eyebrow">{article.category}</p>}
        <time className="mb-3 block text-sm text-[var(--ink-muted)]" dateTime={article.published_at || undefined}>{formatDate(article.published_at)}</time>
        <h1 className="reading-title">
          {article.title}
        </h1>
        <div className="news-detail__byline">
          <span>{article.author}</span>
        </div>

        {cover && (
          <img src={cover} alt={`${article.title} article artwork`} width={1280} height={720} loading="lazy" className="news-detail__cover aspect-[16/9] w-full object-cover" />
        )}

        {article.body && (
          <div className="reading-copy">
            {article.body.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">{paragraph}</p>
            ))}
          </div>
        )}

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-8">
            {article.tags.map(tag => (
              <span key={tag} className="news-detail__tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Comments */}
        <div className="mt-12 border-t border-white/5 pt-10">
          <h2 className="text-xl font-semibold text-white mb-6">Comments</h2>
          {user ? (
            <div className="flex gap-4 mb-8">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm resize-none focus:outline-none focus:border-violet-500/50"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || commentSubmitting}
                className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium self-end transition-colors disabled:opacity-40"
              >
                <span className="flex items-center gap-2">{commentSubmitting && <LoadingSpinner />}{commentSubmitting ? 'Posting…' : 'Post'}</span>
              </button>
            </div>
          ) : (
            <p className="text-[#72727E] text-sm mb-6">
              <Link to="/auth" className="text-violet-400 hover:text-violet-300">Sign in</Link> to leave a comment.
            </p>
          )}
          {comments.length === 0 ? (
            <p className="text-[#72727E] text-sm">No comments yet.</p>
          ) : (
            <div className="space-y-4">
              {comments.map(c => (
                <div key={c.id} className="news-comment">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar src={c.profile?.avatar_url} name={c.profile?.display_name || c.profile?.username} size={28} />
                    <span className="text-sm font-medium text-white">{c.profile?.display_name || c.profile?.username || 'Anonymous'}</span>
                    <time className="text-xs text-[#72727E]" dateTime={c.created_at}>{new Date(c.created_at).toLocaleDateString()}</time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[#A8A8B3]">{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 border-t border-[var(--rule)] pt-6">
          <Link to="/news" className="text-sm text-[var(--accent)] hover:underline">← Back to all posts</Link>
        </div>
      </div>
    </PageTransition>
  );
}
