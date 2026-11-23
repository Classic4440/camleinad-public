import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import FetchError from '@/components/ui/FetchError';
import Avatar from '@/components/ui/Avatar';
import type { Message } from '@/types';

interface Stats { releases: number; tracks: number; videos: number; gallery: number; news: number; messages: number; bookings: number; }
interface TopTrack { id: string; title: string; releaseTitle: string; plays: number; }
interface Analytics {
  playsThisWeek: number;
  playsLastWeek: number;
  signupsThisWeek: number;
  activity: Array<{ id: string; kind: string; label: string; createdAt: string }>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ releases: 0, tracks: 0, videos: 0, gallery: 0, news: 0, messages: 0, bookings: 0 });
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [topTracksLoading, setTopTracksLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [analytics, setAnalytics] = useState<Analytics>({ playsThisWeek: 0, playsLastWeek: 0, signupsThisWeek: 0, activity: [] });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(false);
      const counts = await Promise.all([
        supabase.from('releases').select('id', { count: 'exact', head: true }),
        supabase.from('tracks').select('id', { count: 'exact', head: true }),
        supabase.from('videos').select('id', { count: 'exact', head: true }),
        supabase.from('gallery_items').select('id', { count: 'exact', head: true }),
        supabase.from('news').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('booking_requests').select('id', { count: 'exact', head: true }),
      ]);
      if (counts.some(result => result.error)) { setLoadError(true); setLoading(false); return; }
      const [r, t, v, g, n, m, b] = counts;
      setStats({
        releases: r.count || 0, tracks: t.count || 0, videos: v.count || 0,
        gallery: g.count || 0, news: n.count || 0, messages: m.count || 0, bookings: b.count || 0,
      });
      const { data: msgs, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) { setLoadError(true); setLoading(false); return; }
      setRecentMessages(msgs || []);
      const { data: topTrackRows, error: topTracksError } = await supabase.rpc('get_admin_top_tracks');
      if (!topTracksError && topTrackRows?.length) {
        const { data: trackDetails } = await supabase.from('tracks').select('id,title,release_id').in('id', topTrackRows.map(row => row.track_id));
        const trackById = new Map((trackDetails || []).map(track => [track.id, track]));
        const releaseIds = [...new Set((trackDetails || []).map(track => track.release_id))];
        const { data: releaseDetails } = releaseIds.length ? await supabase.from('releases').select('id,title').in('id', releaseIds) : { data: [] };
        const releaseById = new Map((releaseDetails || []).map(release => [release.id, release.title]));
        setTopTracks(topTrackRows.flatMap(row => {
          const track = trackById.get(row.track_id);
          return track ? [{ id: track.id, title: track.title, releaseTitle: releaseById.get(track.release_id) || '', plays: Number(row.play_count) }] : [];
        }));
      }
      setTopTracksLoading(false);
      setLoading(false);
    }
    load();
  }, [retryCount]);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      setAnalyticsLoading(true);
      const now = new Date();
      const startOfThisWeek = new Date(now);
      startOfThisWeek.setHours(0, 0, 0, 0);
      startOfThisWeek.setDate(startOfThisWeek.getDate() - ((startOfThisWeek.getDay() + 6) % 7));
      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
      const startThis = startOfThisWeek.toISOString();
      const startLast = startOfLastWeek.toISOString();

      const [playsThis, playsLast, signups, recentProfiles, recentComments, recentMessages, recentFanPosts] = await Promise.all([
        supabase.from('plays').select('id', { count: 'exact', head: true }).gte('played_at', startThis),
        supabase.from('plays').select('id', { count: 'exact', head: true }).gte('played_at', startLast).lt('played_at', startThis),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startThis),
        supabase.from('profiles').select('id,display_name,username,created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('comments').select('id,body,created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('messages').select('id,subject,name,created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('fan_wall_posts').select('id,body,created_at').order('created_at', { ascending: false }).limit(10),
      ]);
      if (!active) return;

      const activity = [
        ...(recentProfiles.data || []).map(profile => ({ id: `profile-${profile.id}`, kind: 'New user', label: profile.display_name || profile.username || 'New user', createdAt: profile.created_at })),
        ...(recentComments.data || []).map(comment => ({ id: `comment-${comment.id}`, kind: 'New comment', label: comment.body.slice(0, 70), createdAt: comment.created_at })),
        ...(recentMessages.data || []).map(message => ({ id: `message-${message.id}`, kind: 'New message', label: message.subject || message.name, createdAt: message.created_at })),
        ...(recentFanPosts.data || []).map(post => ({ id: `fan-${post.id}`, kind: 'Fan Wall post', label: post.body.slice(0, 70), createdAt: post.created_at })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

      setAnalytics({
        playsThisWeek: playsThis.count || 0,
        playsLastWeek: playsLast.count || 0,
        signupsThisWeek: signups.count || 0,
        activity,
      });
      setAnalyticsLoading(false);
    }
    void loadAnalytics();
    return () => { active = false; };
  }, [retryCount]);

  const playDelta = analytics.playsThisWeek - analytics.playsLastWeek;

  const statCards = [
    { label: 'Releases', value: stats.releases, href: '/admin/releases', color: 'text-violet-400' },
    { label: 'Tracks', value: stats.tracks, href: '/admin/releases', color: 'text-cyan-400' },
    { label: 'Videos', value: stats.videos, href: '/admin/videos', color: 'text-coral-400' },
    { label: 'Gallery', value: stats.gallery, href: '/admin/gallery', color: 'text-green-400' },
    { label: 'News', value: stats.news, href: '/admin/news', color: 'text-amber-400' },
    { label: 'Messages', value: stats.messages, href: '/admin/messages', color: 'text-pink-400' },
    { label: 'Bookings', value: stats.bookings, href: '/admin/messages', color: 'text-blue-400' },
  ];

  const quickLinks = [
    { label: 'Add Release', href: '/admin/releases', desc: 'Create a new release' },
    { label: 'Add News Post', href: '/admin/news', desc: 'Publish an article' },
    { label: 'Edit Site Content', href: '/admin/site-content', desc: 'Update homepage & about' },
    { label: 'View Messages', href: '/admin/messages', desc: 'Check contact forms' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Dashboard</h1>
        <p className="text-[#72727E] text-sm mt-1">Welcome to the CAM admin panel.</p>
      </div>

      {loadError ? (
        <FetchError message="Couldn’t load dashboard data. Try again." onRetry={() => setRetryCount(count => count + 1)} />
      ) : <>
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(card => (
            <Link key={card.label} to={card.href} className="glass rounded-2xl p-5 border border-white/8 hover:border-violet-500/20 transition-colors group">
              <p className={`text-2xl font-bold ${card.color} mb-1`}>
                {loading ? '–' : card.value}
              </p>
              <p className="text-sm text-[#72727E] group-hover:text-[#A8A8B3] transition-colors">{card.label}</p>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickLinks.map(q => (
              <Link key={q.label} to={q.href} className="glass rounded-xl p-4 border border-white/8 hover:border-violet-500/20 transition-colors group">
                <p className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">{q.label}</p>
                <p className="text-xs text-[#72727E] mt-1">{q.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        <section className="mb-8" aria-labelledby="analytics-heading">
          <h2 id="analytics-heading" className="text-base font-semibold text-white mb-4">Overview</h2>
          {analyticsLoading ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[...Array(3)].map((_, index) => <div key={index} className="h-24 rounded-2xl skeleton" />)}</div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass rounded-2xl border border-white/8 p-5"><p className="text-xs uppercase tracking-wider text-[#72727E]">Plays this week</p><p className="text-2xl font-bold text-white mt-2">{analytics.playsThisWeek}</p><p className={`text-xs mt-1 ${playDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{playDelta >= 0 ? '↑' : '↓'} {Math.abs(playDelta)} vs last week</p></div>
            <div className="glass rounded-2xl border border-white/8 p-5"><p className="text-xs uppercase tracking-wider text-[#72727E]">Plays last week</p><p className="text-2xl font-bold text-white mt-2">{analytics.playsLastWeek}</p><p className="text-xs text-[#72727E] mt-1">Based on private play history</p></div>
            <div className="glass rounded-2xl border border-white/8 p-5"><p className="text-xs uppercase tracking-wider text-[#72727E]">Sign-ups this week</p><p className="text-2xl font-bold text-white mt-2">{analytics.signupsThisWeek}</p><p className="text-xs text-[#72727E] mt-1">New profiles created</p></div>
          </div>}
        </section>

        {/* Recent messages */}
        <section className="mb-8" aria-labelledby="top-tracks-heading">
          <h2 id="top-tracks-heading" className="text-base font-semibold text-white mb-4">Top tracks</h2>
          {topTracksLoading ? <div className="space-y-2">{[...Array(3)].map((_, index) => <div key={index} className="h-14 rounded-xl skeleton" />)}</div> : topTracks.length ? (
            <div className="glass rounded-xl border border-white/8 overflow-hidden">
              {topTracks.map((track, index) => <div key={track.id} className={`flex items-center gap-4 px-5 py-3 ${index ? 'border-t border-white/5' : ''}`}>
                <span className="text-xs text-[#72727E] w-5">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-white truncate">{track.title}</p><p className="text-xs text-[#72727E] truncate">{track.releaseTitle}</p></div>
                <span className="text-sm text-[#A8A8B3]">{track.plays} plays</span>
              </div>)}
            </div>
          ) : <div className="glass rounded-xl p-6 text-center text-sm text-[#72727E]">Play data is not available yet.</div>}
        </section>

        <section className="mb-8" aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-base font-semibold text-white mb-4">Recent activity</h2>
          {analyticsLoading ? <div className="space-y-2">{[...Array(4)].map((_, index) => <div key={index} className="h-12 rounded-xl skeleton" />)}</div> : analytics.activity.length ? <div className="glass rounded-xl border border-white/8 overflow-hidden">{analytics.activity.map((item, index) => <div key={item.id} className={`flex items-center gap-4 px-5 py-3 ${index ? 'border-t border-white/5' : ''}`}><span className="text-xs uppercase tracking-wider text-violet-300 w-24">{item.kind}</span><span className="text-sm text-[#A8A8B3] truncate flex-1">{item.label}</span><time dateTime={item.createdAt} className="text-xs text-[#72727E]">{formatDate(item.createdAt)}</time></div>)}</div> : <div className="glass rounded-xl p-6 text-center text-sm text-[#72727E]">No recent activity yet.</div>}
        </section>

        {/* Recent messages */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent Messages</h2>
            <Link to="/admin/messages" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">View all</Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl skeleton" />)}
            </div>
          ) : recentMessages.length === 0 ? (
            <div className="glass rounded-xl p-6 text-center text-[#72727E] text-sm">No messages yet.</div>
          ) : (
            <div className="glass rounded-xl border border-white/8 overflow-hidden">
              {recentMessages.map((m, i) => (
                <div key={m.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar src={null} name={m.name || m.email || '?'} size={28} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{m.name || m.email || '?'}</p>
                      <p className="text-xs text-[#72727E] truncate">{m.subject || m.message?.slice(0, 60)}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'NEW' ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-[#72727E]'}`}>
                        {m.status}
                      </span>
                      <p className="text-xs text-[#72727E] mt-1">{formatDate(m.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}
    </div>
  );
}
