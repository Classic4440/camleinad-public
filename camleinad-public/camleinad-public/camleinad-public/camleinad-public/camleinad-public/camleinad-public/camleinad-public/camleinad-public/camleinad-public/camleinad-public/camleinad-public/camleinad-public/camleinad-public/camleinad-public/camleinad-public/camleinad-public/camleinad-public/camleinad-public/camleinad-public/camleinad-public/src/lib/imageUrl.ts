export function optimizeImage(url: string | null | undefined): string {
  // Transforms disabled — this project's Supabase plan/config does not support
  // /render/image/ URLs. Return the original public URL so covers render from
  // the database as stored.
  return url || '';
}

export function thumbUrl(url: string | null | undefined): string {
  return optimizeImage(url);
}

export function coverUrl(url: string | null | undefined): string {
  return optimizeImage(url);
}

export function fullUrl(url: string | null | undefined): string {
  return optimizeImage(url);
}