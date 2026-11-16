import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SocialLink } from '@/types';
import CamLogo from '@/components/layout/CamLogo';

const FOOTER_SOCIALS = [
  { platform: 'spotify', label: 'Spotify' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'threads', label: 'Threads' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'facebook', label: 'Facebook' },
];

const PLATFORM_ICONS: Record<string, string> = {
  spotify: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  youtube: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  threads: 'M12 2.25c-5.06 0-8.25 3.58-8.25 9.33 0 5.31 3.05 9.17 8.25 9.17 4.51 0 7.5-2.95 7.5-7.27 0-3.84-2.29-6.18-6.1-6.18-2.34 0-4.15 1.22-4.7 3.14-.18.62.18 1.27.8 1.45.62.18 1.27-.18 1.45-.8.28-.97 1.16-1.47 2.45-1.47 2.53 0 3.79 1.29 3.79 3.86 0 3.02-1.95 4.97-5.19 4.97-3.8 0-5.94-2.62-5.94-6.87 0-4.52 2.1-7 5.94-7 2.99 0 4.89 1.29 5.51 3.74.16.63.79 1.01 1.42.85.63-.16 1.01-.79.85-1.42C20.86 4.22 17.48 2.25 12 2.25z',
  soundcloud: 'M1.175 12.225C.511 12.225 0 12.74 0 13.39v.31c0 .66.511 1.17 1.175 1.17.664 0 1.187-.51 1.187-1.17v-.31c0-.65-.523-1.165-1.187-1.165zM5.062 9.16c-.665 0-1.198.535-1.198 1.19v3.35c0 .66.533 1.17 1.198 1.17.664 0 1.198-.51 1.198-1.17v-3.35c0-.655-.534-1.19-1.198-1.19zm3.904-2.49c-.66 0-1.198.535-1.198 1.19v5.84c0 .66.538 1.17 1.198 1.17.664 0 1.198-.51 1.198-1.17V7.86c0-.655-.534-1.19-1.198-1.19zm3.9-1.54c-.66 0-1.2.535-1.2 1.19v7.38c0 .66.54 1.17 1.2 1.17.66 0 1.2-.51 1.2-1.17V6.32c0-.655-.54-1.19-1.2-1.19zm3.9-.8c-.66 0-1.2.535-1.2 1.19v8.18c0 .66.54 1.17 1.2 1.17.66 0 1.2-.51 1.2-1.17V5.52c0-.655-.54-1.19-1.2-1.19zm3.2 2.47c-.23-.06-.47-.09-.71-.09-1.67 0-3.02 1.35-3.02 3.01 0 1.66 1.35 3.01 3.02 3.01 1.67 0 3.02-1.35 3.02-3.01-.01-.72-.26-1.38-.68-1.9z',
  tiktok: 'M19.6 6.2c-1.2-.1-2.2-.7-2.9-1.6-.5-.7-.8-1.5-.8-2.4h-3.3v13.1c0 1.5-1.2 2.7-2.7 2.7s-2.7-1.2-2.7-2.7 1.2-2.7 2.7-2.7c.3 0 .6 0 .9.1V9.3c-.3 0-.6-.1-.9-.1-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6V8.5c1.3.9 2.9 1.5 4.6 1.5V6.7c-.3-.1-.6-.2-.9-.5z',
  facebook: 'M13.4 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.2v3h2.8v8h3.4z',
  audiomack: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.8c3.978 0 7.2 3.222 7.2 7.2S15.978 19.2 12 19.2 4.8 15.978 4.8 12 8.022 4.8 12 4.8z',
};

export default function Footer() {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.from('social_links').select('*').eq('is_active', true).order('sort_order');
      if (!active) return;
      setLoadError(!!error);
      setSocialLinks(data || []);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);


  return (
    <footer className="site-footer">
      <Link to="/" className="site-footer__logo cam-logo-3" aria-label="CAM home">
        <CamLogo className="cam-logo-3--footer" />
      </Link>
      <nav className="site-footer__socials" aria-label="Main navigation">
        <Link to="/" className="text-link">Home</Link>
        <Link to="/music" className="text-link">Music</Link>
        <Link to="/videos" className="text-link">Videos</Link>
        <Link to="/gallery" className="text-link">Gallery</Link>
        <Link to="/news" className="text-link">News</Link>
        <Link to="/fan-wall" className="text-link">Fan Wall</Link>
        <Link to="/press" className="text-link">Press</Link>
        <Link to="/about" className="text-link">About</Link>
        <Link to="/contact" className="text-link">Contact</Link>
        <a href="/minimal/" className="text-link">Minimal view</a>
      </nav>
      <nav className="site-footer__socials" aria-label="Social links">
        {FOOTER_SOCIALS.flatMap(({ platform, label }) => {
          const link = socialLinks.find(item => item.platform.toLowerCase() === platform);
          return link ? [<a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" title={PLATFORM_ICONS[platform] ? `Open CAM’s ${label} profile` : `Open ${label}`} className="text-link">{label}</a>] : [];
        })}
      </nav>
      {loadError && <p role="alert" className="site-footer__error">Couldn’t load some footer details. <button type="button" onClick={() => setRetryCount(count => count + 1)} className="text-link">Retry</button></p>}
      <p className="site-footer__copyright">© 2026 Cam All May (CAM). All rights reserved.</p>
      <p className="site-footer__copyright">Pop. Easy Listening. Made with AI. Built with heart.</p>
    </footer>
  );
}
