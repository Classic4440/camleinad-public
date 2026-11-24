import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class SupabaseConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

export function createAdminSupabaseClient(env: SupabaseEnv): SupabaseClient {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) throw new SupabaseConfigError('Missing required Cloudflare environment binding: SUPABASE_URL');
  if (!serviceRoleKey) throw new SupabaseConfigError('Missing required Cloudflare environment binding: SUPABASE_SERVICE_ROLE_KEY');

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { throw new SupabaseConfigError('Invalid SUPABASE_URL binding'); }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') throw new SupabaseConfigError('Invalid SUPABASE_URL protocol');

  try {
    return createClient(parsedUrl.toString().replace(/\/$/, ''), serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown client initialization error';
    throw new SupabaseConfigError(`Failed to initialize Supabase client: ${detail}`);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
