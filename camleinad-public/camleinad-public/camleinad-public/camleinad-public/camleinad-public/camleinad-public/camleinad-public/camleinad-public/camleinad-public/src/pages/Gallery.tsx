import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageTransition } from '@/components/motion';
import FetchError from '@/components/ui/FetchError';
import type { GalleryItem } from '@/types';
import { cn, normalizeGalleryCategory } from '@/lib/utils';
import { fullUrl, thumbUrl } from '@/lib/imageUrl';

const CATS = [
  { value: 'All', label: 'All' },
  { value: 'artist', label: 'Artist' },
  { value: 'studio', label: 'Studio' },
  { value: 'process', label: 'Process' },
  { value: 'artwork', label: 'Artwork' },
  { value: 'behind_the_scenes', label: 'Behind the Scenes' },
  { value: 'press', label: 'Press' },
  { value: 'music', label: 'Music' },
];

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [cat, setCat] = useState('All');
  const [active, setActive] = useState<GalleryItem | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase.from('gallery_items').select('*').eq('is_published', true).order('sort_order');
      if (!active) return;
      setLoadError(!!error);
      if (!error) setItems(data || []);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [retryCount]);

  const filtered = cat === 'All' ? items : items.filter(i => normalizeGalleryCategory(i.category) === cat);

  function openItem(item: GalleryItem, i: number) {
    setActive(item);
    setIdx(i);
  }

  function prev() {
    const newIdx = (idx - 1 + filtered.length) % filtered.length;
    setIdx(newIdx);
    setActive(filtered[newIdx]);
  }
  function next() {
    const newIdx = (idx + 1) % filtered.length;
    setIdx(newIdx);
    setActive(filtered[newIdx]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === 'ArrowLeft') {
        const newIdx = (idx - 1 + filtered.length) % filtered.length;
        setIdx(newIdx);
        setActive(filtered[newIdx]);
      }
      if (e.key === 'ArrowRight') {
        const newIdx = (idx + 1) % filtered.length;
        setIdx(newIdx);
        setActive(filtered[newIdx]);
      }
      if (e.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, idx, filtered]);

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="mb-12">
          <p className="eyebrow">CAM LEINAD / ARCHIVE</p>
          <h1 className="page-title">Gallery</h1>
        </div>

        {/* Filter */}
        <div className="editorial-filters" role="group" aria-label="Filter gallery">
          {CATS.map(c => (
            <button
              key={c.value}
              type="button"
              aria-pressed={cat === c.value}
              onClick={() => setCat(c.value)}
              className={cn(
                'editorial-filter',
                cat === c.value && 'is-active'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="gallery-grid">
            {[...Array(8)].map((_, i) => <div key={i} className={cn('rounded-xl skeleton', i % 3 === 0 ? 'aspect-[3/4]' : 'aspect-square')} />)}
          </div>
        ) : loadError ? (
          <FetchError message="Couldn’t load gallery images. Try again." onRetry={() => setRetryCount(count => count + 1)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#72727E] text-lg">No photos yet.</p>
          </div>
        ) : (
          <div className="gallery-grid">
            {filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Open ${item.title || 'gallery image'}`}
                className={`gallery-item gallery-item--${i % 5} cursor-pointer text-left`}
                onClick={() => openItem(item, i)}
              >
                <img
                  src={thumbUrl(item.image_url)}
                  alt={item.alt_text || item.title || 'Cam Leinad gallery image'}
                  width={item.width || 1200}
                  height={item.height || 1200}
                  className="gallery-item__image"
                  loading="lazy"
                />
                {item.title && <span className="gallery-item__caption">{item.title}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {active && (
        <div
          className="gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.title || 'Gallery image'}
          onClick={() => setActive(null)}
        >
          <div
            className="gallery-lightbox__content"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={fullUrl(active.image_url)}
              alt={active.alt_text || active.title || 'Cam Leinad gallery image'}
              width={active.width || 1200}
              height={active.height || 1200}
              className="max-w-full max-h-[80vh] rounded-2xl object-contain mx-auto"
            />
            {active.title && (
              <p className="text-center text-[#A8A8B3] text-sm mt-4">{active.title}</p>
            )}
          </div>
          {/* Nav buttons */}
          <button aria-label="Previous image" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button aria-label="Next image" onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button aria-label="Close gallery image" onClick={() => setActive(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full glass flex items-center justify-center text-[#72727E] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </PageTransition>
  );
}
