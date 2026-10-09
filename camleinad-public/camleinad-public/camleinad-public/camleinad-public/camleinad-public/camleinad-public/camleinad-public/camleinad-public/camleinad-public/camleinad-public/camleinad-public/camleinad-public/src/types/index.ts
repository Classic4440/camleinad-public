export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  role?: string;
}

export interface Release {
  id: string;
  slug: string;
  title: string;
  type: 'SINGLE' | 'EP' | 'ALBUM' | 'COMPILATION';
  status: 'DRAFT' | 'IN_DEVELOPMENT' | 'UPCOMING' | 'SCHEDULED' | 'RELEASED' | 'ARCHIVED';
  release_date: string | null;
  artwork_url: string | null;
  description: string | null;
  featured: boolean;
  featured_track_id: string | null;
  show_upcoming_publicly: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tracks?: Track[];
  streaming_links?: StreamingLink[];
}

export interface Track {
  id: string;
  release_id: string;
  track_number: number;
  title: string;
  duration: string | null;
  status: string;
  audio_url: string | null;
  lyrics: string | null;
  lyrics_synced?: Array<{ time: number; line: string }> | null;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
  } | null;
  isrc: string | null;
  credits: Credit[];
  teaser_enabled?: boolean;
  teaser_audio_url?: string | null;
  teaser_start_seconds?: number | null;
  teaser_end_seconds?: number | null;
  teaser_label?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Credit {
  role: string;
  name: string;
}

export interface StreamingLink {
  id: string;
  release_id: string | null;
  track_id: string | null;
  platform: string;
  url: string;
  label: string | null;
}

export interface Video {
  id: string;
  title: string;
  youtube_id: string | null;
  url: string | null;
  thumbnail_url: string | null;
  description: string | null;
  category: string;
  published_at: string | null;
  related_release_id: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

export interface GalleryItem {
  id: string;
  image_url: string;
  title: string | null;
  alt_text: string | null;
  category: string;
  width: number | null;
  height: number | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  cover_url?: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  author: string;
  tags: string[];
  category: string | null;
  related_release_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  release_id: string | null;
  news_id: string | null;
  track_id: string | null;
  parent_comment_id: string | null;
  body: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface Favorite {
  id: string;
  user_id: string;
  release_id: string | null;
  track_id: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  form_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BookingRequest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  event_type: string | null;
  budget: string | null;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SiteSettings {
  [key: string]: string;
}

export interface PlayerTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  audioUrl: string | null;
  releaseSlug: string;
  releaseTitle: string;
  duration?: string;
  lyrics?: string | null;
  syncedLyrics?: Array<{ time: number; line: string }> | null;
}
