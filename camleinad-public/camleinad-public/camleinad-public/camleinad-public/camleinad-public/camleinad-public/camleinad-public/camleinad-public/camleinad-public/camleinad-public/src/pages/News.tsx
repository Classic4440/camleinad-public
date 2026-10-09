import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import type { NewsArticle, SocialLink } from '@/types';
import { formatDate } from '@/lib/utils';

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const [newsResult, socialResult] = await Promise.all([
        supabase.from('news').select('*').eq('is_published', true).order('published_at', { ascending: false }),
        supabase.from('social_links').select('*').eq('is_active', true).order('sort_order'),
      ]);
      if (!active) return;
      setLoadError(!!newsResult.error);
      if (!newsResult.error) setArticles(newsResult.data || []);
      setSocialLinks((socialResult.data || []).filter(link => !['x', 'twitter'].includes(link.platform.toLowerCase())));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-12">
          <p className="eyebrow">CAM LEINAD / NOTES</p>
          <h1 className="page-title">News</h1>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-2xl skeleton" />)}
          </div>
        ) : loadError ? (
          <FetchError message="Couldn’t load news. Try again." onRetry={() => setRetryCount(count => count + 1)} />
        ) : articles.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-[#A8A8B3] text-lg mb-2">No posts yet. Follow CAM on social for updates.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              {socialLinks.map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-link">
                  {link.label || link.platform}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map(article => {
              const cover = (article as NewsArticle & { cover_url?: string | null }).cover_url ?? article.cover_image_url ?? null;
              return (
                <article key={article.id} className="overflow-hidden border border-[var(--rule)] bg-white/25">
                  <Link to={`/news/${article.slug}`} className="block aspect-[16/9] overflow-hidden" aria-label={`Read ${article.title}`}>
                    {cover ? (
                      <img src={cover} alt={`${article.title} article artwork`} width={1280} height={720} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-end bg-[var(--surface)] p-4">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">{article.category || 'Journal'}</span>
                      </div>
                    )}
                  </Link>

                <div className="p-5">
                  {article.category && <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">{article.category}</p>}
                  <h2 className="mb-2 text-xl leading-snug" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                    <Link to={`/news/${article.slug}`} className="hover:text-[var(--accent)]">{article.title}</Link>
                  </h2>
                  {article.excerpt && <p className="mb-4 text-sm leading-relaxed text-[var(--ink-muted)]">{article.excerpt}</p>}
                  <div className="flex items-center justify-between gap-4">
                    <time className="text-xs text-[var(--ink-muted)]" dateTime={article.published_at || undefined}>{formatDate(article.published_at)}</time>
                    <Link to={`/news/${article.slug}`} className="shrink-0 text-sm text-[var(--accent)] hover:underline">Read more →</Link>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
