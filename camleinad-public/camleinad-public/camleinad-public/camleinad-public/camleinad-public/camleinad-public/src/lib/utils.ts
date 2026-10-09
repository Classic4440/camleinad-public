import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const DEFAULT_RECORD_LABEL_NAME = 'Cam All May';
export const DEFAULT_LABEL_SHORT_FORM = 'CAM';
export const CAM_TAGLINE = 'Pop. Easy Listening.';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AUDIO_STORAGE_BASE_URL = 'https://wptaddzloshnaecnrfyv.supabase.co/storage/v1/object/public/';

export function getAudioUrl(audioUrl: string | null | undefined): string | null {
  if (!audioUrl) return null;
  return audioUrl.startsWith('http') ? audioUrl : `${AUDIO_STORAGE_BASE_URL}${audioUrl.replace(/^\/+/, '')}`;
}

export function normalizeGalleryCategory(category: string): string {
  const normalized = category.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'album_artwork' ? 'artwork' : normalized;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    RELEASED: 'Released',
    UPCOMING: 'Coming Soon',
    IN_DEVELOPMENT: 'In Development',
    SCHEDULED: 'Scheduled',
    DRAFT: 'Draft',
    ARCHIVED: 'Archived',
  };
  return map[status] || status;
}

export function getStatusClass(status: string): string {
  switch (status) {
    case 'RELEASED': return 'status-released';
    case 'UPCOMING':
    case 'SCHEDULED': return 'status-upcoming';
    case 'IN_DEVELOPMENT': return 'status-development';
    default: return 'status-draft';
  }
}

export function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    SINGLE: 'Single',
    EP: 'EP',
    ALBUM: 'Album',
    COMPILATION: 'Compilation',
  };
  return map[type] || type;
}

export function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    spotify: '🎵',
    apple_music: '🎵',
    youtube: '▶',
    youtube_music: '🎵',
    soundcloud: '☁',
    audiomack: '🎶',
    instagram: '📷',
    facebook: '📘',
    tiktok: '🎵',
  };
  return icons[platform.toLowerCase()] || '🔗';
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}
