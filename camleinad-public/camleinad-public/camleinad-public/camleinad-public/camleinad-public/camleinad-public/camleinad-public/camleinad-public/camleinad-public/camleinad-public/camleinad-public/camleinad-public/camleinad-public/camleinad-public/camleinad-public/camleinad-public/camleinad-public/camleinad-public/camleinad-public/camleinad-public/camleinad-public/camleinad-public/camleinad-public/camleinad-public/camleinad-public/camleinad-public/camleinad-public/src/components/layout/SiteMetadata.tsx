import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_LABEL_SHORT_FORM, DEFAULT_RECORD_LABEL_NAME } from '@/lib/utils';

const SITE_URL = 'https://camleinad.pages.dev';

function titleFromSlug(slug: string) {
  return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function SiteMetadata() {
  const { pathname } = useLocation();
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    supabase.from('site_settings').select('key,value')
      .in('key', ['artist_name', 'record_label_name', 'label_short_form', 'seo_title', 'seo_description'])
      .then(({ data }) => {
        if (!active) return;
        const map: Record<string, string> = {};
        data?.forEach(row => { map[row.key] = row.value || ''; });
        setSettings(map);
      });
    return () => { active = false; };
  }, []);

  const segments = pathname.split('/').filter(Boolean);
  const isRelease = segments[0] === 'music' && segments.length > 1;
  const isArticle = segments[0] === 'news' && segments.length > 1;
  const artistName = settings.artist_name || 'Cam Leinad';
  const recordLabelName = settings.record_label_name || DEFAULT_RECORD_LABEL_NAME;
  const labelShortForm = settings.label_short_form || DEFAULT_LABEL_SHORT_FORM;
  const routeTitle = isRelease || isArticle ? titleFromSlug(segments[1]) : ({
    '/': `${labelShortForm} — ${artistName}`,
    '/music': `Music — ${artistName}`,
    '/about': `About — ${artistName}`,
    '/videos': `Videos — ${artistName}`,
    '/gallery': `Gallery — ${artistName}`,
    '/news': `News — ${artistName}`,
    '/contact': `Contact — ${artistName}`,
    '/auth': `Sign In — ${labelShortForm}`,
  }[pathname] || (pathname.startsWith('/admin') ? `Admin — ${labelShortForm}` : `${artistName} — ${labelShortForm}`));
  const pageTitle = settings.seo_title || (isRelease || isArticle ? `${routeTitle} — ${artistName}` : routeTitle);
  const routeDescription = ({
    '/': `${artistName} — independent pop artist on ${recordLabelName} Records. Debut single 'How It Starts' out now.`,
    '/music': `Explore releases, tracks, and streaming links from ${artistName}.`,
    '/about': `Meet ${artistName}, the artist behind ${labelShortForm} and ${recordLabelName}.`,
    '/videos': `Watch official videos and visual content from ${artistName}.`,
    '/gallery': `Browse artist, studio, process, artwork, and press images from ${artistName}.`,
    '/news': `Read the latest music and artist updates from ${artistName}.`,
    '/contact': `Contact ${artistName} for bookings, press, and collaborations.`,
  }[pathname] || `${routeTitle} by ${artistName}. Released independently on ${recordLabelName}.`);
  const description = pathname === '/' ? routeDescription : settings.seo_description || routeDescription;
  const canonical = `${SITE_URL}${pathname}`;
  const ogTitle = pageTitle.includes(artistName) ? pageTitle : `${pageTitle} — ${artistName}`;
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: recordLabelName,
    alternateName: labelShortForm,
    recordLabel: recordLabelName,
    founder: { '@type': 'Person', name: artistName },
    brand: { '@type': 'Brand', name: labelShortForm },
    url: SITE_URL,
  };

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content={isRelease ? 'music.album' : 'website'} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={description} />
      <script type="application/ld+json">{JSON.stringify(organizationSchema)}</script>
    </Helmet>
  );
}