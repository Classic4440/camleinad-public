import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import type { GalleryItem, Release } from '@/types';
import { DEFAULT_RECORD_LABEL_NAME, formatDate } from '@/lib/utils';
import { coverUrl, thumbUrl } from '@/lib/imageUrl';

export default function PressPage() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [releases, setReleases] = useState<Release[]>([]);
    const [artistPhoto, setArtistPhoto] = useState<GalleryItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const shortBio = settings.artist_bio_short || 'Cam Leinad is the independent pop project of Daniel Mac, a songwriter born in Uganda. His music moves between pop and easy listening, with lyrics grounded in memory, distance, and change.';
    const longBioParagraphs = useMemo(() => {
        const configured = (settings.artist_bio_full || '').split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
        return configured.length >= 3 ? configured.slice(0, 3) : [
            settings.artist_bio_full || 'Cam Leinad is the artist name of Daniel Mac, a songwriter born in Uganda. The name is “Daniel Mac” reversed, a simple idea that became the identity for his independent music.',
            'His life has taken him from Uganda to the United Kingdom and South Korea. The movement between places informs songs about memory, distance, and finding a sense of home.',
            'His debut single, “How It Starts,” was released in April 2026. The six-track EP “Distant Light” is scheduled for October 26, 2026, with the album “The Confession” in development.',
        ];
    }, [settings.artist_bio_full]);
    const recordLabelName = settings.record_label_name || DEFAULT_RECORD_LABEL_NAME;
    const latestRelease = releases.find(release => release.status === 'RELEASED');
    const contactEmail = settings.contact_email || 'camleinad@outlook.com';

    useEffect(() => {
        let active = true;
        async function load() {
            setLoading(true);
            setLoadError(false);
            const [settingsResult, releasesResult, photoResult] = await Promise.all([
                supabase.from('site_settings').select('key,value').in('key', ['artist_name', 'artist_bio_short', 'artist_bio_full', 'artist_photo_url', 'contact_email', 'record_label_name']),
                supabase.from('releases').select('*').order('release_date', { ascending: false, nullsFirst: false }),
                supabase.from('gallery_items').select('*').eq('is_published', true).eq('category', 'press').order('sort_order').limit(1).maybeSingle(),
            ]);
            if (!active) return;
            if (settingsResult.error || releasesResult.error || photoResult.error) setLoadError(true);
            const map: Record<string, string> = {};
            settingsResult.data?.forEach(row => { map[row.key] = row.value || ''; });
            setSettings(map);
            setReleases(releasesResult.data || []);
            setArtistPhoto(photoResult.data || null);
            setLoading(false);
        }
        void load();
        return () => { active = false; };
    }, [retryCount]);

    function downloadEpk() {
        const pdf = new jsPDF();
        let y = 20;
        const addParagraph = (text: string, size = 11) => {
            pdf.setFontSize(size);
            const lines = pdf.splitTextToSize(text, 170);
            if (y + lines.length * 6 > 275) { pdf.addPage(); y = 20; }
            pdf.text(lines, 20, y);
            y += lines.length * 6 + 5;
        };
        pdf.setFontSize(22);
        pdf.text(settings.artist_name || 'Cam Leinad', 20, y);
        y += 12;
        addParagraph(`${recordLabelName} · Press Kit`, 13);
        addParagraph('Short bio', 15);
        addParagraph(shortBio);
        if (longBioParagraphs.length) {
            addParagraph('Full bio', 15);
            longBioParagraphs.forEach(paragraph => addParagraph(paragraph));
        }
        if (latestRelease) addParagraph(`Latest release: ${latestRelease.title}${latestRelease.release_date ? ` · ${formatDate(latestRelease.release_date)}` : ''}`);
        addParagraph(`Press contact: ${contactEmail}`);
        if (artistPhoto?.image_url) addParagraph(`Artist photo: ${artistPhoto.image_url}`);
        releases.filter(release => release.artwork_url).forEach(release => addParagraph(`${release.title} artwork: ${release.artwork_url}`));
        pdf.save('cam-leinad-epk.pdf');
    }

    if (loading) return <div className="max-w-5xl mx-auto px-4 pt-32"><div className="h-12 w-1/2 rounded skeleton mb-6" /><div className="h-48 rounded-2xl skeleton" /></div>;

    return (
        <PageTransition>
            <main className="editorial-page press-page">
                <section className="press-lead">
                    {artistPhoto?.image_url && <img src={coverUrl(artistPhoto.image_url)} alt={`${settings.artist_name || 'Cam Leinad'} press portrait`} width={800} height={1067} loading="eager" fetchPriority="high" />}
                    <div className="press-lead__copy">
                        <p className="eyebrow">PRESS / BOOKINGS</p>
                        <h1 className="page-title">Electronic<br />Press Kit</h1>
                        <p>{settings.artist_name || 'Cam Leinad'} · {recordLabelName}</p>
                        <button type="button" onClick={downloadEpk} className="text-link"><Download aria-hidden="true" className="w-4 h-4" /> Download EPK PDF</button>
                    </div>
                </section>
                {loadError && <FetchError message="Some press materials could not be loaded. Try again." onRetry={() => setRetryCount(count => count + 1)} />}
                <div className="press-content">
                    <section className="artist-copy">
                        <section><p className="eyebrow">SHORT BIO</p><p>{shortBio}</p></section>
                        <section><p className="eyebrow">FULL BIO</p>{longBioParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
                        <section><p className="eyebrow">MUSIC & ARTWORK</p>{releases.length ? <div className="press-releases">{releases.map(release => <div key={release.id} className="press-release-row">
                            {release.artwork_url ? <img src={thumbUrl(release.artwork_url)} alt={`${release.title} artwork`} width={200} height={200} loading="lazy" /> : <div aria-hidden="true" className="press-release-row__empty" />}
                            <div><h3>{release.title}</h3><p>{release.type} · {release.status}</p></div>
                            {release.artwork_url && <a href={release.artwork_url} target="_blank" rel="noopener noreferrer" className="text-link"><ExternalLink aria-hidden="true" className="w-4 h-4" /> Artwork</a>}
                        </div>)}</div> : <p>No releases are available yet.</p>}</section>
                    </section>
                    <aside className="press-facts">
                        <section><p className="eyebrow">LATEST RELEASE</p>{latestRelease && <><p>{latestRelease.title}</p>{latestRelease.release_date && <p>{formatDate(latestRelease.release_date)}</p>}</>}</section>
                        <section><p className="eyebrow">PRESS BOOKINGS</p><a href={`mailto:${contactEmail}`} className="text-link">{contactEmail}</a></section>
                    </aside>
                </div>
            </main>
        </PageTransition>
    );
}