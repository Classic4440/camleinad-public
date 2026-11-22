import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';

export default function AboutPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadError(false);
      const { data, error } = await supabase.from('site_settings').select('key,value')
        .in('key', ['artist_bio_full', 'artist_story', 'artist_music_text', 'artist_journey', 'artist_future_text', 'ai_human_text', 'artist_name']);
      if (!active) return;
      setLoadError(!!error);
      if (!error) {
        const map: Record<string, string> = {};
        data?.forEach(r => { map[r.key] = r.value || ''; });
        setSettings(map);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  const configuredBio = settings.artist_bio_full?.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean) || [];
  const bioParagraphs = configuredBio.length >= 3 ? configuredBio.slice(0, 3) : [
    settings.artist_bio_full || 'Cam Leinad is the artist name of Muwonge Daniel Mark, born in Uganda and raised across countries including the United Kingdom and South Korea.',
    'His life has taken him from Uganda to the United Kingdom and South Korea. Those changes of place, and the feelings that travel with them, shape the songs.',
    'He writes about memory, distance, uncertainty, and the small decisions that change a life. His released catalog includes the single “How It Starts,” the six-track EP “Distant Light,” and the 13-track debut album “The Confession.”',
  ];

  return (
    <PageTransition>
      <div className="min-h-screen bg-[var(--base)] px-5 pb-24 pt-28 text-[var(--ink)] sm:px-8">
        <main className="mx-auto max-w-[720px]">
          <header className="mb-14">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">ABOUT THE ARTIST</p>
            <h1 className="text-4xl leading-none" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>{settings.artist_name || 'Cam Leinad'}</h1>
          </header>
          {loadError && <FetchError message="Couldn’t load updated artist details. Showing the available bio." onRetry={() => setRetryCount(count => count + 1)} />}
          {loading ? <div className="h-72 rounded-[2px] bg-[var(--card)]/80" aria-label="Loading artist details" /> : (
            <div className="space-y-8">
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">Who is Cam?</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>Who is Cam?</h2>
                <div className="space-y-4 text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
                  {bioParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              </section>
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">The story</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>The story</h2>
                <p className="text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{settings.artist_story || 'Cam Leinad is “Daniel Mac” reversed — literally and musically. It is a name built from the person behind the songs, turned around and made into a stage name.'}</p>
              </section>
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">The label</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>The label</h2>
                <p className="text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cam All May is the independent record label behind Cam Leinad’s releases.</p>
              </section>
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">AI + human creativity</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>AI + human creativity</h2>
                <p className="text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{settings.ai_human_text || 'Cam writes the concepts, shapes the emotions, directs the production, and makes the final creative decisions. AI is one tool in that workflow, like a synthesizer or a drum machine: useful for exploring ideas, but not a replacement for the person choosing what a song means.'}</p>
              </section>
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">The journey</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>The journey</h2>
                <p className="text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{settings.artist_journey || 'The route has been Uganda, the United Kingdom, and South Korea. Moving between places changed what home meant and what memories stayed close. Music became a way to give those experiences a shape.'}</p>
              </section>
              <section className="pt-2">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-muted)]">The catalog</p>
                <h2 className="mb-4 text-3xl leading-none text-[var(--ink)]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>The catalog</h2>
                <p className="text-base leading-7 text-[var(--ink-muted)]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{settings.artist_future_text || 'The catalog is fully released: “How It Starts,” the debut single; “Distant Light,” a six-track EP; and “The Confession,” a 13-track debut album released in November 2026. Released independently on Cam All May.'}</p>
              </section>
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
